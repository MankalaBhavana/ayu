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
  paid_amount?: number;
  due_amount?: number;
  payment_status?: string;
  stock_source: string;
};

export type PharmacyDueInvoice = {
  invoice_id: number;
  invoice_no?: string;
  created_at?: string;
  patient_id?: string;
  patient_name?: string;
  customer_name?: string;
  customer_mobile?: string;
  sale_type?: string;
  invoice_type?: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_status: string;
  medicines_summary?: string;
  items?: any[];
};

export type PharmacyDuesResult = {
  total_due: number;
  count: number;
  identifier: string;
  invoices: PharmacyDueInvoice[];
};

export type DuePaymentReceipt = {
  payment_id: number;
  invoice_id: number;
  invoice_no: string;
  patient_name: string;
  patient_id?: string;
  customer_name?: string;
  customer_mobile?: string;
  sale_type: string;
  medicines_summary: string;
  original_total: number;
  previous_paid: number;
  amount_paid_now: number;
  new_paid_total: number;
  remaining_due: number;
  payment_mode: string;
  reference?: string;
  payment_status: string;
  payment_date: string;
  sales?: any[];
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
  // Tabs: Dispense vs Clear Due vs Returns vs History
  const [activeTab, setActiveTab] = useState<"dispense" | "clear_due" | "returns" | "history">("dispense");
  const pharmacySettings = usePharmacySettings();
  const [dispenseHistory, setDispenseHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyDate, setHistoryDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [historySearch, setHistorySearch] = useState("");

  // Patient Selection
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Country codes with dial code and expected digit lengths
  const COUNTRY_CODES = [
    { code: "IN", dial: "+91", digits: 10, label: "🇮🇳 +91" },
    { code: "US", dial: "+1", digits: 10, label: "🇺🇸 +1" },
    { code: "GB", dial: "+44", digits: 10, label: "🇬🇧 +44" },
    { code: "AE", dial: "+971", digits: 9, label: "🇦🇪 +971" },
    { code: "SA", dial: "+966", digits: 9, label: "🇸🇦 +966" },
    { code: "QA", dial: "+974", digits: 8, label: "🇶🇦 +974" },
    { code: "KW", dial: "+965", digits: 8, label: "🇰🇼 +965" },
    { code: "OM", dial: "+968", digits: 8, label: "🇴🇲 +968" },
    { code: "BH", dial: "+973", digits: 8, label: "🇧🇭 +973" },
    { code: "SG", dial: "+65", digits: 8, label: "🇸🇬 +65" },
    { code: "MY", dial: "+60", digits: 10, label: "🇲🇾 +60" },
    { code: "AU", dial: "+61", digits: 9, label: "🇦🇺 +61" },
    { code: "CA", dial: "+1", digits: 10, label: "🇨🇦 +1" },
    { code: "DE", dial: "+49", digits: 11, label: "🇩🇪 +49" },
    { code: "FR", dial: "+33", digits: 9, label: "🇫🇷 +33" },
    { code: "NP", dial: "+977", digits: 10, label: "🇳🇵 +977" },
    { code: "BD", dial: "+880", digits: 10, label: "🇧🇩 +880" },
    { code: "LK", dial: "+94", digits: 9, label: "🇱🇰 +94" },
    { code: "PK", dial: "+92", digits: 10, label: "🇵🇰 +92" },
  ];

  // Internal vs External sale mode
  const [saleMode, setSaleMode] = useState<"internal" | "external">("internal");
  const [extCustomerName, setExtCustomerName] = useState("");
  const [extCustomerAge, setExtCustomerAge] = useState("");
  const [extCustomerDob, setExtCustomerDob] = useState("");
  const [extCustomerMobile, setExtCustomerMobile] = useState("");
  const [extCountryCode, setExtCountryCode] = useState("IN");
  const [dispensedSaleMode, setDispensedSaleMode] = useState<"internal" | "external">("internal");
  const [dispensedExtCustomer, setDispensedExtCustomer] = useState<{name:string;age:string;mobile:string;dob:string}>({name:"",age:"",mobile:"",dob:""});

  // External customer auto-suggestions
  const [extCustomerSuggestions, setExtCustomerSuggestions] = useState<any[]>([]);
  const [showExtSuggestions, setShowExtSuggestions] = useState(false);
  const [loadingExtSuggestions, setLoadingExtSuggestions] = useState(false);

  const selectedCountry = COUNTRY_CODES.find(c => c.code === extCountryCode) || COUNTRY_CODES[0];

  const clearExternalFields = () => {
    setExtCustomerName("");
    setExtCustomerAge("");
    setExtCustomerDob("");
    setExtCustomerMobile("");
    setExtCountryCode("IN");
    setExtCustomerSuggestions([]);
    setShowExtSuggestions(false);
    setExtCustomerOldDues(null);
  };

  // Stock Batches cache
  const [allBatches, setAllBatches] = useState<StockBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Medicine Search & Barcode
  const [searchMedQuery, setSearchMedQuery] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<StockBatch | null>(null);
  const [addQuantity, setAddQuantity] = useState<string>("");
  const [showMedDropdown, setShowMedDropdown] = useState(false);

  // Cart & Payment
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<string>("cash");
  const [paymentType, setPaymentType] = useState<"full" | "partial" | "due">("full");
  const [customPaidAmount, setCustomPaidAmount] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [dispenseStockSource, setDispenseStockSource] = useState<"CASH" | "INSURANCE">("CASH");

  // Pay Due Modal State
  const [payDueModalOpen, setPayDueModalOpen] = useState(false);
  const [selectedDueSale, setSelectedDueSale] = useState<any | null>(null);
  const [duePayAmount, setDuePayAmount] = useState<string>("");
  const [duePayMode, setDuePayMode] = useState<string>("cash");
  const [duePayRef, setDuePayRef] = useState<string>("");
  const [duePaySubmitting, setDuePaySubmitting] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "external" | "internal" | "due_only">("all");

  // Clear Old Due by ID Tab State
  const [clearDueSearchId, setClearDueSearchId] = useState("");
  const [clearDuesResult, setClearDuesResult] = useState<PharmacyDuesResult | null>(null);
  const [loadingClearDues, setLoadingClearDues] = useState(false);
  const [clearDueSearched, setClearDueSearched] = useState(false);

  // Section 1: Old dues for selected internal patient
  const [patientOldDues, setPatientOldDues] = useState<PharmacyDuesResult | null>(null);
  const [loadingPatientOldDues, setLoadingPatientOldDues] = useState(false);

  // Section 1: Old dues for external customer
  const [extCustomerOldDues, setExtCustomerOldDues] = useState<PharmacyDuesResult | null>(null);
  const [loadingExtCustomerOldDues, setLoadingExtCustomerOldDues] = useState(false);

  // Processing state
  const [submitting, setSubmitting] = useState(false);
  const [dispenseResult, setDispenseResult] = useState<DispenseResult | null>(null);
  const [dispensedItems, setDispensedItems] = useState<CartItem[]>([]);
  const [dispensedPatient, setDispensedPatient] = useState<Patient | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [dueReceiptModalOpen, setDueReceiptModalOpen] = useState(false);
  const [lastDuePayment, setLastDuePayment] = useState<DuePaymentReceipt | null>(null);

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

  // Payment Breakdown (Full, Partial, Due)
  const paymentBreakdown = useMemo(() => {
    const total = cartTotals.grandTotal;
    if (paymentType === "full") {
      return {
        paidAmount: total,
        dueAmount: 0,
        status: "paid" as const,
      };
    }
    if (paymentType === "due") {
      return {
        paidAmount: 0,
        dueAmount: total,
        status: "due" as const,
      };
    }
    // Partial
    const entered = parseFloat(customPaidAmount.trim()) || 0;
    const clampedPaid = Math.max(0, Math.min(entered, total));
    const due = Math.max(0, Number((total - clampedPaid).toFixed(2)));
    return {
      paidAmount: clampedPaid,
      dueAmount: due,
      status: (due === 0 ? "paid" : clampedPaid > 0 ? "partial" : "due") as "paid" | "partial" | "due",
    };
  }, [cartTotals.grandTotal, paymentType, customPaidAmount]);

  // Search returning external customers
  const searchExternalCustomers = async (query: string) => {
    if (!query || query.trim().length < 2) {
      setExtCustomerSuggestions([]);
      setShowExtSuggestions(false);
      return;
    }
    setLoadingExtSuggestions(true);
    try {
      const res = await apiFetch<{ customers: any[] }>(`/api/pharmacy/external-customers?q=${encodeURIComponent(query.trim())}`);
      setExtCustomerSuggestions(res?.customers || []);
      setShowExtSuggestions((res?.customers || []).length > 0);
    } catch {
      setExtCustomerSuggestions([]);
    } finally {
      setLoadingExtSuggestions(false);
    }
  };

  const handleSelectExternalCustomer = (cust: any) => {
    setExtCustomerName(cust.customer_name || "");
    if (cust.customer_age) setExtCustomerAge(String(cust.customer_age));
    if (cust.customer_dob) setExtCustomerDob(cust.customer_dob);
    if (cust.customer_mobile) {
      const digits = String(cust.customer_mobile).replace(/\D/g, "");
      setExtCustomerMobile(digits);
      void loadExtCustomerOldDues(digits);
    }
    setShowExtSuggestions(false);
    if (cust.last_due && Number(cust.last_due) > 0) {
      setNotice({
        type: "warning",
        message: `Customer ${cust.customer_name} has a recorded pending due balance of ₹${Number(cust.last_due).toFixed(2)} from a previous purchase.`,
      });
    }
  };

  // Execute OP Dispense
  const handleExecuteDispense = async () => {
    if (saleMode === "internal" && !selectedPatient) {
      setNotice({ type: "warning", message: "Please search and select a patient first." });
      return;
    }
    if (saleMode === "external") {
      if (!extCustomerName.trim()) {
        setNotice({ type: "warning", message: "Customer name is required for external sales." });
        return;
      }
      if (!extCustomerMobile.trim()) {
        setNotice({ type: "warning", message: "Primary mobile number is required for external sales." });
        return;
      }
      const digits = extCustomerMobile.replace(/\D/g, "");
      if (digits.length !== selectedCountry.digits) {
        setNotice({ type: "warning", message: `Mobile number must be exactly ${selectedCountry.digits} digits for ${selectedCountry.dial}.` });
        return;
      }
    }
    if (cart.length === 0) {
      setNotice({ type: "warning", message: "Cart is empty. Add medicines to dispense." });
      return;
    }

    if (paymentType === "partial") {
      const parsed = parseFloat(customPaidAmount.trim());
      if (isNaN(parsed) || parsed <= 0) {
        setNotice({ type: "warning", message: "Please enter a valid partial amount to pay." });
        return;
      }
      if (parsed > cartTotals.grandTotal) {
        setNotice({ type: "warning", message: `Partial amount cannot exceed the Grand Total (₹${cartTotals.grandTotal.toFixed(2)}).` });
        return;
      }
    }

    setSubmitting(true);
    try {
      const itemsPayload = cart.map((c) => {
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
      });

      const payload: Record<string, any> = {
        billing_type: "CASH_OPD",
        stock_source: dispenseStockSource,
        payment_mode: paymentType === "due" ? "due" : paymentMode,
        subtotal: cartTotals.subtotal,
        discount: cartTotals.totalDiscount,
        tax: cartTotals.totalTax,
        total_amount: cartTotals.grandTotal,
        paid_amount: paymentBreakdown.paidAmount,
        due_amount: paymentBreakdown.dueAmount,
        payment_status: paymentBreakdown.status,
        items: itemsPayload,
        sale_type: saleMode,
      };

      if (saleMode === "internal" && selectedPatient) {
        payload.patient_id = selectedPatient.patient_id;
      } else if (saleMode === "external") {
        payload.customer_name = extCustomerName.trim();
        payload.customer_age = extCustomerAge ? parseInt(extCustomerAge, 10) || null : null;
        payload.customer_dob = extCustomerDob || null;
        payload.customer_mobile = extCustomerMobile.replace(/\D/g, "");
      }

      if (remarks.trim()) payload.notes = remarks.trim();

      const res = await apiFetch<DispenseResult>("/api/pharmacy/dispense", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setDispenseResult(res);
      setDispensedItems(cart);
      setDispensedPatient(saleMode === "internal" ? selectedPatient : null);
      setDispensedSaleMode(saleMode);
      setDispensedExtCustomer({name: extCustomerName, age: extCustomerAge, mobile: extCustomerMobile, dob: extCustomerDob});
      setNotice({ type: "success", message: `Successfully dispensed! Invoice #${res.invoice_no || res.invoice_id}` });
      setPrintModalOpen(true);
      setCart([]);
      setRemarks("");
      setCustomPaidAmount("");
      setPaymentType("full");
      if (saleMode === "external") clearExternalFields();
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
    const patientName = dispensedSaleMode === "external"
      ? (dispensedExtCustomer.name || "Walk-in Customer")
      : (dispensedPatient ? `${dispensedPatient.name || ""} ${dispensedPatient.last_name || ""}`.trim() : "-");
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
          { label: dispensedSaleMode === "external" ? "Customer Name" : "Patient Name", value: patientName },
          ...(dispensedSaleMode === "external"
            ? [
                { label: "Mobile", value: dispensedExtCustomer.mobile || "-" },
                ...(dispensedExtCustomer.age ? [{ label: "Age", value: dispensedExtCustomer.age }] : []),
              ]
            : [{ label: "UHID / Patient ID", value: dispensedPatient?.patient_id || "-" }]),
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
          { label: "Amount Received", value: `₹${((dispenseResult.paid_amount ?? grandTotal)).toFixed(2)}` },
          { label: "Balance Due", value: `₹${((dispenseResult.due_amount ?? 0)).toFixed(2)}`, grand: (dispenseResult.due_amount ?? 0) > 0 },
          { label: "Payment Status", value: (dispenseResult.payment_status || ((dispenseResult.due_amount ?? 0) > 0 ? "PARTIAL / DUE" : "PAID")).toUpperCase() },
        ],
      }), "__hospai_pharmacy_invoice__", { footerAtBottom: true });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to print the invoice." });
    }
  };

  const handlePrintLabels = () => {
    if (!dispenseResult) return;
    const patientName = dispensedSaleMode === "external"
      ? (dispensedExtCustomer.name || "Walk-in Customer")
      : (dispensedPatient ? `${dispensedPatient.name || ""} ${dispensedPatient.last_name || ""}`.trim() : "-");
    printViaIframe(buildPrintLabelsHtml({
      hospitalName: pharmacySettings.pharmacy_name || undefined,
      patientName: patientName || "-",
      patientId: dispensedSaleMode === "external" ? (dispensedExtCustomer.mobile || "External") : (dispensedPatient?.patient_id || "-"),
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

  // Pay Due Modal Handlers
  const handleOpenPayDueModal = (item: any) => {
    const invId = item.invoice_id || item.id;
    const dueAmt = Number(item.due_amount ?? item.invoice_due_amount ?? 0);
    const totalAmt = Number(item.total_amount ?? item.invoice_total_amount ?? item.amount ?? 0);
    const paidAmt = Number(item.paid_amount ?? item.invoice_paid_amount ?? 0);
    const invNo = item.invoice_no || (invId ? `INV-${invId}` : "");
    const custName = item.customer_name || item.patient_name || item.patient_id || "Customer";
    const custMobile = item.customer_mobile || item.patient_phone || item.phone || "";
    const saleType = item.sale_type || item.invoice_type || "internal";

    setSelectedDueSale({
      invoice_id: invId,
      invoice_no: invNo,
      patient_id: item.patient_id || "",
      customer_name: custName,
      customer_mobile: custMobile,
      sale_type: saleType,
      invoice_due_amount: dueAmt,
      invoice_total_amount: totalAmt,
      invoice_paid_amount: paidAmt,
      medicines_summary: item.medicines_summary || item.medicine_name || "",
      items: item.items || [],
    });
    setDuePayAmount(dueAmt > 0 ? dueAmt.toFixed(2) : "");
    setDuePayMode("cash");
    setDuePayRef("");
    setPayDueModalOpen(true);
  };

  const handleProcessDuePayment = async () => {
    if (!selectedDueSale) return;
    const invId = selectedDueSale.invoice_id;
    if (!invId) {
      setNotice({ type: "warning", message: "No linked invoice record found for this transaction." });
      return;
    }
    const amt = parseFloat(duePayAmount.trim());
    if (isNaN(amt) || amt <= 0) {
      setNotice({ type: "warning", message: "Please enter a valid payment amount greater than 0." });
      return;
    }
    const maxDue = Number(selectedDueSale.invoice_due_amount ?? 0);
    if (maxDue > 0 && amt > maxDue + 0.01) {
      setNotice({ type: "warning", message: `Payment amount exceeds the outstanding due of ₹${maxDue.toFixed(2)}.` });
      return;
    }

    setDuePaySubmitting(true);
    try {
      const res = await apiFetch<{
        payment_id: number;
        invoice_id?: number;
        invoice_no?: string;
        paid_amount?: number;
        due_amount?: number;
        total_amount?: number;
        payment_status?: string;
        patient_id?: string;
        patient_name?: string;
        sales?: any[];
      }>(
        `/api/pharmacy/invoices/${invId}/payment`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: amt,
            payment_mode: duePayMode,
            reference: duePayRef.trim() || undefined,
          }),
        }
      );

      const remainingDue = res.due_amount !== undefined ? Number(res.due_amount) : Math.max(0, (selectedDueSale.invoice_due_amount ?? 0) - amt);
      setNotice({
        type: "success",
        message: `Payment of ₹${amt.toFixed(2)} recorded successfully! ${remainingDue > 0 ? `Remaining Due: ₹${remainingDue.toFixed(2)}` : "Due fully cleared!"}`,
      });

      // Prepare print receipt data
      const receiptData: DuePaymentReceipt = {
        payment_id: res.payment_id,
        invoice_id: invId,
        invoice_no: res.invoice_no || selectedDueSale.invoice_no || `INV-${invId}`,
        patient_name: selectedDueSale.customer_name || selectedDueSale.patient_name || res.patient_name || "Patient / Customer",
        patient_id: selectedDueSale.patient_id || res.patient_id || "",
        customer_name: selectedDueSale.customer_name || res.patient_name || "",
        customer_mobile: selectedDueSale.customer_mobile || "",
        sale_type: selectedDueSale.sale_type || "Internal",
        medicines_summary: selectedDueSale.medicines_summary || "",
        original_total: Number(res.total_amount ?? selectedDueSale.invoice_total_amount ?? 0),
        previous_paid: Number(selectedDueSale.invoice_paid_amount ?? 0),
        amount_paid_now: amt,
        new_paid_total: Number(res.paid_amount ?? ((selectedDueSale.invoice_paid_amount ?? 0) + amt)),
        remaining_due: remainingDue,
        payment_mode: duePayMode,
        reference: duePayRef.trim() || undefined,
        payment_status: res.payment_status || (remainingDue <= 0 ? "paid" : "partial"),
        payment_date: `${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        sales: res.sales || selectedDueSale.items || [],
      };

      setPayDueModalOpen(false);
      setSelectedDueSale(null);
      setLastDuePayment(receiptData);
      setDueReceiptModalOpen(true);

      // Refresh dues lookups and history
      if (clearDueSearchId.trim()) {
        void handleSearchDuesById(clearDueSearchId.trim(), false);
      }
      if (selectedPatient?.patient_id) {
        void loadPatientOldDues(selectedPatient.patient_id);
      }
      if (extCustomerMobile.trim()) {
        void loadExtCustomerOldDues(extCustomerMobile.trim());
      }
      void loadDispenseHistory();
    } catch (err) {
      reportError(setNotice, err as any, "Failed to record due payment");
    } finally {
      setDuePaySubmitting(false);
    }
  };

  // Print Payment Settlement Receipt Voucher
  const handlePrintDueReceipt = (receipt: DuePaymentReceipt) => {
    const invoiceNumber = receipt.invoice_no || `INV-${receipt.invoice_id}`;
    const voucherNumber = `REC-PHM-${receipt.payment_id}`;

    const rows: (string | number)[][] = receipt.sales && receipt.sales.length > 0
      ? receipt.sales.map((s) => [
          s.medicine_name,
          s.quantity,
          `₹${Number(s.unit_price || 0).toFixed(2)}`,
          `₹${Number(s.amount || 0).toFixed(2)}`,
        ])
      : [
          [
            `Due Settlement for Invoice #${invoiceNumber} (${receipt.medicines_summary || "Pharmacy Medicines"})`,
            "1",
            `₹${receipt.original_total.toFixed(2)}`,
            `₹${receipt.amount_paid_now.toFixed(2)}`,
          ],
        ];

    try {
      printViaIframe(
        buildPrintDocumentHtml({
          title: "Pharmacy Due Payment Receipt",
          subtitleLines: [
            ...pharmacyHeaderLines(pharmacySettings),
            `Receipt Voucher #: ${voucherNumber}`,
            `Original Invoice #: ${invoiceNumber}`,
            `Date: ${receipt.payment_date}`,
          ],
          meta: [
            { label: receipt.sale_type?.toLowerCase() === "external" ? "Customer Name" : "Patient Name", value: receipt.patient_name || receipt.customer_name || "-" },
            ...(receipt.sale_type?.toLowerCase() === "external"
              ? [{ label: "Mobile Number", value: receipt.customer_mobile || "-" }]
              : [
                  { label: "UHID / Patient ID", value: receipt.patient_id || "-" },
                  ...(receipt.customer_mobile ? [{ label: "Mobile Number", value: receipt.customer_mobile }] : []),
                ]),
            { label: "Receipt Voucher #", value: voucherNumber },
            { label: "Linked Invoice #", value: invoiceNumber },
            { label: "Payment Mode", value: receipt.payment_mode.toUpperCase() },
            ...(receipt.reference ? [{ label: "Txn / Reference #", value: receipt.reference }] : []),
            { label: "Payment Date & Time", value: receipt.payment_date },
          ],
          columns: receipt.sales && receipt.sales.length > 0
            ? ["Medicine Name", "Qty Dispensed", "Unit Price", "Total Item Price"]
            : ["Description", "Qty", "Original Price", "Paid This Transaction"],
          rows,
          totals: [
            { label: "Original Invoice Total", value: `₹${receipt.original_total.toFixed(2)}` },
            { label: "Previously Paid", value: `₹${receipt.previous_paid.toFixed(2)}` },
            { label: "Amount Paid Now", value: `₹${receipt.amount_paid_now.toFixed(2)}`, grand: true },
            { label: "Total Paid To Date", value: `₹${receipt.new_paid_total.toFixed(2)}` },
            {
              label: "Remaining Due Balance",
              value: receipt.remaining_due <= 0 ? "₹0.00 (Fully Settled)" : `₹${receipt.remaining_due.toFixed(2)}`,
              grand: receipt.remaining_due > 0,
            },
            {
              label: "Settlement Status",
              value: receipt.remaining_due <= 0 ? "PAID IN FULL / SETTLED" : "PARTIAL DUE REMAINING",
            },
          ],
        }),
        "__hospai_pharmacy_due_receipt__",
        { footerAtBottom: true }
      );
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to print payment receipt." });
    }
  };

  // Print Full Tax Invoice after due update
  const handlePrintUpdatedInvoice = (receipt: DuePaymentReceipt) => {
    const invoiceNumber = receipt.invoice_no || `INV-${receipt.invoice_id}`;
    const rows: (string | number)[][] = receipt.sales && receipt.sales.length > 0
      ? receipt.sales.map((it) => [
          it.medicine_name,
          it.batch_no || "-",
          it.stock_source === "CASH" ? "Cash Counter" : "Insurance Desk",
          it.quantity,
          `₹${Number(it.unit_price || 0).toFixed(2)}`,
          `${it.discount_percent || 0}%`,
          `₹${Number(it.amount || 0).toFixed(2)}`,
        ])
      : [
          [receipt.medicines_summary || "Pharmacy Medicines", "-", "Cash Counter", "1", `₹${receipt.original_total.toFixed(2)}`, "0%", `₹${receipt.original_total.toFixed(2)}`],
        ];

    try {
      printViaIframe(
        buildPrintDocumentHtml({
          title: "Pharmacy Tax Invoice",
          subtitleLines: [
            ...pharmacyHeaderLines(pharmacySettings),
            `Invoice: ${invoiceNumber}`,
            `Status: ${receipt.remaining_due <= 0 ? "PAID IN FULL" : "PARTIAL DUE"}`,
            `Date: ${receipt.payment_date}`,
          ],
          meta: [
            { label: receipt.sale_type?.toLowerCase() === "external" ? "Customer Name" : "Patient Name", value: receipt.patient_name || receipt.customer_name || "-" },
            ...(receipt.sale_type?.toLowerCase() === "external"
              ? [{ label: "Mobile Number", value: receipt.customer_mobile || "-" }]
              : [{ label: "UHID / Patient ID", value: receipt.patient_id || "-" }]),
            { label: "Invoice Number", value: invoiceNumber },
            { label: "Payment Mode", value: receipt.payment_mode.toUpperCase() },
            { label: "Invoice Date", value: receipt.payment_date },
          ],
          columns: ["Medicine Name", "Batch", "Source", "Qty", "Unit Price", "Discount", "Total"],
          rows,
          totals: [
            { label: "Grand Total", value: `₹${receipt.original_total.toFixed(2)}`, grand: true },
            { label: "Total Amount Received", value: `₹${receipt.new_paid_total.toFixed(2)}` },
            { label: "Balance Due", value: `₹${receipt.remaining_due.toFixed(2)}`, grand: receipt.remaining_due > 0 },
            { label: "Payment Status", value: receipt.remaining_due <= 0 ? "PAID IN FULL" : "PARTIAL DUE" },
          ],
        }),
        "__hospai_pharmacy_invoice__",
        { footerAtBottom: true }
      );
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to print invoice." });
    }
  };

  // Print Invoice or Receipt directly by Invoice ID
  const handlePrintInvoiceById = async (invoiceId: number) => {
    try {
      const res = await apiFetch<{ invoice: any; sales: any[] }>(`/api/pharmacy/invoices/${invoiceId}`);
      if (!res?.invoice) {
        setNotice({ type: "warning", message: "Invoice details could not be loaded." });
        return;
      }
      const inv = res.invoice;
      const sales = res.sales || [];
      const receipt: DuePaymentReceipt = {
        payment_id: inv.id,
        invoice_id: inv.id,
        invoice_no: inv.invoice_no || `INV-${inv.id}`,
        patient_name: inv.patient_name || inv.referral_source || "Patient / Customer",
        patient_id: inv.patient_id || "",
        customer_name: inv.patient_name || "",
        customer_mobile: sales[0]?.customer_mobile || "",
        sale_type: sales[0]?.sale_type || (inv.patient_id ? "Internal" : "External"),
        medicines_summary: sales.map((s: any) => `${s.medicine_name} (x${s.quantity})`).join(", "),
        original_total: Number(inv.total_amount || 0),
        previous_paid: Number(inv.paid_amount || 0),
        amount_paid_now: Number(inv.paid_amount || 0),
        new_paid_total: Number(inv.paid_amount || 0),
        remaining_due: Number(inv.due_amount || 0),
        payment_mode: inv.payment_mode || "cash",
        payment_status: inv.payment_status || "paid",
        payment_date: inv.created_at ? new Date(inv.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "",
        sales,
      };
      handlePrintUpdatedInvoice(receipt);
    } catch (err) {
      reportError(setNotice, err as any, "Failed to load invoice for printing");
    }
  };

  // Search Dues by ID (UHID, Invoice #, Invoice ID, or Customer Mobile)
  const handleSearchDuesById = async (targetId?: string, notifyOnEmpty = true) => {
    const q = (targetId !== undefined ? targetId : clearDueSearchId).trim();
    if (!q) {
      setNotice({ type: "warning", message: "Please enter an ID (Patient UHID, Invoice #, or Customer Mobile) to search." });
      return;
    }
    setLoadingClearDues(true);
    setClearDueSearched(true);
    try {
      const res = await apiFetch<PharmacyDuesResult>(`/api/pharmacy/dues?id=${encodeURIComponent(q)}`);
      setClearDuesResult(res || { total_due: 0, count: 0, identifier: q, invoices: [] });
      if (res && res.count > 0) {
        setNotice({
          type: "info",
          message: `Found ${res.count} pending invoice(s) with total outstanding due of ₹${res.total_due.toFixed(2)} for ID "${q}".`,
        });
      } else if (notifyOnEmpty) {
        setNotice({
          type: "success",
          message: `No pending dues found for ID "${q}". All previous invoices are settled in full!`,
        });
      }
    } catch (err) {
      reportError(setNotice, err as any, "Failed to look up dues for ID");
      setClearDuesResult(null);
    } finally {
      setLoadingClearDues(false);
    }
  };

  // Section 1: Check patient's previous dues
  const loadPatientOldDues = async (patientId: string) => {
    if (!patientId || !patientId.trim()) {
      setPatientOldDues(null);
      return;
    }
    setLoadingPatientOldDues(true);
    try {
      const res = await apiFetch<PharmacyDuesResult>(`/api/pharmacy/dues?id=${encodeURIComponent(patientId.trim())}`);
      setPatientOldDues(res || null);
    } catch {
      setPatientOldDues(null);
    } finally {
      setLoadingPatientOldDues(false);
    }
  };

  // Section 1: Check external customer previous dues
  const loadExtCustomerOldDues = async (mobile: string) => {
    const digits = mobile.replace(/\D/g, "");
    if (!digits || digits.length < 5) {
      setExtCustomerOldDues(null);
      return;
    }
    setLoadingExtCustomerOldDues(true);
    try {
      const res = await apiFetch<PharmacyDuesResult>(`/api/pharmacy/dues?id=${encodeURIComponent(digits)}`);
      setExtCustomerOldDues(res || null);
    } catch {
      setExtCustomerOldDues(null);
    } finally {
      setLoadingExtCustomerOldDues(false);
    }
  };

  // Auto-check patient old dues on patient selection
  useEffect(() => {
    if (selectedPatient?.patient_id) {
      void loadPatientOldDues(selectedPatient.patient_id);
    } else {
      setPatientOldDues(null);
    }
  }, [selectedPatient?.patient_id]);

  // OP Dispense History -- daily list of OP counter sales
  const loadDispenseHistory = async (overrideFilter?: string) => {
    setLoadingHistory(true);
    try {
      const currentF = overrideFilter !== undefined ? overrideFilter : historyFilter;
      const params = new URLSearchParams({ billing_type: "CASH_OPD" });
      if (historyDate) {
        params.set("from_date", historyDate);
        params.set("to_date", historyDate);
      }
      if (historySearch.trim()) params.set("q", historySearch.trim());
      if (currentF === "external") params.set("sale_type", "external");
      if (currentF === "internal") params.set("sale_type", "internal");
      if (currentF === "due_only") params.set("due_only", "true");

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
      ["Time", "Invoice #", "Type", "Patient / Customer", "Mobile", "Medicine", "Quantity", "Total Amount", "Paid Amount", "Due Amount", "Status"],
      dispenseHistory.map((s) => [
        s.sold_at ? new Date(s.sold_at).toLocaleTimeString() : "",
        s.invoice_no || (s.invoice_id ? `INV-${s.invoice_id}` : ""),
        s.sale_type === "external" ? "External" : "Internal",
        s.sale_type === "external" ? (s.customer_name || "Walk-in") : s.patient_id,
        s.customer_mobile || "",
        s.medicine_name,
        s.quantity,
        s.amount,
        s.invoice_paid_amount ?? s.amount,
        s.invoice_due_amount ?? 0,
        s.invoice_payment_status || "paid",
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

        {/* Tab switch: Dispense vs Clear Due vs Returns vs History */}
        <div style={{ display: "flex", background: "#e2e8f0", borderRadius: "8px", padding: "3px", gap: "2px" }}>
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
              background: activeTab === "clear_due" ? "#00828a" : "transparent",
              color: activeTab === "clear_due" ? "#ffffff" : "#475569",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={() => setActiveTab("clear_due")}
          >
            <span>💳</span>
            <span>Clear Old Due by ID</span>
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
          {/* Internal / External Sale Toggle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginBottom: "1.25rem", borderRadius: "10px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
            <button
              type="button"
              style={{
                padding: "0.85rem 1rem",
                border: "none",
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: "pointer",
                background: saleMode === "internal"
                  ? "linear-gradient(135deg, #00828a 0%, #006d73 100%)"
                  : "#f1f5f9",
                color: saleMode === "internal" ? "#ffffff" : "#475569",
                transition: "all 0.25s ease",
              }}
              onClick={() => { setSaleMode("internal"); }}
            >
              Internal Sale
              <div style={{ fontSize: "0.75rem", fontWeight: 500, marginTop: "2px", opacity: 0.85 }}>
                Dispense to registered patient (with UHID)
              </div>
            </button>
            <button
              type="button"
              style={{
                padding: "0.85rem 1rem",
                border: "none",
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: "pointer",
                background: saleMode === "external"
                  ? "linear-gradient(135deg, #00828a 0%, #006d73 100%)"
                  : "#f1f5f9",
                color: saleMode === "external" ? "#ffffff" : "#475569",
                transition: "all 0.25s ease",
              }}
              onClick={() => { setSaleMode("external"); }}
            >
              External Sale
              <div style={{ fontSize: "0.75rem", fontWeight: 500, marginTop: "2px", opacity: 0.85 }}>
                Sell medicines without patient registration
              </div>
            </button>
          </div>

          {/* Section 1: Patient Verification or External Customer Details */}
          {saleMode === "internal" ? (
            <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                  1. Patient Verification (Internal Sale)
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
                <>
                  <PatientIdentityBanner patient={selectedPatient} />
                  {/* Outstanding Due Alert Banner for Selected Patient */}
                  {loadingPatientOldDues ? (
                    <div style={{ marginTop: "0.6rem", fontSize: "0.8rem", color: "#64748b", fontStyle: "italic" }}>
                      🔍 Checking past due balances for {selectedPatient.patient_id}...
                    </div>
                  ) : patientOldDues && patientOldDues.total_due > 0 ? (
                    <div style={{
                      marginTop: "0.85rem",
                      background: "linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)",
                      border: "1px solid #fecdd3",
                      borderRadius: "8px",
                      padding: "0.85rem 1rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                    }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "1.15rem" }}>⚠️</span>
                          <strong style={{ color: "#991b1b", fontSize: "0.95rem" }}>
                            Patient has Old Outstanding Due: ₹{patientOldDues.total_due.toFixed(2)}
                          </strong>
                          <span style={{ fontSize: "0.72rem", background: "#fecdd3", color: "#991b1b", padding: "1px 6px", borderRadius: "10px", fontWeight: 700 }}>
                            {patientOldDues.count} Pending Invoice{patientOldDues.count > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#7f1d1d", marginTop: "3px" }}>
                          Invoice #{patientOldDues.invoices[0]?.invoice_no || patientOldDues.invoices[0]?.invoice_id}
                          {patientOldDues.invoices[0]?.medicines_summary ? ` · ${patientOldDues.invoices[0].medicines_summary}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          style={{
                            padding: "0.45rem 1rem",
                            borderRadius: "6px",
                            border: "1px solid #dc2626",
                            background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                            color: "#ffffff",
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            cursor: "pointer",
                            boxShadow: "0 2px 4px rgba(220, 38, 38, 0.2)",
                          }}
                          onClick={() => handleOpenPayDueModal(patientOldDues.invoices[0])}
                        >
                          💳 Clear Old Due
                        </button>
                        <button
                          type="button"
                          style={{
                            padding: "0.45rem 0.85rem",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            color: "#334155",
                            fontWeight: 600,
                            fontSize: "0.82rem",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            setClearDueSearchId(selectedPatient.patient_id);
                            void handleSearchDuesById(selectedPatient.patient_id);
                            setActiveTab("clear_due");
                          }}
                        >
                          View All Dues →
                        </button>
                      </div>
                    </div>
                  ) : patientOldDues && patientOldDues.total_due === 0 ? (
                    <div style={{ marginTop: "0.6rem", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.78rem", color: "#16a34a", fontWeight: 600, background: "#f0fdf4", padding: "2px 8px", borderRadius: "6px" }}>
                      <span>✓</span>
                      <span>No outstanding pharmacy dues for this patient.</span>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                    1. Customer Details (External Sale)
                  </h2>
                  <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    Enter customer details for medicine sale (No UHID required)
                  </p>
                </div>
                <button
                  type="button"
                  className="ui-button ghost"
                  style={{
                    color: "#00828a",
                    fontSize: "0.8rem",
                    padding: "0.35rem 0.75rem",
                    border: "1px solid #00828a",
                    borderRadius: "6px",
                    fontWeight: 600,
                  }}
                  onClick={clearExternalFields}
                >
                  Clear
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 1fr 1.3fr", gap: "1rem", marginTop: "0.75rem" }}>
                <div style={{ position: "relative" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                    Customer Name <span style={{ color: "#e11d48" }}>*</span>
                  </label>
                  <Input
                    value={extCustomerName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setExtCustomerName(val);
                      if (val.trim().length >= 2) {
                        void searchExternalCustomers(val);
                      } else {
                        setShowExtSuggestions(false);
                      }
                    }}
                    onFocus={() => {
                      if (extCustomerName.trim().length >= 2) void searchExternalCustomers(extCustomerName);
                    }}
                    placeholder="Enter customer name"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                    Age
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={150}
                    value={extCustomerAge}
                    onChange={(e) => setExtCustomerAge(e.target.value)}
                    placeholder="Age"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                    Date of Birth
                  </label>
                  <Input
                    type="date"
                    value={extCustomerDob}
                    onChange={(e) => {
                      const dob = e.target.value;
                      setExtCustomerDob(dob);
                      if (dob) {
                        const birthDate = new Date(dob);
                        const today = new Date();
                        let age = today.getFullYear() - birthDate.getFullYear();
                        const monthDiff = today.getMonth() - birthDate.getMonth();
                        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                          age--;
                        }
                        if (age >= 0 && age <= 150) setExtCustomerAge(String(age));
                      }
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                    Primary Mobile Number <span style={{ color: "#e11d48" }}>*</span>
                  </label>
                  <div style={{ display: "flex", gap: "0" }}>
                    <select
                      value={extCountryCode}
                      onChange={(e) => { setExtCountryCode(e.target.value); setExtCustomerMobile(""); }}
                      style={{
                        padding: "0.45rem 0.35rem",
                        borderRadius: "6px 0 0 6px",
                        border: "1px solid #cbd5e1",
                        borderRight: "none",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        background: "#f1f5f9",
                        color: "#334155",
                        cursor: "pointer",
                        minWidth: "80px",
                        outline: "none",
                      }}
                    >
                      {COUNTRY_CODES.map((cc) => (
                        <option key={cc.code} value={cc.code}>{cc.label}</option>
                      ))}
                    </select>
                    <Input
                      type="tel"
                      value={extCustomerMobile}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (raw.length <= selectedCountry.digits) {
                          setExtCustomerMobile(raw);
                          if (raw.length === selectedCountry.digits) {
                            void loadExtCustomerOldDues(raw);
                          } else if (raw.length < 5) {
                            setExtCustomerOldDues(null);
                          }
                          if (raw.length >= 3) {
                            void searchExternalCustomers(raw);
                          } else {
                            setShowExtSuggestions(false);
                          }
                        }
                      }}
                      onFocus={() => {
                        if (extCustomerMobile.length >= 3) void searchExternalCustomers(extCustomerMobile);
                      }}
                      placeholder={`${selectedCountry.digits} digits`}
                      maxLength={selectedCountry.digits}
                      style={{ width: "100%", borderRadius: "0 6px 6px 0" }}
                    />
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "2px", display: "block" }}>
                    {selectedCountry.dial} · {selectedCountry.digits} digits required
                  </span>
                </div>
              </div>

              {/* Returning External Customers Suggestion Box */}
              {showExtSuggestions && extCustomerSuggestions.length > 0 && (
                <div style={{ marginTop: "0.85rem", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: "8px", padding: "0.75rem", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0f766e", textTransform: "uppercase" }}>
                      ⚡ Returning Customer Found ({extCustomerSuggestions.length}) - Click to autofill:
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowExtSuggestions(false)}
                      style={{ border: "none", background: "none", color: "#64748b", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700 }}
                    >
                      ✕ Close
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "0.5rem" }}>
                    {extCustomerSuggestions.map((cust, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectExternalCustomer(cust)}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #ccfbf1",
                          borderRadius: "6px",
                          padding: "0.5rem 0.75rem",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#0d9488";
                          e.currentTarget.style.boxShadow = "0 2px 4px rgba(13, 148, 136, 0.15)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#ccfbf1";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.85rem", display: "flex", justifyContent: "space-between" }}>
                          <span>👤 {cust.customer_name}</span>
                          {cust.customer_age && <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{cust.customer_age} yrs</span>}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "2px" }}>
                          📱 {cust.customer_mobile}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#0f766e", marginTop: "3px", fontWeight: 600 }}>
                          {cust.total_orders || 1} past orders · Total ₹{Number(cust.total_spent || 0).toFixed(2)}
                          {Number(cust.last_due || 0) > 0 && (
                            <span style={{ color: "#dc2626", fontWeight: 700, marginLeft: "4px" }}>
                              · ⚠️ Due: ₹{Number(cust.last_due).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Outstanding Due Alert Banner for External Customer */}
              {loadingExtCustomerOldDues ? (
                <div style={{ marginTop: "0.85rem", fontSize: "0.8rem", color: "#64748b", fontStyle: "italic" }}>
                  🔍 Checking past due balances for {extCustomerMobile}...
                </div>
              ) : extCustomerOldDues && extCustomerOldDues.total_due > 0 ? (
                <div style={{
                  marginTop: "0.85rem",
                  background: "linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)",
                  border: "1px solid #fecdd3",
                  borderRadius: "8px",
                  padding: "0.85rem 1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "1.15rem" }}>⚠️</span>
                      <strong style={{ color: "#991b1b", fontSize: "0.95rem" }}>
                        External Customer has Old Outstanding Due: ₹{extCustomerOldDues.total_due.toFixed(2)}
                      </strong>
                      <span style={{ fontSize: "0.72rem", background: "#fecdd3", color: "#991b1b", padding: "1px 6px", borderRadius: "10px", fontWeight: 700 }}>
                        {extCustomerOldDues.count} Pending Invoice{extCustomerOldDues.count > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#7f1d1d", marginTop: "3px" }}>
                      Invoice #{extCustomerOldDues.invoices[0]?.invoice_no || extCustomerOldDues.invoices[0]?.invoice_id}
                      {extCustomerOldDues.invoices[0]?.medicines_summary ? ` · ${extCustomerOldDues.invoices[0].medicines_summary}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      style={{
                        padding: "0.45rem 1rem",
                        borderRadius: "6px",
                        border: "1px solid #dc2626",
                        background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        boxShadow: "0 2px 4px rgba(220, 38, 38, 0.2)",
                      }}
                      onClick={() => handleOpenPayDueModal(extCustomerOldDues.invoices[0])}
                    >
                      💳 Clear Old Due
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: "0.45rem 0.85rem",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        color: "#334155",
                        fontWeight: 600,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setClearDueSearchId(extCustomerMobile);
                        void handleSearchDuesById(extCustomerMobile);
                        setActiveTab("clear_due");
                      }}
                    >
                      View All Dues →
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

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
                {saleMode === "external" ? "3" : "4"}. Billing & Dispense Confirmation
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

              {/* Payment Settlement Terms */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Payment Settlement:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                  <button
                    type="button"
                    style={{
                      padding: "0.5rem 0.25rem",
                      borderRadius: "6px",
                      border: paymentType === "full" ? "2px solid #16a34a" : "1px solid #cbd5e1",
                      background: paymentType === "full" ? "#f0fdf4" : "#ffffff",
                      color: paymentType === "full" ? "#166534" : "#334155",
                      fontWeight: paymentType === "full" ? 700 : 500,
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onClick={() => { setPaymentType("full"); setCustomPaidAmount(""); }}
                  >
                    ✓ Full Pay
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: "0.5rem 0.25rem",
                      borderRadius: "6px",
                      border: paymentType === "partial" ? "2px solid #ea580c" : "1px solid #cbd5e1",
                      background: paymentType === "partial" ? "#fff7ed" : "#ffffff",
                      color: paymentType === "partial" ? "#9a3412" : "#334155",
                      fontWeight: paymentType === "partial" ? 700 : 500,
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onClick={() => {
                      setPaymentType("partial");
                      if (!customPaidAmount && cartTotals.grandTotal > 0) {
                        setCustomPaidAmount(String(Math.round(cartTotals.grandTotal / 2)));
                      }
                    }}
                  >
                    ⚖️ Partial Pay
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: "0.5rem 0.25rem",
                      borderRadius: "6px",
                      border: paymentType === "due" ? "2px solid #dc2626" : "1px solid #cbd5e1",
                      background: paymentType === "due" ? "#fef2f2" : "#ffffff",
                      color: paymentType === "due" ? "#991b1b" : "#334155",
                      fontWeight: paymentType === "due" ? 700 : 500,
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onClick={() => { setPaymentType("due"); setCustomPaidAmount("0"); }}
                  >
                    ⏳ Pay Later
                  </button>
                </div>
              </div>

              {/* Partial Payment Input */}
              {paymentType === "partial" && (
                <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "8px", padding: "0.85rem", marginBottom: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#9a3412" }}>
                      Amount Paying Now (₹):
                    </label>
                    <span style={{ fontSize: "0.72rem", color: "#c2410c" }}>
                      Max: ₹{cartTotals.grandTotal.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <Input
                      type="number"
                      min={0}
                      max={cartTotals.grandTotal}
                      step="0.01"
                      value={customPaidAmount}
                      onChange={(e) => setCustomPaidAmount(e.target.value)}
                      placeholder="Enter paid amount"
                      style={{ flex: 1, fontWeight: 700, fontSize: "1rem" }}
                    />
                    <div style={{ display: "flex", gap: "4px" }}>
                      {[0.25, 0.5, 0.75].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setCustomPaidAmount((cartTotals.grandTotal * pct).toFixed(2))}
                          style={{
                            padding: "4px 6px",
                            borderRadius: "4px",
                            border: "1px solid #fed7aa",
                            background: "#ffedd5",
                            color: "#9a3412",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {pct * 100}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", paddingTop: "0.5rem", borderTop: "1px dashed #fdba74" }}>
                    <span style={{ color: "#7c2d12" }}>
                      Collecting: <strong>₹{paymentBreakdown.paidAmount.toFixed(2)}</strong>
                    </span>
                    <span style={{ color: "#991b1b", fontWeight: 700, background: "#fee2e2", padding: "2px 8px", borderRadius: "12px", border: "1px solid #fecaca" }}>
                      Pending Due: ₹{paymentBreakdown.dueAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {paymentType === "due" && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "0.75rem", marginBottom: "1.25rem", fontSize: "0.82rem", color: "#991b1b" }}>
                  ⚠️ <strong>Pay Later Selected:</strong> ₹{cartTotals.grandTotal.toFixed(2)} will be marked as Outstanding Due. The patient or external customer can clear this balance anytime.
                </div>
              )}

              {/* Payment Mode (only when collecting amount > 0) */}
              {paymentType !== "due" && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                    Payment Method {paymentType === "partial" ? "(For Amount Paid Now)" : ""}:
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
              )}

              {/* Stock Source Classification -- only for internal sales */}
              {saleMode === "internal" && (
              <div style={{ marginBottom: "1.25rem" }}>
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
              )}

              {/* Existing Due Indicator */}
              {((saleMode === "internal" && patientOldDues && patientOldDues.total_due > 0) ||
                (saleMode === "external" && extCustomerOldDues && extCustomerOldDues.total_due > 0)) && (
                <div style={{
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  borderRadius: "6px",
                  padding: "0.5rem 0.75rem",
                  marginBottom: "1rem",
                  fontSize: "0.8rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <span style={{ color: "#991b1b" }}>
                    ⚠️ Outstanding Old Due: <strong>₹{((saleMode === "internal" ? patientOldDues?.total_due : extCustomerOldDues?.total_due) || 0).toFixed(2)}</strong>
                  </span>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#dc2626",
                      fontWeight: 700,
                      cursor: "pointer",
                      textDecoration: "underline",
                      fontSize: "0.78rem",
                    }}
                    onClick={() => {
                      const inv = (saleMode === "internal" ? patientOldDues?.invoices[0] : extCustomerOldDues?.invoices[0]);
                      if (inv) handleOpenPayDueModal(inv);
                    }}
                  >
                    Clear Old Due
                  </button>
                </div>
              )}

              {/* Payment Summary Box */}
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.75rem", marginBottom: "1.25rem", fontSize: "0.82rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>Paying Now:</span>
                  <strong style={{ color: "#16a34a" }}>₹{paymentBreakdown.paidAmount.toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: "#64748b" }}>Balance Due:</span>
                  <strong style={{ color: paymentBreakdown.dueAmount > 0 ? "#dc2626" : "#64748b" }}>
                    ₹{paymentBreakdown.dueAmount.toFixed(2)}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px", borderTop: "1px solid #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Invoice Status:</span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      background: paymentBreakdown.status === "paid" ? "#dcfce7" : paymentBreakdown.status === "partial" ? "#ffedd5" : "#fee2e2",
                      color: paymentBreakdown.status === "paid" ? "#166534" : paymentBreakdown.status === "partial" ? "#9a3412" : "#991b1b",
                    }}
                  >
                    {paymentBreakdown.status === "paid" ? "Paid in Full" : paymentBreakdown.status === "partial" ? "Partial Due" : "Full Due"}
                  </span>
                </div>
              </div>

              {/* Remarks */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Remarks (Optional)
                </label>
                <textarea
                  className="ui-input"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter any remarks..."
                  rows={2}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", resize: "vertical" }}
                />
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
                  background: paymentType === "due"
                    ? "linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)"
                    : paymentType === "partial"
                    ? "linear-gradient(135deg, #c2410c 0%, #9a3412 100%)"
                    : "linear-gradient(135deg, #00828a 0%, #006d73 100%)",
                  borderColor: paymentType === "due" ? "#b91c1c" : paymentType === "partial" ? "#c2410c" : "#00828a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
                disabled={submitting || cart.length === 0 || (saleMode === "internal" ? !selectedPatient : (!extCustomerName.trim() || !extCustomerMobile.trim()))}
                onClick={handleExecuteDispense}
              >
                {submitting
                  ? "Processing Transaction..."
                  : paymentType === "due"
                  ? `💊 Confirm Dispense (Pay Later ₹${cartTotals.grandTotal.toFixed(2)})`
                  : paymentType === "partial"
                  ? `💊 Confirm Dispense (Collect ₹${paymentBreakdown.paidAmount.toFixed(2)}, Due ₹${paymentBreakdown.dueAmount.toFixed(2)})`
                  : "💊 Confirm & Dispense (Full Pay)"}
              </Button>

              <p style={{ margin: "0.75rem 0 0 0", fontSize: "0.75rem", color: "#64748b", textAlign: "center" }}>
                Atomically deducts stock, records stock ledger, generates tax invoice, and updates daily reports.
              </p>
            </div>
          </div>
        </>
      ) : activeTab === "clear_due" ? (
        /* Clear Old Due by ID Tab */
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.75rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.5rem" }}>💳</span>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
                  Clear Old Pharmacy Dues by ID
                </h2>
              </div>
              <p style={{ color: "#64748b", fontSize: "0.875rem", margin: "6px 0 0 0" }}>
                Enter any Patient UHID (e.g. HOSP-1001), Invoice Number (e.g. INV-PHM-...), Invoice ID, or Customer Mobile number to instantly look up all outstanding dues and collect payments.
              </p>
            </div>
            {selectedPatient && (
              <button
                type="button"
                onClick={() => {
                  setClearDueSearchId(selectedPatient.patient_id);
                  void handleSearchDuesById(selectedPatient.patient_id);
                }}
                style={{
                  padding: "0.45rem 0.9rem",
                  borderRadius: "6px",
                  border: "1px solid #00828a",
                  background: "#f0fdfa",
                  color: "#00828a",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                🔍 Search Current Patient ({selectedPatient.patient_id})
              </button>
            )}
          </div>

          {/* Search by ID Form */}
          <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "1.25rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Enter Identifier (Patient UHID / Invoice # / ID / Mobile):
            </label>
            <div style={{ display: "flex", gap: "0.75rem", maxWidth: "680px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Input
                  value={clearDueSearchId}
                  onChange={(e) => setClearDueSearchId(e.target.value)}
                  placeholder="e.g. HOSP-1001, PAT-20261009-0001, INV-PHM-..., 67, or 9876543210"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSearchDuesById();
                  }}
                  style={{ width: "100%", fontSize: "0.95rem" }}
                  autoFocus
                />
                {clearDueSearchId && (
                  <button
                    type="button"
                    onClick={() => {
                      setClearDueSearchId("");
                      setClearDuesResult(null);
                      setClearDueSearched(false);
                    }}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      border: "none",
                      background: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <Button
                type="button"
                className="primary"
                style={{ background: "#00828a", borderColor: "#00828a", fontWeight: 700, padding: "0.5rem 1.25rem", display: "flex", alignItems: "center", gap: "6px" }}
                disabled={loadingClearDues || !clearDueSearchId.trim()}
                onClick={() => void handleSearchDuesById()}
              >
                {loadingClearDues ? "Searching..." : "🔍 Search Dues"}
              </Button>
            </div>
            {/* Quick Test Samples */}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>Quick search:</span>
              {["PAT-20261009-0001", "INV-PHM", "67"].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => {
                    setClearDueSearchId(sample);
                    void handleSearchDuesById(sample);
                  }}
                  style={{
                    border: "1px dashed #cbd5e1",
                    background: "#ffffff",
                    borderRadius: "4px",
                    padding: "2px 7px",
                    fontSize: "0.72rem",
                    color: "#0369a1",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          {/* Loading Indicator */}
          {loadingClearDues && (
            <div style={{ padding: "2.5rem", textAlign: "center", color: "#00828a", fontWeight: 600 }}>
              <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>⏳</div>
              Searching for outstanding dues for "{clearDueSearchId}"...
            </div>
          )}

          {/* Results Area */}
          {!loadingClearDues && clearDueSearched && clearDuesResult && (
            <div>
              {clearDuesResult.count > 0 ? (
                <div>
                  {/* Summary Card */}
                  <div style={{
                    background: "linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)",
                    border: "1px solid #fecdd3",
                    borderRadius: "8px",
                    padding: "1.25rem",
                    marginBottom: "1.25rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                        <span style={{ fontWeight: 800, fontSize: "1.15rem", color: "#991b1b" }}>
                          Outstanding Balance Found: ₹{clearDuesResult.total_due.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#7f1d1d", marginTop: "4px" }}>
                        Found <strong>{clearDuesResult.count}</strong> pending due invoice(s) matching identifier <strong>"{clearDuesResult.identifier}"</strong>.
                      </div>
                    </div>
                    {clearDuesResult.invoices.length > 0 && (
                      <Button
                        type="button"
                        className="primary"
                        style={{
                          background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                          borderColor: "#dc2626",
                          fontWeight: 800,
                          padding: "0.6rem 1.25rem",
                          boxShadow: "0 2px 4px rgba(220, 38, 38, 0.25)",
                        }}
                        onClick={() => handleOpenPayDueModal(clearDuesResult.invoices[0])}
                      >
                        💳 Clear Old Due (Invoice #{clearDuesResult.invoices[0].invoice_no || clearDuesResult.invoices[0].invoice_id})
                      </Button>
                    )}
                  </div>

                  {/* Due Invoices Table */}
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.75rem" }}>
                    Pending Invoices ({clearDuesResult.invoices.length})
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                          <th style={{ padding: "0.6rem 0.5rem" }}>Invoice #</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>Date</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>Patient / Customer</th>
                          <th style={{ padding: "0.6rem 0.5rem" }}>Medicines Summary</th>
                          <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Bill Amount</th>
                          <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Paid</th>
                          <th style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>Outstanding Due</th>
                          <th style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>Status</th>
                          <th style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clearDuesResult.invoices.map((inv) => (
                          <tr key={inv.invoice_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "0.6rem 0.5rem", fontWeight: 700, color: "#0f172a" }}>
                              {inv.invoice_no || `INV-${inv.invoice_id}`}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", color: "#64748b", whiteSpace: "nowrap" }}>
                              {inv.created_at ? new Date(inv.created_at).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem" }}>
                              <div style={{ fontWeight: 600, color: "#0f172a" }}>
                                {inv.patient_name || inv.customer_name || inv.patient_id || "Customer"}
                              </div>
                              <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                {inv.patient_id ? `UHID: ${inv.patient_id}` : ""}
                                {inv.customer_mobile ? ` · 📱 ${inv.customer_mobile}` : ""}
                              </div>
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", color: "#334155", maxWidth: "250px" }}>
                              <span style={{ fontSize: "0.8rem" }}>{inv.medicines_summary || "Medicines"}</span>
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", fontWeight: 600 }}>
                              ₹{Number(inv.total_amount).toFixed(2)}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>
                              ₹{Number(inv.paid_amount).toFixed(2)}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", color: "#dc2626", fontWeight: 800, fontSize: "0.95rem" }}>
                              ₹{Number(inv.due_amount).toFixed(2)}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: "10px",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  background: inv.payment_status === "partial" ? "#ffedd5" : "#fee2e2",
                                  color: inv.payment_status === "partial" ? "#9a3412" : "#991b1b",
                                }}
                              >
                                {inv.payment_status === "partial" ? "Partial Due" : "Due"}
                              </span>
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", textAlign: "center", whiteSpace: "nowrap" }}>
                              <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                                <Button
                                  type="button"
                                  className="primary"
                                  style={{
                                    padding: "4px 12px",
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                                    borderColor: "#059669",
                                  }}
                                  onClick={() => handleOpenPayDueModal(inv)}
                                >
                                  💳 Pay / Clear Due
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  style={{ padding: "4px 8px", fontSize: "0.78rem", fontWeight: 600 }}
                                  onClick={() => handlePrintInvoiceById(inv.invoice_id)}
                                  title="Print Bill / Invoice"
                                >
                                  🖨️ Print
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  padding: "2rem",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎉</div>
                  <h3 style={{ margin: "0 0 0.25rem 0", color: "#166534", fontSize: "1.1rem", fontWeight: 700 }}>
                    No Outstanding Dues Found!
                  </h3>
                  <p style={{ color: "#15803d", fontSize: "0.85rem", margin: 0 }}>
                    Identifier <strong>"{clearDuesResult.identifier}"</strong> has zero pending pharmacy dues. All invoices are settled in full.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Initial Help State */}
          {!loadingClearDues && !clearDueSearched && (
            <div style={{
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: "8px",
              padding: "2rem",
              textAlign: "center",
              color: "#64748b",
            }}>
              <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>🔍</div>
              <h4 style={{ margin: "0 0 0.25rem 0", color: "#334155", fontSize: "0.95rem" }}>
                Ready to Clear Old Dues
              </h4>
              <p style={{ fontSize: "0.82rem", margin: 0, maxWidth: "500px", display: "inline-block" }}>
                Enter a Patient UHID, an Invoice Number (like <code>INV-PHM-...</code>), or customer phone number in the box above to look up pending balances and collect due payments.
              </p>
            </div>
          )}
        </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}>
                OP Dispense History
              </h2>
              <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
                Every OP counter dispense, external walk-in sale, partial collection, and pending dues.
              </p>
            </div>

            {/* Quick Segment Filters */}
            <div style={{ display: "flex", background: "#f1f5f9", borderRadius: "8px", padding: "3px", gap: "3px" }}>
              {[
                { id: "all", label: "All Sales" },
                { id: "external", label: "External Sales" },
                { id: "internal", label: "Internal OP" },
                { id: "due_only", label: "Pending Due Only" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: historyFilter === f.id ? (f.id === "due_only" ? "#dc2626" : "#00828a") : "transparent",
                    color: historyFilter === f.id ? "#ffffff" : "#475569",
                    transition: "all 0.15s ease",
                  }}
                  onClick={() => {
                    setHistoryFilter(f.id as any);
                    void loadDispenseHistory(f.id);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.25rem" }}>
            <Input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} style={{ width: "160px" }} />
            <Input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Filter by invoice #, patient UHID, customer name, mobile..."
              style={{ width: "290px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadDispenseHistory();
              }}
            />
            <Button type="button" variant="secondary" onClick={() => void loadDispenseHistory()} disabled={loadingHistory}>
              {loadingHistory ? "Loading..." : "Search"}
            </Button>
            <Button type="button" variant="secondary" onClick={handleExportHistoryCsv} disabled={dispenseHistory.length === 0}>
              Export CSV
            </Button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.5rem" }}>Time</th>
                  <th style={{ padding: "0.5rem" }}>Invoice #</th>
                  <th style={{ padding: "0.5rem" }}>Patient / Customer</th>
                  <th style={{ padding: "0.5rem" }}>Medicine</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Total</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Paid</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Due</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>Status</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory && (
                  <tr><td colSpan={10} style={{ textAlign: "center", padding: "1.5rem", color: "#94a3b8" }}>Loading dispense records…</td></tr>
                )}
                {!loadingHistory && dispenseHistory.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: "center", padding: "1.5rem", color: "#94a3b8" }}>No dispense records found for this filter.</td></tr>
                )}
                {!loadingHistory && dispenseHistory.map((sale) => {
                  const dueAmt = Number(sale.invoice_due_amount ?? 0);
                  const paidAmt = Number(sale.invoice_paid_amount ?? sale.amount);
                  const totalAmt = Number(sale.invoice_total_amount ?? sale.amount);
                  const status = (sale.invoice_payment_status || (dueAmt > 0 ? (paidAmt > 0 ? "partial" : "due") : "paid")).toLowerCase();

                  return (
                    <tr key={sale.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.5rem", color: "#64748b", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                        {sale.sold_at ? new Date(sale.sold_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}
                      </td>
                      <td style={{ padding: "0.5rem", fontWeight: 700, color: "#0f172a", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                        {sale.invoice_no || (sale.invoice_id ? `INV-${sale.invoice_id}` : `SALE-${sale.id}`)}
                      </td>
                      <td style={{ padding: "0.5rem", color: "#0f172a", fontWeight: 600 }}>
                        {sale.sale_type === "external" ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span>{sale.customer_name || "Walk-in"}</span>
                              <span style={{ fontSize: "0.68rem", background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: "6px", fontWeight: 700 }}>
                                External
                              </span>
                            </div>
                            {sale.customer_mobile && (
                              <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                📱 {sale.customer_mobile}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div style={{ color: "#00828a" }}>{sale.patient_id}</div>
                            <span style={{ fontSize: "0.68rem", background: "#e0f2fe", color: "#0369a1", padding: "1px 5px", borderRadius: "6px", fontWeight: 600 }}>
                              Internal OP
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem", fontWeight: 600 }}>{sale.medicine_name}</td>
                      <td style={{ padding: "0.5rem", textAlign: "center", fontWeight: 700 }}>{sale.quantity}</td>
                      <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 700 }}>₹{totalAmt.toFixed(2)}</td>
                      <td style={{ padding: "0.5rem", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>₹{paidAmt.toFixed(2)}</td>
                      <td style={{ padding: "0.5rem", textAlign: "right", color: dueAmt > 0 ? "#dc2626" : "#64748b", fontWeight: dueAmt > 0 ? 800 : 400 }}>
                        ₹{dueAmt.toFixed(2)}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            background: status === "paid" ? "#dcfce7" : status === "partial" ? "#ffedd5" : "#fee2e2",
                            color: status === "paid" ? "#166534" : status === "partial" ? "#9a3412" : "#991b1b",
                          }}
                        >
                          {status === "paid" ? "Paid" : status === "partial" ? "Partial Due" : "Due"}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", justifyContent: "center" }}>
                          {dueAmt > 0 && sale.invoice_id ? (
                            <Button
                              type="button"
                              className="primary"
                              style={{
                                padding: "3px 10px",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                                borderColor: "#059669",
                              }}
                              onClick={() => handleOpenPayDueModal(sale)}
                            >
                              💳 Pay Due
                            </Button>
                          ) : (
                            <span style={{ color: "#16a34a", fontSize: "0.75rem", fontWeight: 600 }}>
                              ✓ Settled
                            </span>
                          )}
                          {sale.invoice_id && (
                            <Button
                              type="button"
                              variant="secondary"
                              style={{ padding: "3px 8px", fontSize: "0.75rem", fontWeight: 600 }}
                              onClick={() => handlePrintInvoiceById(sale.invoice_id)}
                              title="Print Invoice / Bill"
                            >
                              🖨️ Print
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

      {/* Pay Due Settlement Modal */}
      {payDueModalOpen && selectedDueSale && (
        <Modal open={payDueModalOpen} onClose={() => setPayDueModalOpen(false)}>
          <div style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.75rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                💳 Collect Due Payment
              </h3>
              <button
                type="button"
                onClick={() => setPayDueModalOpen(false)}
                style={{ border: "none", background: "none", fontSize: "1.2rem", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "1rem", marginBottom: "1.25rem", border: "1px solid #e2e8f0", fontSize: "0.85rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div>
                  <span style={{ color: "#64748b" }}>Invoice #:</span>{" "}
                  <strong style={{ color: "#0f172a" }}>{selectedDueSale.invoice_no || `INV-${selectedDueSale.invoice_id}`}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Sale Type:</span>{" "}
                  <span style={{ textTransform: "capitalize", fontWeight: 700, color: selectedDueSale.sale_type === "external" ? "#d97706" : "#00828a" }}>
                    {selectedDueSale.sale_type || "Internal"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Customer / Patient:</span>{" "}
                  <strong style={{ color: "#0f172a" }}>{selectedDueSale.customer_name || selectedDueSale.patient_id || "Customer"}</strong>
                </div>
                {selectedDueSale.customer_mobile && (
                  <div>
                    <span style={{ color: "#64748b" }}>Mobile:</span>{" "}
                    <strong>{selectedDueSale.customer_mobile}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px dashed #cbd5e1" }}>
                <span>Invoice Total: <strong>₹{Number(selectedDueSale.invoice_total_amount ?? selectedDueSale.amount).toFixed(2)}</strong></span>
                <span>Already Paid: <strong style={{ color: "#16a34a" }}>₹{Number(selectedDueSale.invoice_paid_amount ?? 0).toFixed(2)}</strong></span>
                <span>Outstanding Due: <strong style={{ color: "#dc2626" }}>₹{Number(selectedDueSale.invoice_due_amount ?? 0).toFixed(2)}</strong></span>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Payment Amount (₹): <span style={{ color: "#e11d48" }}>*</span>
              </label>
              <Input
                type="number"
                min={0.01}
                max={Number(selectedDueSale.invoice_due_amount ?? 999999)}
                step="0.01"
                value={duePayAmount}
                onChange={(e) => setDuePayAmount(e.target.value)}
                placeholder="Enter amount to pay"
                style={{ width: "100%", fontSize: "1.1rem", fontWeight: 700 }}
              />
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => setDuePayAmount(String(selectedDueSale.invoice_due_amount ?? 0))}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Pay Full Due (₹{Number(selectedDueSale.invoice_due_amount ?? 0).toFixed(2)})
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Payment Mode:
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
                {["cash", "upi", "card", "bank_transfer"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    style={{
                      padding: "0.45rem",
                      borderRadius: "6px",
                      border: duePayMode === mode ? "2px solid #00828a" : "1px solid #cbd5e1",
                      background: duePayMode === mode ? "#f0fdfa" : "#ffffff",
                      color: duePayMode === mode ? "#00828a" : "#334155",
                      fontWeight: duePayMode === mode ? 700 : 500,
                      textTransform: "uppercase",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                    onClick={() => setDuePayMode(mode)}
                  >
                    {mode.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Reference / Transaction ID (Optional):
              </label>
              <Input
                value={duePayRef}
                onChange={(e) => setDuePayRef(e.target.value)}
                placeholder="UPI Ref, Cheque No, or Card Txn Ref..."
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={() => setPayDueModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="primary"
                style={{ background: "#00828a", borderColor: "#00828a", fontWeight: 700 }}
                disabled={duePaySubmitting || !duePayAmount || parseFloat(duePayAmount) <= 0}
                onClick={handleProcessDuePayment}
              >
                {duePaySubmitting ? "Recording..." : `Confirm Payment (₹${parseFloat(duePayAmount || "0").toFixed(2)})`}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Due Payment Receipt Voucher & Print Modal */}
      {dueReceiptModalOpen && lastDuePayment && (
        <Modal open={dueReceiptModalOpen} onClose={() => setDueReceiptModalOpen(false)}>
          <div style={{ padding: "1.5rem", maxWidth: "560px" }}>
            <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background: "#dcfce7",
                  color: "#16a34a",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.75rem",
                  marginBottom: "0.75rem",
                  boxShadow: "0 4px 12px rgba(22, 163, 74, 0.15)",
                }}
              >
                ✓
              </div>
              <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
                Due Payment Recorded!
              </h2>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                Voucher <strong style={{ color: "#0f172a" }}>#REC-PHM-{lastDuePayment.payment_id}</strong> &middot; Invoice <strong style={{ color: "#00828a" }}>#{lastDuePayment.invoice_no}</strong>
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                padding: "1rem 1.25rem",
                marginBottom: "1.25rem",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "0.75rem" }}>
                <div>
                  <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>PATIENT / CUSTOMER</span>
                  <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>
                    {lastDuePayment.patient_name || lastDuePayment.customer_name || "Customer"}
                  </strong>
                  {(lastDuePayment.patient_id || lastDuePayment.customer_mobile) && (
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {lastDuePayment.patient_id ? `UHID: ${lastDuePayment.patient_id}` : ""}
                      {lastDuePayment.customer_mobile ? ` · 📱 ${lastDuePayment.customer_mobile}` : ""}
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>PAYMENT MODE</span>
                  <strong style={{ color: "#0f172a", textTransform: "uppercase" }}>
                    {lastDuePayment.payment_mode}
                  </strong>
                  {lastDuePayment.reference && (
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Ref: {lastDuePayment.reference}
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>TRANSACTION DATE</span>
                  <span style={{ color: "#334155" }}>{lastDuePayment.payment_date}</span>
                </div>

                <div>
                  <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>BILL TYPE</span>
                  <span style={{ color: "#334155", textTransform: "capitalize" }}>
                    {lastDuePayment.sale_type} Sale
                  </span>
                </div>
              </div>

              {lastDuePayment.medicines_summary && (
                <div style={{ padding: "0.5rem 0", borderTop: "1px dashed #e2e8f0", borderBottom: "1px dashed #e2e8f0", marginBottom: "0.75rem", fontSize: "0.8rem", color: "#475569" }}>
                  <span style={{ fontWeight: 600, color: "#334155" }}>Medicines:</span> {lastDuePayment.medicines_summary}
                </div>
              )}

              {/* Settlement Totals Grid */}
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  border: "1px solid #e2e8f0",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <span style={{ color: "#64748b", fontSize: "0.75rem" }}>Total Bill Amount:</span>
                  <div style={{ fontWeight: 700, color: "#334155" }}>₹{lastDuePayment.original_total.toFixed(2)}</div>
                </div>
                <div>
                  <span style={{ color: "#64748b", fontSize: "0.75rem" }}>Previously Paid:</span>
                  <div style={{ fontWeight: 600, color: "#64748b" }}>₹{lastDuePayment.previous_paid.toFixed(2)}</div>
                </div>
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "0.4rem" }}>
                  <span style={{ color: "#15803d", fontSize: "0.75rem", fontWeight: 700 }}>PAID JUST NOW:</span>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#16a34a" }}>
                    ₹{lastDuePayment.amount_paid_now.toFixed(2)}
                  </div>
                </div>
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "0.4rem" }}>
                  <span style={{ color: lastDuePayment.remaining_due > 0 ? "#dc2626" : "#16a34a", fontSize: "0.75rem", fontWeight: 700 }}>
                    REMAINING DUE:
                  </span>
                  <div
                    style={{
                      fontSize: "1.15rem",
                      fontWeight: 800,
                      color: lastDuePayment.remaining_due > 0 ? "#dc2626" : "#16a34a",
                    }}
                  >
                    {lastDuePayment.remaining_due <= 0 ? "₹0.00 (Settled ✓)" : `₹${lastDuePayment.remaining_due.toFixed(2)}`}
                  </div>
                </div>
              </div>
            </div>

            {/* Print Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                <Button
                  type="button"
                  className="primary"
                  style={{
                    background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                    borderColor: "#059669",
                    fontWeight: 700,
                    padding: "0.65rem 1rem",
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                  onClick={() => handlePrintDueReceipt(lastDuePayment)}
                >
                  <span>🖨️</span> Print Payment Receipt
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  style={{
                    fontWeight: 700,
                    padding: "0.65rem 1rem",
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    border: "1px solid #00828a",
                    color: "#00828a",
                    background: "#f0fdfa",
                  }}
                  onClick={() => handlePrintUpdatedInvoice(lastDuePayment)}
                >
                  <span>📄</span> Print Tax Invoice
                </Button>
              </div>

              <Button
                type="button"
                variant="secondary"
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  fontSize: "0.85rem",
                  color: "#64748b",
                }}
                onClick={() => setDueReceiptModalOpen(false)}
              >
                Close & Return
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
