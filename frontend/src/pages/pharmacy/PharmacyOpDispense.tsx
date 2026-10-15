import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Modal } from "../../components/ui";
import PatientSearchPicker from "../../components/PatientSearchPicker";
import PatientIdentityBanner from "../../components/PatientIdentityBanner";
import { apiFetch, reportError } from "../../lib/api";
import type { Notice, Patient } from "../../types";
import { printViaIframe } from "../../lib/printViaIframe";
import { buildPrintDocumentHtml, buildPrintLabelsHtml } from "../../lib/printTemplates";
import { downloadCsv } from "../../lib/csvExport";
import { pharmacyHeaderLines, usePharmacySettings } from "../../lib/pharmacySettings";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate: (pageId: string) => void;
};

type StockBatch = {
  id: number;
  medicine_id?: number;
  medicine_name: string;
  generic_name?: string;
  batch_no: string;
  mfg_date?: string;
  expiry_date?: string;
  qty_available: number;
  unit_price: number;
  mrp?: number;
  stock_source: "CASH" | "INSURANCE";
  gst_rate?: number | null;
  /** Medicine master GST (falls back to the rate recorded on the batch at GRN). */
  effective_gst_rate?: number | null;
  master_generic_name?: string | null;
  storage_location?: string | null;
};

type CartItem = {
  batch_id: number;
  medicine_id?: number;
  medicine_name: string;
  generic_name?: string;
  batch_no: string;
  expiry_date?: string;
  available_qty: number;
  quantity: number;
  unit_price: number;
  mrp: number;
  discount_percent: number;
  gst_rate: number;
  stock_source: "CASH" | "INSURANCE";
};

type DispenseResult = {
  invoice_id?: number;
  invoice_no?: string;
  sale_ids?: number[];
  total_amount: number;
  stock_source: string;
};

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isExpiredBatch(expiryDate?: string): boolean {
  return !!expiryDate && expiryDate.slice(0, 10) < localDateKey();
}

function matchesMedicineBatch(batch: StockBatch, query: string): boolean {
  return (batch.medicine_name || "").toLowerCase().includes(query) ||
    (batch.generic_name || "").toLowerCase().includes(query) ||
    (batch.batch_no || "").toLowerCase().includes(query);
}

export default function PharmacyOpDispense({ setNotice, onNavigate }: Props) {
  // Tabs: Dispense vs Returns
  const [activeTab, setActiveTab] = useState<"dispense" | "returns" | "history">("dispense");
  const pharmacySettings = usePharmacySettings();
  const [dispenseHistory, setDispenseHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyDate, setHistoryDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [historySearch, setHistorySearch] = useState("");

  // Patient Selection
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Stock Batches cache
  const [allBatches, setAllBatches] = useState<StockBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Medicine Search & Barcode
  const [searchMedQuery, setSearchMedQuery] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<StockBatch | null>(null);
  const [addQuantity, setAddQuantity] = useState<string>("");
  const [showMedDropdown, setShowMedDropdown] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<string>("cash");
  const [dispenseStockSource, setDispenseStockSource] = useState<"CASH" | "INSURANCE">("CASH");

  // Processing state
  const [submitting, setSubmitting] = useState(false);
  const [dispenseResult, setDispenseResult] = useState<DispenseResult | null>(null);
  // Cart is cleared right after a successful dispense, so a snapshot of what
  // was actually billed is kept here purely for the invoice/label print --
  // never re-derived from the (by then empty) cart.
  const [dispensedItems, setDispensedItems] = useState<CartItem[]>([]);
  const [dispensedPatient, setDispensedPatient] = useState<Patient | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // OP Returns state
  const [searchInvoiceNo, setSearchInvoiceNo] = useState("");
  const [invoiceLookupLoading, setInvoiceLookupLoading] = useState(false);
  const [foundSales, setFoundSales] = useState<any[]>([]);
  const [returnItem, setReturnItem] = useState<any | null>(null);
  const [returnQty, setReturnQty] = useState<string>("1");
  const [returnReason, setReturnReason] = useState<string>("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Load available stock
  const loadStock = async () => {
    setLoadingBatches(true);
    try {
      const res = await apiFetch<{ batches: StockBatch[] }>("/api/pharmacy/stock");
      if (res?.batches) {
        setAllBatches(res.batches);
      }
    } catch (err) {
      reportError(setNotice, err as any, "Failed to load medicine stock");
    } finally {
      setLoadingBatches(false);
    }
  };

  useEffect(() => {
    void loadStock();
    const saved = localStorage.getItem("selected_pharmacy_patient");
    if (saved) {
      localStorage.removeItem("selected_pharmacy_patient");
      apiFetch<Patient>(`/api/patients/${encodeURIComponent(saved)}`)
        .then((p) => {
          if (p && p.patient_id) setSelectedPatient(p);
        })
        .catch(() => {});
    }
  }, []);

  // Filtered medicines and FEFO batch sorting
  const filteredBatches = useMemo(() => {
    const q = searchMedQuery.trim().toLowerCase();
    if (!q) return [];

    const matches = allBatches.filter((b) => {
      const hasStock = b.qty_available > 0;
      return matchesMedicineBatch(b, q) && hasStock && !isExpiredBatch(b.expiry_date);
    });

    // FEFO: Sort by expiry date ascending
    return matches.sort((a, b) => {
      const dateA = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
      const dateB = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [allBatches, searchMedQuery]);

  const expiredBatches = useMemo(() => {
    const q = searchMedQuery.trim().toLowerCase();
    if (!q) return [];
    return allBatches.filter((batch) =>
      matchesMedicineBatch(batch, q) && batch.qty_available > 0 && isExpiredBatch(batch.expiry_date)
    );
  }, [allBatches, searchMedQuery]);
  const expiredMedicineNames = useMemo(
    () => Array.from(new Set(expiredBatches.map((batch) => batch.medicine_name))),
    [expiredBatches]
  );

  // Add to cart
  const handleAddToCart = () => {
    if (!selectedBatch) return;
    const qty = parseInt(String(addQuantity).trim(), 10);
    if (isNaN(qty) || qty <= 0) {
      setNotice({ type: "warning", message: "Please enter a valid quantity greater than 0" });
      return;
    }
    if (qty > selectedBatch.qty_available) {
      setNotice({ type: "warning", message: `Quantity cannot exceed available stock (${selectedBatch.qty_available})` });
      return;
    }

    const existingIndex = cart.findIndex((c) => c.batch_id === selectedBatch.id);
    if (existingIndex >= 0) {
      const updated = [...cart];
      const newQty = updated[existingIndex].quantity + qty;
      if (newQty > selectedBatch.qty_available) {
        setNotice({ type: "warning", message: `Total in cart (${newQty}) exceeds stock (${selectedBatch.qty_available})` });
        return;
      }
      updated[existingIndex].quantity = newQty;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          batch_id: selectedBatch.id,
          medicine_id: selectedBatch.medicine_id,
          medicine_name: selectedBatch.medicine_name,
          generic_name: selectedBatch.generic_name || selectedBatch.master_generic_name || undefined,
          batch_no: selectedBatch.batch_no,
          expiry_date: selectedBatch.expiry_date,
          available_qty: selectedBatch.qty_available,
          quantity: qty,
          unit_price: selectedBatch.unit_price || 0,
          mrp: selectedBatch.mrp || selectedBatch.unit_price || 0,
          discount_percent: 0,
          // Medicine master GST; 0% (exempt) is a valid rate, so only fall back when unknown.
          gst_rate: Number(selectedBatch.effective_gst_rate ?? selectedBatch.gst_rate ?? 12),
          stock_source: selectedBatch.stock_source || "CASH",
        },
      ]);
    }

    // Reset selection
    setSelectedBatch(null);
    setSearchMedQuery("");
    setAddQuantity("");
    setShowMedDropdown(false);
  };

  const handleRemoveFromCart = (index: number) => {
    setCart(cart.filter((_, idx) => idx !== index));
  };

  const handleUpdateCartQty = (index: number, qty: number) => {
    if (qty <= 0) return;
    const item = cart[index];
    if (qty > item.available_qty) {
      setNotice({ type: "warning", message: `Quantity cannot exceed available stock (${item.available_qty})` });
      return;
    }
    const updated = [...cart];
    updated[index].quantity = qty;
    setCart(updated);
  };

  const handleUpdateCartDiscount = (index: number, disc: number) => {
    const updated = [...cart];
    updated[index].discount_percent = Math.max(0, Math.min(100, disc));
    setCart(updated);
  };

  // Cart Calculations
  const cartTotals = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const item of cart) {
      const basePrice = item.unit_price * item.quantity;
      const discount = basePrice * (item.discount_percent / 100);
      const afterDiscount = basePrice - discount;
      const tax = afterDiscount * (item.gst_rate / 100);

      subtotal += basePrice;
      totalDiscount += discount;
      totalTax += tax;
    }

    const grandTotal = subtotal - totalDiscount + totalTax;

    return {
      subtotal,
      totalDiscount,
      totalTax,
      grandTotal: Math.max(0, grandTotal),
    };
  }, [cart]);

  // Execute OP Dispense
  const handleExecuteDispense = async () => {
    if (!selectedPatient) {
      setNotice({ type: "warning", message: "Please search and select a patient first." });
      return;
    }
    if (cart.length === 0) {
      setNotice({ type: "warning", message: "Cart is empty. Add medicines to dispense." });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        patient_id: selectedPatient.patient_id,
        billing_type: "CASH_OPD",
        stock_source: dispenseStockSource,
        payment_mode: paymentMode,
        subtotal: cartTotals.subtotal,
        discount: cartTotals.totalDiscount,
        tax: cartTotals.totalTax,
        total_amount: cartTotals.grandTotal,
        items: cart.map((c) => {
          const base = c.unit_price * c.quantity;
          const disc = base * (c.discount_percent / 100);
          const afterDisc = base - disc;
          const tax = afterDisc * (c.gst_rate / 100);
          return {
            batch_id: c.batch_id,
            medicine_name: c.medicine_name,
            quantity: c.quantity,
            price: c.unit_price,
            unit_price: c.unit_price,
            discount_percent: c.discount_percent,
            gst_rate: c.gst_rate,
            discount: disc,
            tax: tax,
            amount: afterDisc + tax,
          };
        }),
      };

      const res = await apiFetch<DispenseResult>("/api/pharmacy/dispense", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setDispenseResult(res);
      setDispensedItems(cart);
      setDispensedPatient(selectedPatient);
      setNotice({ type: "success", message: `Successfully dispensed! Invoice #${res.invoice_no || res.invoice_id}` });
      setPrintModalOpen(true);
      setCart([]);
      void loadStock();
    } catch (err) {
      reportError(setNotice, err as any, "Dispense failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintInvoice = () => {
    if (!dispenseResult) return;
    let subtotal = 0, totalDiscount = 0, totalTax = 0;
    const rows = dispensedItems.map((it) => {
      const basePrice = it.unit_price * it.quantity;
      const discount = basePrice * (it.discount_percent / 100);
      const afterDiscount = basePrice - discount;
      const tax = afterDiscount * (it.gst_rate / 100);
      subtotal += basePrice; totalDiscount += discount; totalTax += tax;
      return [
        it.medicine_name, it.batch_no || "-", it.stock_source === "CASH" ? "Cash Stock" : "Insurance Stock",
        it.quantity, `₹${it.unit_price.toFixed(2)}`, `${it.discount_percent}%`, `₹${(basePrice - discount + tax).toFixed(2)}`,
      ];
    });
    const grandTotal = subtotal - totalDiscount + totalTax;
    const patientName = dispensedPatient ? `${dispensedPatient.name || ""} ${dispensedPatient.last_name || ""}`.trim() : "-";
    const invoiceNumber = dispenseResult.invoice_no || `INV-${dispenseResult.invoice_id}`;
    const invoiceDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    try {
      printViaIframe(buildPrintDocumentHtml({
        title: "Pharmacy Dispense Invoice",
        subtitleLines: [
          ...pharmacyHeaderLines(pharmacySettings),
          `Stock: ${dispenseResult.stock_source === "CASH" ? "Cash Counter" : "Insurance Desk"}`,
          `Invoice: ${invoiceNumber}`,
          `Date: ${invoiceDate}`,
        ],
        meta: [
          { label: "Patient Name", value: patientName },
          { label: "UHID / Patient ID", value: dispensedPatient?.patient_id || "-" },
          { label: "Invoice Number", value: invoiceNumber },
          { label: "Payment Mode", value: paymentMode.toUpperCase() },
          { label: "Date & Time", value: `${invoiceDate} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` },
        ],
        columns: ["Medicine Name", "Batch", "Source", "Qty", "Unit Price", "Discount", "Total"],
        rows,
        totals: [
          { label: "Subtotal", value: `₹${subtotal.toFixed(2)}` },
          { label: "Discount", value: `-₹${totalDiscount.toFixed(2)}` },
          { label: "GST / Tax", value: `₹${totalTax.toFixed(2)}` },
          { label: "Grand Total", value: `₹${grandTotal.toFixed(2)}`, grand: true },
          { label: "Amount Received", value: `₹${grandTotal.toFixed(2)}` },
          { label: "Balance", value: "₹0.00" },
        ],
      }), "__hospai_pharmacy_invoice__", { footerAtBottom: true });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to print the invoice." });
    }
  };

  const handlePrintLabels = () => {
    if (!dispenseResult) return;
    const patientName = dispensedPatient ? `${dispensedPatient.name || ""} ${dispensedPatient.last_name || ""}`.trim() : "-";
    printViaIframe(buildPrintLabelsHtml({
      hospitalName: pharmacySettings.pharmacy_name || undefined,
      patientName: patientName || "-",
      patientId: dispensedPatient?.patient_id || "-",
      invoiceNo: dispenseResult.invoice_no || `INV-${dispenseResult.invoice_id}`,
      items: dispensedItems.map((it) => ({
        medicineName: it.medicine_name, batchNo: it.batch_no, expiryDate: it.expiry_date, quantity: it.quantity,
      })),
    }), "__hospai_pharmacy_labels__", { footerAtBottom: true });
  };

  // Lookup Invoice for Return
  const handleLookupInvoice = async () => {
    const q = searchInvoiceNo.trim();
    if (!q) return;
    setInvoiceLookupLoading(true);
    try {
      // Try as an invoice number first; if that errors or matches nothing,
      // always fall through to a patient-UHID search rather than aborting --
      // staff type whatever is printed on the receipt or the patient's
      // UHID interchangeably in this one box.
      let sales: any[] = [];
      try {
        const res = await apiFetch<{ sales: any[] }>(`/api/pharmacy/sales?invoice_id=${encodeURIComponent(q)}`);
        sales = res?.sales || [];
      } catch {
        sales = [];
      }
      if (sales.length === 0) {
        const res2 = await apiFetch<{ sales: any[] }>(`/api/pharmacy/sales?patient_id=${encodeURIComponent(q)}`);
        sales = res2?.sales || [];
      }
      setFoundSales(sales);
      if (sales.length === 0) {
        setNotice({ type: "info", message: "No sales found for this invoice or UHID." });
      }
    } catch (err) {
      reportError(setNotice, err as any, "Error searching sales");
    } finally {
      setInvoiceLookupLoading(false);
    }
  };

  // Submit Return
  const handleProcessReturn = async () => {
    if (!returnItem) return;
    const qty = parseInt(returnQty, 10);
    const maxReturnable = returnItem.remaining_qty ?? returnItem.quantity;
    if (isNaN(qty) || qty <= 0 || qty > maxReturnable) {
      setNotice({ type: "warning", message: `Invalid return quantity (max: ${maxReturnable})` });
      return;
    }
    if (!returnReason.trim()) {
      setNotice({ type: "warning", message: "Reason for return is required." });
      return;
    }

    setReturnSubmitting(true);
    try {
      await apiFetch("/api/pharmacy/returns", {
        method: "POST",
        body: JSON.stringify({
          original_sale_id: returnItem.id,
          quantity: qty,
          reason: returnReason,
        }),
      });

      setNotice({ type: "success", message: `Return processed and refund applied for ${returnItem.medicine_name}.` });
      setReturnItem(null);
      setReturnReason("");
      setReturnQty("1");
      void handleLookupInvoice();
      void loadStock();
    } catch (err) {
      reportError(setNotice, err as any, "Failed to process return");
    } finally {
      setReturnSubmitting(false);
    }
  };

  // OP Dispense History -- daily list of OP counter sales
  const loadDispenseHistory = async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams({ billing_type: "CASH_OPD" });
      if (historyDate) {
        params.set("from_date", historyDate);
        params.set("to_date", historyDate);
      }
      if (historySearch.trim()) params.set("q", historySearch.trim());
      const res = await apiFetch<{ sales?: any[] }>(`/api/pharmacy/sales?${params.toString()}`);
      setDispenseHistory(res.sales || []);
    } catch (err) {
      reportError(setNotice, err as any, "Failed to load dispense history");
    } finally {
      setLoadingHistory(false);
      setHistoryLoaded(true);
    }
  };

  const handleExportHistoryCsv = () => {
    downloadCsv(
      `op_dispense_history_${historyDate || "all"}.csv`,
      ["Time", "Patient UHID", "Medicine", "Quantity", "Unit Price", "Amount"],
      dispenseHistory.map((s) => [
        s.sold_at ? new Date(s.sold_at).toLocaleTimeString() : "",
        s.patient_id,
        s.medicine_name,
        s.quantity,
        s.unit_price,
        s.amount,
      ])
    );
  };

  useEffect(() => {
    if (activeTab === "history" && !historyLoaded) {
      void loadDispenseHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="pharmacy-theme-page" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Topbar / Breadcrumbs */}
      <div className="pharmacy-topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div className="pharmacy-breadcrumb" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
          <span style={{ cursor: "pointer", color: "#3b82f6", fontWeight: 600 }} onClick={() => window.history.back()}>Ayu Polyclinic & Emergency Clinic</span>
          <span>/</span>
          <span style={{ cursor: "pointer", color: "#00828a", fontWeight: 600 }} onClick={() => onNavigate("pharmacy-overview")}>Pharmacy</span>
          <span>/</span>
          <span style={{ color: "#0f172a", fontWeight: 700 }}>OP Dispense</span>
        </div>

        {/* Tab switch: Dispense vs Returns */}
        <div style={{ display: "flex", background: "#e2e8f0", borderRadius: "8px", padding: "3px" }}>
          <button
            type="button"
            style={{
              padding: "0.4rem 1rem",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              background: activeTab === "dispense" ? "#00828a" : "transparent",
              color: activeTab === "dispense" ? "#ffffff" : "#475569",
              transition: "all 0.15s ease",
            }}
            onClick={() => setActiveTab("dispense")}
          >
            OP Dispense
          </button>
          <button
            type="button"
            style={{
              padding: "0.4rem 1rem",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              background: activeTab === "returns" ? "#00828a" : "transparent",
              color: activeTab === "returns" ? "#ffffff" : "#475569",
              transition: "all 0.15s ease",
            }}
            onClick={() => setActiveTab("returns")}
          >
            OP Returns / Refunds
          </button>
          <button
            type="button"
            style={{
              padding: "0.4rem 1rem",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              background: activeTab === "history" ? "#00828a" : "transparent",
              color: activeTab === "history" ? "#ffffff" : "#475569",
              transition: "all 0.15s ease",
            }}
            onClick={() => setActiveTab("history")}
          >
            Dispense History
          </button>
        </div>
      </div>

      {activeTab === "dispense" ? (
        <>
          {/* Patient Selection Row */}
          <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                1. Patient Verification
              </h2>
              {selectedPatient && (
                <button
                  type="button"
                  className="ui-button ghost"
                  style={{ color: "#e11d48", fontSize: "0.8rem", padding: 0 }}
                  onClick={() => setSelectedPatient(null)}
                >
                  Change Patient
                </button>
              )}
            </div>

            {!selectedPatient ? (
              <div>
                <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.875rem", color: "#64748b" }}>
                  Search by UHID, Patient Name, or Mobile Number (from paper prescription or consultation record):
                </p>
                <PatientSearchPicker
                  onSelect={(patient) => setSelectedPatient(patient)}
                  placeholder="Enter UHID (e.g. HOSP-1001), Name, or Mobile..."
                />
              </div>
            ) : (
              <PatientIdentityBanner patient={selectedPatient} />
            )}
          </div>

          {/* Main Dispensing Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: "1.5rem", alignItems: "start" }}>
            {/* Left: Medicine Search + Cart Table */}
            <div>
              {/* Medicine Search Card */}
              <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <h2 style={{ margin: "0 0 0.75rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                  2. Select Medicines (FEFO Recommended)
                </h2>

                <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <Input
                        value={searchMedQuery}
                        onChange={(e) => {
                          setSearchMedQuery(e.target.value);
                          setShowMedDropdown(true);
                          if (selectedBatch && e.target.value !== selectedBatch.medicine_name) {
                            setSelectedBatch(null);
                          }
                        }}
                        onFocus={() => {
                          if (searchMedQuery.trim()) setShowMedDropdown(true);
                        }}
                        placeholder="Search by Brand Name, Generic Name, Code, or scan Barcode..."
                        style={{ width: "100%", paddingRight: searchMedQuery ? "2.2rem" : "0.75rem" }}
                      />
                      {searchMedQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchMedQuery("");
                            setSelectedBatch(null);
                            setShowMedDropdown(false);
                            setAddQuantity("");
                          }}
                          style={{
                            position: "absolute",
                            right: "10px",
                            background: "#e2e8f0",
                            border: "none",
                            borderRadius: "50%",
                            width: "20px",
                            height: "20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#475569",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            lineHeight: 1,
                          }}
                          title="Clear search"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {showMedDropdown && !selectedBatch && (filteredBatches.length > 0 || expiredBatches.length > 0) && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                          zIndex: 50,
                          maxHeight: "260px",
                          overflowY: "auto",
                          marginTop: "4px",
                        }}
                      >
                        {expiredMedicineNames.length > 0 && (
                          <div
                            role="status"
                            aria-live="polite"
                            style={{ padding: "0.55rem 0.85rem", background: "#fef2f2", color: "#b91c1c", borderBottom: "1px solid #fecaca", fontSize: "0.8rem", fontWeight: 700 }}
                          >
                            {expiredMedicineNames.length === 1
                              ? `${expiredMedicineNames[0]} is expired and unavailable for dispensing.`
                              : `Expired stock for ${expiredMedicineNames.join(", ")} is unavailable for dispensing.`}
                          </div>
                        )}
                        {filteredBatches.slice(0, 10).map((batch, idx) => (
                          <div
                            key={batch.id}
                            style={{
                              padding: "0.6rem 0.85rem",
                              borderBottom: "1px solid #f1f5f9",
                              cursor: "pointer",
                              background: selectedBatch?.id === batch.id ? "#f0fdfa" : "transparent",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                            onClick={() => {
                              setSelectedBatch(batch);
                              setSearchMedQuery(batch.medicine_name);
                              setShowMedDropdown(false);
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.875rem" }}>
                                {batch.medicine_name} {idx === 0 && <span style={{ fontSize: "0.7rem", background: "#ccfbf1", color: "#0f766e", padding: "1px 6px", borderRadius: "10px", fontWeight: 700 }}>FEFO Pick</span>}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                Batch: <strong>{batch.batch_no}</strong> · Exp: {batch.expiry_date || "N/A"} · Source: {batch.stock_source}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 700, color: "#00828a", fontSize: "0.9rem" }}>₹{batch.unit_price}</div>
                              <div style={{ fontSize: "0.75rem", color: batch.qty_available <= 10 ? "#e11d48" : "#16a34a", fontWeight: 600 }}>
                                Stock: {batch.qty_available}
                              </div>
                            </div>
                          </div>
                        ))}
                        {expiredBatches.slice(0, 10).map((batch) => (
                          <div
                            key={`expired-${batch.id}`}
                            role="option"
                            aria-disabled="true"
                            style={{
                              padding: "0.6rem 0.85rem",
                              borderBottom: "1px solid #f1f5f9",
                              background: "#fff7f7",
                              cursor: "not-allowed",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              opacity: 0.82,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.875rem" }}>
                                {batch.medicine_name} <span style={{ fontSize: "0.7rem", background: "#fee2e2", color: "#b91c1c", padding: "1px 6px", borderRadius: "10px", fontWeight: 700 }}>Expired</span>
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                Batch: <strong>{batch.batch_no}</strong> · Expired: {batch.expiry_date} · Source: {batch.stock_source}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", color: "#b91c1c", fontSize: "0.75rem", fontWeight: 700 }}>
                              Not available for dispensing
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ width: "120px" }}>
                    <Input
                      type="number"
                      min={1}
                      max={selectedBatch?.qty_available || 999}
                      value={addQuantity}
                      onChange={(e) => setAddQuantity(e.target.value)}
                      placeholder="Enter qty"
                    />
                  </div>

                  <Button
                    type="button"
                    className="primary"
                    style={{ background: "#00828a", borderColor: "#00828a", fontWeight: 700, whiteSpace: "nowrap" }}
                    disabled={!selectedBatch || !addQuantity || parseInt(String(addQuantity).trim(), 10) <= 0}
                    onClick={handleAddToCart}
                  >
                    Add
                  </Button>
                </div>

                {selectedBatch && (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "0.6rem 0.85rem", fontSize: "0.825rem", color: "#166534", display: "flex", justifyContent: "space-between" }}>
                    <span>Selected: <strong>{selectedBatch.medicine_name}</strong> (Batch: {selectedBatch.batch_no}, Exp: {selectedBatch.expiry_date})</span>
                    <span>Available: <strong>{selectedBatch.qty_available}</strong> | Rate: <strong>₹{selectedBatch.unit_price}</strong></span>
                  </div>
                )}
              </div>

              {/* Cart Table */}
              <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                    3. Prescription Cart ({cart.length} items)
                  </h2>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      className="ui-button ghost"
                      style={{ color: "#e11d48", fontSize: "0.8rem", padding: 0 }}
                      onClick={() => setCart([])}
                    >
                      Clear Cart
                    </button>
                  )}
                </div>

                {cart.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                          <th style={{ padding: "0.5rem" }}>Medicine</th>
                          <th style={{ padding: "0.5rem" }}>Batch / Exp</th>
                          <th style={{ padding: "0.5rem", width: "70px" }}>Qty</th>
                          <th style={{ padding: "0.5rem", textAlign: "right" }}>Rate</th>
                          <th style={{ padding: "0.5rem", width: "70px", textAlign: "right" }}>Disc %</th>
                          <th style={{ padding: "0.5rem", textAlign: "right" }}>Tax</th>
                          <th style={{ padding: "0.5rem", textAlign: "right" }}>Total</th>
                          <th style={{ padding: "0.5rem", textAlign: "center" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map((item, idx) => {
                          const basePrice = item.unit_price * item.quantity;
                          const disc = basePrice * (item.discount_percent / 100);
                          const tax = (basePrice - disc) * (item.gst_rate / 100);
                          const lineTotal = basePrice - disc + tax;

                          return (
                            <tr key={item.batch_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "0.5rem", fontWeight: 600 }}>{item.medicine_name}</td>
                              <td style={{ padding: "0.5rem", color: "#64748b" }}>
                                {item.batch_no} <span style={{ fontSize: "0.75rem" }}>({item.expiry_date || "N/A"})</span>
                              </td>
                              <td style={{ padding: "0.5rem" }}>
                                <input
                                  type="number"
                                  min={1}
                                  max={item.available_qty}
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateCartQty(idx, parseInt(e.target.value) || 1)}
                                  style={{ width: "55px", padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", textAlign: "center" }}
                                />
                              </td>
                              <td style={{ padding: "0.5rem", textAlign: "right", color: "#334155" }}>₹{item.unit_price.toFixed(2)}</td>
                              <td style={{ padding: "0.5rem", textAlign: "right" }}>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={item.discount_percent || ""}
                                  placeholder="0"
                                  onChange={(e) => handleUpdateCartDiscount(idx, e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
                                  style={{ width: "50px", padding: "2px 4px", borderRadius: "4px", border: "1px solid #cbd5e1", textAlign: "center" }}
                                />
                              </td>
                              <td style={{ padding: "0.5rem", textAlign: "right", color: "#64748b" }}>{item.gst_rate}%</td>
                              <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                                ₹{lineTotal.toFixed(2)}
                              </td>
                              <td style={{ padding: "0.5rem", textAlign: "center" }}>
                                <button
                                  type="button"
                                  className="ui-button ghost"
                                  style={{ color: "#e11d48", padding: "2px 6px", fontSize: "0.8rem" }}
                                  onClick={() => handleRemoveFromCart(idx)}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#94a3b8" }}>
                    Cart is currently empty. Search and add prescribed medicines above.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Billing & Payment Summary Card */}
            <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                4. Billing & Dispense Confirmation
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#475569" }}>
                  <span>Subtotal:</span>
                  <span style={{ fontWeight: 600 }}>₹{cartTotals.subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#16a34a" }}>
                  <span>Discount:</span>
                  <span style={{ fontWeight: 600 }}>- ₹{cartTotals.totalDiscount.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#475569" }}>
                  <span>GST / Tax:</span>
                  <span style={{ fontWeight: 600 }}>+ ₹{cartTotals.totalTax.toFixed(2)}</span>
                </div>
                <div style={{ height: "1px", background: "#e2e8f0", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
                  <span>Grand Total:</span>
                  <span style={{ color: "#00828a" }}>₹{cartTotals.grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Mode */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Payment Method:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                  {["cash", "upi", "card"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      style={{
                        padding: "0.5rem",
                        borderRadius: "6px",
                        border: paymentMode === mode ? "2px solid #00828a" : "1px solid #cbd5e1",
                        background: paymentMode === mode ? "#f0fdfa" : "#ffffff",
                        color: paymentMode === mode ? "#00828a" : "#334155",
                        fontWeight: paymentMode === mode ? 700 : 500,
                        textTransform: "uppercase",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                      onClick={() => setPaymentMode(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stock Source Classification */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Stock Source / Payer Classification:
                </label>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="dispenseStockSource"
                      checked={dispenseStockSource === "CASH"}
                      onChange={() => setDispenseStockSource("CASH")}
                    />
                    Cash / General Stock
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="dispenseStockSource"
                      checked={dispenseStockSource === "INSURANCE"}
                      onChange={() => setDispenseStockSource("INSURANCE")}
                    />
                    Insurance / Scheme Stock
                  </label>
                </div>
              </div>

              {/* Action Button */}
              <Button
                type="button"
                className="primary"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  background: "#00828a",
                  borderColor: "#00828a",
                }}
                disabled={submitting || cart.length === 0 || !selectedPatient}
                onClick={handleExecuteDispense}
              >
                {submitting ? "Processing Transaction..." : "Generate Bill & Dispense"}
              </Button>

              <p style={{ margin: "0.75rem 0 0 0", fontSize: "0.75rem", color: "#64748b", textAlign: "center" }}>
                Atomically deducts stock, records stock ledger, generates tax invoice, and updates daily reports.
              </p>
            </div>
          </div>
        </>
      ) : activeTab === "returns" ? (
        /* OP Returns Tab */
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h2 style={{ margin: "0 0 0.5rem 0", fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}>
            OP Medicine Returns & Refunds
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.875rem", margin: "0 0 1.25rem 0" }}>
            Find a completed OP sale by Invoice Number or Patient UHID to process return, refund, and traceable stock adjustment:
          </p>

          <div style={{ display: "flex", gap: "0.75rem", maxWidth: "500px", marginBottom: "1.5rem" }}>
            <Input
              value={searchInvoiceNo}
              onChange={(e) => setSearchInvoiceNo(e.target.value)}
              placeholder="Enter Invoice Number or Patient UHID..."
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleLookupInvoice();
              }}
            />
            <Button type="button" variant="secondary" onClick={() => void handleLookupInvoice()} disabled={invoiceLookupLoading}>
              {invoiceLookupLoading ? "Searching..." : "Find Invoice"}
            </Button>
          </div>

          {foundSales.length > 0 && (
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.75rem" }}>
                Matching Sold Items
              </h3>
              <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "0.5rem" }}>Medicine</th>
                    <th style={{ padding: "0.5rem" }}>Patient UHID</th>
                    <th style={{ padding: "0.5rem" }}>Sold Qty</th>
                    <th style={{ padding: "0.5rem" }}>Returned</th>
                    <th style={{ padding: "0.5rem", textAlign: "right" }}>Price</th>
                    <th style={{ padding: "0.5rem" }}>Date</th>
                    <th style={{ padding: "0.5rem", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {foundSales.map((sale) => {
                    const returned = Number(sale.returned_qty || 0);
                    const remaining = Math.max(0, sale.quantity - returned);
                    return (
                      <tr key={sale.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.5rem", fontWeight: 600 }}>{sale.medicine_name}</td>
                        <td style={{ padding: "0.5rem", color: "#64748b" }}>{sale.patient_id}</td>
                        <td style={{ padding: "0.5rem", fontWeight: 700 }}>{sale.quantity}</td>
                        <td style={{ padding: "0.5rem", color: returned > 0 ? "#c2410c" : "#94a3b8" }}>{returned}</td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>₹{sale.unit_price}</td>
                        <td style={{ padding: "0.5rem", color: "#64748b", fontSize: "0.8rem" }}>
                          {sale.sold_at ? new Date(sale.sold_at).toLocaleString() : "-"}
                        </td>
                        <td style={{ padding: "0.5rem", textAlign: "center" }}>
                          {remaining > 0 ? (
                            <Button
                              type="button"
                              variant="secondary"
                              style={{ padding: "2px 10px", fontSize: "0.78rem" }}
                              onClick={() => {
                                setReturnItem({ ...sale, remaining_qty: remaining });
                                setReturnQty("1");
                              }}
                            >
                              Select for Return
                            </Button>
                          ) : (
                            <span style={{ color: "#16a34a", fontSize: "0.75rem", fontWeight: 700 }}>Fully Returned</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {returnItem && (
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "1.25rem", maxWidth: "600px" }}>
              <h4 style={{ margin: "0 0 0.75rem 0", color: "#0f172a" }}>
                Process Return: <strong>{returnItem.medicine_name}</strong>
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Return Qty (Max {returnItem.remaining_qty ?? returnItem.quantity}):
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={returnItem.remaining_qty ?? returnItem.quantity}
                    value={returnQty}
                    onChange={(e) => setReturnQty(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Reason for Return:
                  </label>
                  <select
                    className="ui-input"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  >
                    <option value="">Select reason...</option>
                    <option value="Wrong medicine dispensed">Wrong medicine dispensed</option>
                    <option value="Excess prescribed quantity">Excess prescribed quantity</option>
                    <option value="Doctor stopped medication">Doctor stopped medication</option>
                    <option value="Adverse reaction">Adverse reaction</option>
                    <option value="Billing correction">Billing correction</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <Button type="button" variant="secondary" onClick={() => setReturnItem(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="primary"
                  style={{ background: "#00828a", borderColor: "#00828a" }}
                  disabled={returnSubmitting}
                  onClick={handleProcessReturn}
                >
                  {returnSubmitting ? "Submitting..." : "Confirm Return & Refund"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* OP Dispense History Tab */
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h2 style={{ margin: "0 0 0.5rem 0", fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}>
            OP Dispense History
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.875rem", margin: "0 0 1.25rem 0" }}>
            Every OP counter dispense for a given day, with patient, medicine, quantity and amount.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.5rem" }}>
            <Input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} style={{ width: "160px" }} />
            <Input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Filter by patient UHID or medicine..."
              style={{ width: "260px" }}
            />
            <Button type="button" variant="secondary" onClick={() => void loadDispenseHistory()} disabled={loadingHistory}>
              {loadingHistory ? "Loading..." : "Search"}
            </Button>
            <Button type="button" variant="secondary" onClick={handleExportHistoryCsv} disabled={dispenseHistory.length === 0}>
              Export CSV
            </Button>
          </div>

          <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "0.5rem" }}>Time</th>
                <th style={{ padding: "0.5rem" }}>Patient UHID</th>
                <th style={{ padding: "0.5rem" }}>Medicine</th>
                <th style={{ padding: "0.5rem", textAlign: "center" }}>Qty</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>Unit Price</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "1rem", color: "#94a3b8" }}>Loading…</td></tr>
              )}
              {!loadingHistory && dispenseHistory.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "1rem", color: "#94a3b8" }}>No OP dispenses found for this filter.</td></tr>
              )}
              {!loadingHistory && dispenseHistory.map((sale) => (
                <tr key={sale.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem", color: "#64748b", fontSize: "0.8rem" }}>
                    {sale.sold_at ? new Date(sale.sold_at).toLocaleTimeString() : "-"}
                  </td>
                  <td style={{ padding: "0.5rem", color: "#00828a", fontWeight: 600 }}>{sale.patient_id}</td>
                  <td style={{ padding: "0.5rem", fontWeight: 600 }}>{sale.medicine_name}</td>
                  <td style={{ padding: "0.5rem", textAlign: "center" }}>{sale.quantity}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>₹{sale.unit_price}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 700 }}>₹{sale.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice & Label Print Confirmation Modal */}
      {printModalOpen && dispenseResult && (
        <Modal open={printModalOpen} onClose={() => setPrintModalOpen(false)}>
          <div style={{ padding: "1.5rem", textAlign: "center" }}>
            <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.75rem", marginBottom: "1rem" }}>
              ✓
            </div>
            <h2 style={{ margin: "0 0 0.5rem 0", fontSize: "1.3rem", fontWeight: 800, color: "#0f172a" }}>
              Dispense Complete!
            </h2>
            <p style={{ color: "#64748b", margin: "0 0 1.5rem 0", fontSize: "0.95rem" }}>
              Invoice <strong>{dispenseResult.invoice_no || `INV-${dispenseResult.invoice_id}`}</strong> has been generated and stock has been updated.
            </p>

            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <Button
                type="button"
                className="primary"
                style={{ background: "#00828a", borderColor: "#00828a" }}
                onClick={handlePrintInvoice}
              >
                Print Invoice
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handlePrintLabels}
              >
                Print Labels
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPrintModalOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
