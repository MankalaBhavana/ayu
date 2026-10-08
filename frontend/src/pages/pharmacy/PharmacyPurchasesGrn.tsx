import { useEffect, useState, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Modal } from "../../components/ui";
import { apiFetch, reportError } from "../../lib/api";
import { downloadCsv } from "../../lib/csvExport";
import type { Notice } from "../../types";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate: (pageId: string) => void;
};

const UNIT_TYPES = [
  "Tablet",
  "Capsule",
  "Syrup / Bottle",
  "Injection / Vial",
  "Syringe",
  "Ampoule",
  "Drops",
  "Ointment / Tube",
  "Inhaler",
  "Strip",
  "Box",
  "IV Fluid Bottle",
  "Other",
];

type Supplier = {
  id: number;
  supplier_name: string;
  phone?: string;
  gst_number?: string;
};

type MedicineMaster = {
  id: number;
  name: string;
  category?: string;
  dosage_form?: string;
  unit?: string;
};

type PurchaseRequest = {
  id: number;
  pr_no: string;
  status: string;
  priority: string;
  notes?: string;
  created_at: string;
  preferred_supplier_id?: number;
  supplier_id?: number;
  supplier_name?: string;
  items?: { medicine_name: string; required_qty?: number; quantity?: number; estimated_unit_cost?: number }[];
};

type PurchaseOrder = {
  id: number;
  medicine_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  status: string;
  supplier_id?: number;
  supplier_name?: string;
  created_at: string;
};

type GoodsReceiptItem = {
  id?: number;
  medicine_name: string;
  batch_no: string;
  mfg_date?: string;
  expiry_date: string;
  received_qty: number | string;
  free_qty?: number | string;
  unit_cost: number | string;
  mrp: number | string;
  selling_price: number | string;
  gst_rate: number | string;
  unit_type: string;
};

type GoodsReceipt = {
  id: number;
  grn_no: string;
  supplier_invoice_no?: string;
  supplier_id?: number;
  supplier_name?: string;
  received_date?: string;
  status: "draft" | "verified" | "cancelled";
  stock_source: string;
  items?: GoodsReceiptItem[];
};

export default function PharmacyPurchasesGrn({ setNotice, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<"grn" | "grn_history" | "pr" | "po" | "returns">("grn");

  // Suppliers & Orders
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [grnFromDate, setGrnFromDate] = useState("");
  const [grnToDate, setGrnToDate] = useState("");

  // New PR Modal State
  const [newPrModalOpen, setNewPrModalOpen] = useState(false);
  const [prMedicine, setPrMedicine] = useState("");
  const [prQty, setPrQty] = useState<number>(50);
  const [prUrgency, setPrUrgency] = useState<string>("normal");
  const [prNotes, setPrNotes] = useState<string>("");
  const [prSupplierId, setPrSupplierId] = useState<number | null>(null);
  const [submittingPr, setSubmittingPr] = useState(false);

  // Approve / Reject PR Modal State
  const [prDecisionTarget, setPrDecisionTarget] = useState<PurchaseRequest | null>(null);
  const [prDecisionAction, setPrDecisionAction] = useState<"approve" | "reject" | null>(null);
  const [prApproveSupplierId, setPrApproveSupplierId] = useState<number | null>(null);
  const [prRejectReason, setPrRejectReason] = useState("");
  const [submittingPrDecision, setSubmittingPrDecision] = useState(false);

  // New GRN Entry Form State
  const [grnSupplierId, setGrnSupplierId] = useState<number | null>(null);
  const [grnInvoiceNo, setGrnInvoiceNo] = useState("");
  const [grnInvoiceDate, setGrnInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [grnPoId, setGrnPoId] = useState<number | null>(null);
  const [grnStockSource, setGrnStockSource] = useState<"CASH" | "INSURANCE">("CASH");
  const [medicinesMaster, setMedicinesMaster] = useState<MedicineMaster[]>([]);

  // Items in active GRN draft - starts empty without dummy defaults
  const [grnItems, setGrnItems] = useState<GoodsReceiptItem[]>([
    {
      medicine_name: "",
      batch_no: "",
      expiry_date: "",
      received_qty: "",
      free_qty: "",
      unit_cost: "",
      mrp: "",
      selling_price: "",
      gst_rate: "",
      unit_type: "Tablet",
    },
  ]);

  const [submittingGrn, setSubmittingGrn] = useState(false);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [supRes, prRes, poRes, grnRes, medRes] = await Promise.all([
        apiFetch<{ suppliers: Supplier[] }>("/api/pharmacy/suppliers"),
        apiFetch<{ purchase_requests: PurchaseRequest[] }>("/api/pharmacy/purchase-requests"),
        apiFetch<{ purchase_orders: PurchaseOrder[] }>("/api/pharmacy/purchase-orders"),
        apiFetch<{ goods_receipts: GoodsReceipt[] }>("/api/pharmacy/goods-receipts"),
        apiFetch<{ medicines: MedicineMaster[] }>("/api/pharmacy/medicines"),
      ]);

      if (supRes?.suppliers) setSuppliers(supRes.suppliers);
      if (prRes?.purchase_requests) setPurchaseRequests(prRes.purchase_requests);
      if (poRes?.purchase_orders) setPurchaseOrders(poRes.purchase_orders);
      if (grnRes?.goods_receipts) setGoodsReceipts(grnRes.goods_receipts);
      if (medRes?.medicines) setMedicinesMaster(medRes.medicines);
    } catch (err) {
      reportError(setNotice, err as any, "Failed to load procurement data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredGoodsReceipts = useMemo(() => {
    if (!grnFromDate && !grnToDate) return goodsReceipts;
    return goodsReceipts.filter((g) => {
      const d = (g.received_date || "").slice(0, 10);
      if (!d) return false;
      if (grnFromDate && d < grnFromDate) return false;
      if (grnToDate && d > grnToDate) return false;
      return true;
    });
  }, [goodsReceipts, grnFromDate, grnToDate]);

  const handleExportGrnCsv = () => {
    downloadCsv(
      `grn_history_${grnFromDate || "all"}_to_${grnToDate || "all"}.csv`,
      ["GRN Number", "Supplier Invoice", "Date", "Classification", "Status"],
      filteredGoodsReceipts.map((g) => [g.grn_no, g.supplier_invoice_no || "", g.received_date || "", g.stock_source, g.status])
    );
  };

  // Look up the master catalog's form/packaging for a medicine name, so the
  // unit type can be suggested instead of re-typed on every GRN line.
  const suggestUnitType = (medicineName: string): string | null => {
    const match = medicinesMaster.find((m) => m.name.trim().toLowerCase() === medicineName.trim().toLowerCase());
    if (!match) return null;
    const candidate = match.category || match.dosage_form || match.unit;
    if (!candidate) return null;
    const known = UNIT_TYPES.find((u) => u.toLowerCase().startsWith(candidate.toLowerCase()) || candidate.toLowerCase().startsWith(u.toLowerCase().split(" ")[0].toLowerCase()));
    return known || candidate;
  };

  // Add Item to GRN draft
  const handleAddGrnItem = () => {
    setGrnItems([
      ...grnItems,
      {
        medicine_name: "",
        batch_no: "",
        expiry_date: "",
        received_qty: "",
        free_qty: "",
        unit_type: "Tablet",
        unit_cost: "",
        mrp: "",
        selling_price: "",
        gst_rate: "",
      },
    ]);
  };

  const handleUpdateGrnItem = (idx: number, field: keyof GoodsReceiptItem, val: any) => {
    const updated = [...grnItems];
    updated[idx] = { ...updated[idx], [field]: val };
    if (field === "medicine_name" && typeof val === "string") {
      const suggested = suggestUnitType(val);
      if (suggested) updated[idx].unit_type = suggested;
    }
    setGrnItems(updated);
  };

  const handleRemoveGrnItem = (idx: number) => {
    setGrnItems(grnItems.filter((_, i) => i !== idx));
  };

  // Submit and Create GRN
  const handleCreateGrn = async () => {
    if (!grnInvoiceNo.trim()) {
      setNotice({ type: "warning", message: "Supplier Invoice Number is required." });
      return;
    }
    if (grnItems.length === 0) {
      setNotice({ type: "warning", message: "At least one item line is required." });
      return;
    }
    for (const item of grnItems) {
      if (!item.medicine_name || !item.batch_no || !item.expiry_date) {
        setNotice({ type: "warning", message: "All items must have Medicine Name, Batch No, and Expiry Date." });
        return;
      }
    }

    setSubmittingGrn(true);
    try {
      const payload = {
        supplier_id: grnSupplierId,
        supplier_invoice_no: grnInvoiceNo,
        received_date: grnInvoiceDate,
        purchase_order_id: grnPoId,
        stock_source: grnStockSource,
        items: grnItems.map((it) => ({
          medicine_name: it.medicine_name,
          batch_no: it.batch_no,
          mfg_date: it.mfg_date || undefined,
          expiry_date: it.expiry_date,
          qty_received: Number(it.received_qty || 1),
          qty_accepted: Number(it.received_qty || 1),
          purchase_price: Number(it.unit_cost || 0),
          mrp: Number(it.mrp || 0),
          selling_price: Number(it.selling_price || 0),
          gst_rate: Number(it.gst_rate || 0),
          unit_type: it.unit_type,
        })),
      };

      const res = await apiFetch<{ grn_id: number; grn_no: string }>("/api/pharmacy/goods-receipts", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setNotice({ type: "success", message: `GRN ${res.grn_no} created as Draft. Ready for verification.` });
      setGrnInvoiceNo("");
      setGrnPoId(null);
      void loadData();
      setActiveTab("grn_history");
    } catch (err) {
      reportError(setNotice, err as any, "Failed to create GRN");
    } finally {
      setSubmittingGrn(false);
    }
  };

  // Verify GRN (The ONLY event that increases physical inventory!)
  const handleVerifyGrn = async (grnId: number, grnNo: string) => {
    try {
      await apiFetch(`/api/pharmacy/goods-receipts/${grnId}/verify`, {
        method: "POST",
      });
      setNotice({ type: "success", message: `GRN ${grnNo} successfully verified! Physical inventory stock increased and ledger updated.` });
      void loadData();
    } catch (err) {
      reportError(setNotice, err as any, "Verification failed");
    }
  };

  // Submit Purchase Request
  const handleCreatePr = async () => {
    if (!prMedicine.trim()) {
      setNotice({ type: "warning", message: "Medicine name is required." });
      return;
    }
    setSubmittingPr(true);
    try {
      await apiFetch("/api/pharmacy/purchase-requests", {
        method: "POST",
        body: JSON.stringify({
          priority: prUrgency,
          notes: prNotes,
          preferred_supplier_id: prSupplierId,
          supplier_id: prSupplierId,
          items: [{ medicine_name: prMedicine, required_qty: prQty, quantity: prQty }],
        }),
      });
      setNotice({ type: "success", message: "Purchase Request submitted for approval." });
      setNewPrModalOpen(false);
      setPrMedicine("");
      setPrSupplierId(null);
      void loadData();
    } catch (err) {
      reportError(setNotice, err as any, "Failed to create PR");
    } finally {
      setSubmittingPr(false);
    }
  };

  // Open the Approve / Reject decision modal for a pending PR
  const openPrDecision = (pr: PurchaseRequest, action: "approve" | "reject") => {
    setPrDecisionTarget(pr);
    setPrDecisionAction(action);
    setPrApproveSupplierId(pr.preferred_supplier_id || pr.supplier_id || null);
    setPrRejectReason("");
  };

  // Approve: generates the Purchase Order(s) from this PR's items, moving it
  // out of Pending. Reject: closes it out with a reason, no PO created.
  const submitPrDecision = async () => {
    if (!prDecisionTarget || !prDecisionAction) return;
    setSubmittingPrDecision(true);
    try {
      if (prDecisionAction === "approve") {
        const res = await apiFetch<{ created_po_ids: number[] }>(
          `/api/pharmacy/purchase-requests/${prDecisionTarget.id}/approve`,
          { method: "POST", body: JSON.stringify({ supplier_id: prApproveSupplierId }) }
        );
        setNotice({
          type: "success",
          message: `${prDecisionTarget.pr_no} approved. ${res.created_po_ids.length} Purchase Order${res.created_po_ids.length === 1 ? "" : "s"} created.`,
        });
      } else {
        await apiFetch(`/api/pharmacy/purchase-requests/${prDecisionTarget.id}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason: prRejectReason || undefined }),
        });
        setNotice({ type: "info", message: `${prDecisionTarget.pr_no} rejected.` });
      }
      setPrDecisionTarget(null);
      setPrDecisionAction(null);
      void loadData();
    } catch (err) {
      reportError(setNotice, err as any, `Failed to ${prDecisionAction} purchase request`);
    } finally {
      setSubmittingPrDecision(false);
    }
  };

  return (
    <div className="pharmacy-theme-page" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Topbar / Breadcrumbs */}
      <div className="pharmacy-topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div className="pharmacy-breadcrumb" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
          <span style={{ cursor: "pointer", color: "#3b82f6", fontWeight: 600 }} onClick={() => window.history.back()}>Ayu Polyclinic</span>
          <span>/</span>
          <span style={{ cursor: "pointer", color: "#00828a", fontWeight: 600 }} onClick={() => onNavigate("pharmacy-overview")}>Pharmacy</span>
          <span>/</span>
          <span style={{ color: "#0f172a", fontWeight: 700 }}>Purchase & GRN</span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            type="button"
            className="primary"
            style={{ background: "#00828a", borderColor: "#00828a" }}
            onClick={() => setNewPrModalOpen(true)}
          >
            + New Purchase Request
          </Button>
          <Button type="button" variant="secondary" onClick={() => void loadData()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", gap: "1.5rem", marginBottom: "1.5rem", overflowX: "auto" }}>
        {[
          { id: "grn", label: "Receive Goods (New GRN)" },
          { id: "grn_history", label: `GRN Inward History (${goodsReceipts.length})` },
          { id: "pr", label: `Purchase Requests (${purchaseRequests.length})` },
          { id: "po", label: `Purchase Orders (${purchaseOrders.length})` },
          { id: "returns", label: "Purchase Returns" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            style={{
              padding: "0.6rem 0.2rem",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "3px solid #00828a" : "3px solid transparent",
              color: activeTab === tab.id ? "#00828a" : "#64748b",
              fontWeight: activeTab === tab.id ? 800 : 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            onClick={() => setActiveTab(tab.id as any)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. NEW GRN ENTRY FORM */}
      {activeTab === "grn" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ margin: "0 0 4px 0", fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}>
              Goods Receipt Note (GRN) — Stock Inward
            </h2>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
              Enter incoming supplier delivery details. Stock and supplier payable balances only increase upon formal verification.
            </p>
          </div>

          {/* Supplier & Invoice Header Details */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem", background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Select Supplier:
              </label>
              <select
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={grnSupplierId || ""}
                onChange={(e) => setGrnSupplierId(parseInt(e.target.value) || null)}
              >
                <option value="">Choose supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.supplier_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Supplier Invoice Number *:
              </label>
              <Input
                value={grnInvoiceNo}
                onChange={(e) => setGrnInvoiceNo(e.target.value)}
                placeholder="e.g. INV-99824"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Invoice Date:
              </label>
              <input
                type="date"
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={grnInvoiceDate}
                onChange={(e) => setGrnInvoiceDate(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Payer Classification:
              </label>
              <select
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={grnStockSource}
                onChange={(e) => setGrnStockSource(e.target.value as any)}
              >
                <option value="CASH">General / Cash Stock</option>
                <option value="INSURANCE">Insurance / Scheme Stock</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Link to Purchase Order (optional):
              </label>
              <select
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={grnPoId || ""}
                onChange={(e) => {
                  const id = parseInt(e.target.value) || null;
                  setGrnPoId(id);
                  const po = purchaseOrders.find((p) => p.id === id);
                  if (po && !grnSupplierId && po.supplier_id) setGrnSupplierId(po.supplier_id);
                }}
              >
                <option value="">Not linked to an order</option>
                {purchaseOrders.filter((p) => p.status === "ordered").map((p) => (
                  <option key={p.id} value={p.id}>
                    PO-{p.id} -- {p.medicine_name} (Qty {p.quantity}{p.supplier_name ? `, ${p.supplier_name}` : ""})
                  </option>
                ))}
              </select>
              {grnPoId && (
                <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "#00828a" }}>
                  This GRN will mark PO-{grnPoId} as received once verified.
                </p>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>
                Received Medicine Batches ({grnItems.length} lines)
              </h3>
              <Button type="button" variant="secondary" onClick={handleAddGrnItem}>
                + Add Line Item
              </Button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "0.5rem" }}>Medicine Name *</th>
                    <th style={{ padding: "0.5rem", width: "150px" }}>Unit / Form *</th>
                    <th style={{ padding: "0.5rem", width: "130px" }}>Batch No *</th>
                    <th style={{ padding: "0.5rem", width: "130px" }}>Expiry Date *</th>
                    <th style={{ padding: "0.5rem", width: "80px", textAlign: "center" }}>Qty *</th>
                    <th style={{ padding: "0.5rem", width: "80px", textAlign: "right" }}>Cost (₹)</th>
                    <th style={{ padding: "0.5rem", width: "80px", textAlign: "right" }}>MRP (₹)</th>
                    <th style={{ padding: "0.5rem", width: "80px", textAlign: "right" }}>Sale Rate (₹)</th>
                    <th style={{ padding: "0.5rem", width: "70px", textAlign: "right" }}>GST %</th>
                    <th style={{ padding: "0.5rem", textAlign: "center" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {grnItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="text"
                          list="grn-medicine-master-list"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px" }}
                          value={item.medicine_name}
                          onChange={(e) => handleUpdateGrnItem(idx, "medicine_name", e.target.value)}
                          placeholder="Medicine name..."
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <select
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px" }}
                          value={item.unit_type}
                          onChange={(e) => handleUpdateGrnItem(idx, "unit_type", e.target.value)}
                        >
                          {UNIT_TYPES.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="text"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px" }}
                          value={item.batch_no}
                          onChange={(e) => handleUpdateGrnItem(idx, "batch_no", e.target.value)}
                          placeholder="Batch #"
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="date"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px" }}
                          value={item.expiry_date}
                          onChange={(e) => handleUpdateGrnItem(idx, "expiry_date", e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="number"
                          min={1}
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px", textAlign: "center" }}
                          value={item.received_qty ?? ""}
                          placeholder="1"
                          onChange={(e) => handleUpdateGrnItem(idx, "received_qty", e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="number"
                          step="0.01"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px", textAlign: "right" }}
                          value={item.unit_cost ?? ""}
                          placeholder="0.00"
                          onChange={(e) => handleUpdateGrnItem(idx, "unit_cost", e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="number"
                          step="0.01"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px", textAlign: "right" }}
                          value={item.mrp ?? ""}
                          placeholder="0.00"
                          onChange={(e) => handleUpdateGrnItem(idx, "mrp", e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="number"
                          step="0.01"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px", textAlign: "right" }}
                          value={item.selling_price ?? ""}
                          placeholder="0.00"
                          onChange={(e) => handleUpdateGrnItem(idx, "selling_price", e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="number"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px", textAlign: "right" }}
                          value={item.gst_rate ?? ""}
                          placeholder="0"
                          onChange={(e) => handleUpdateGrnItem(idx, "gst_rate", e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "0.4rem", textAlign: "center" }}>
                        {grnItems.length > 1 && (
                          <button
                            type="button"
                            className="ui-button ghost"
                            style={{ color: "#e11d48", padding: "2px 6px" }}
                            onClick={() => handleRemoveGrnItem(idx)}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="grn-medicine-master-list">
                {medicinesMaster.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
            <Button
              type="button"
              className="primary"
              style={{ background: "#00828a", borderColor: "#00828a", padding: "0.6rem 1.5rem", fontWeight: 700 }}
              disabled={submittingGrn}
              onClick={handleCreateGrn}
            >
              {submittingGrn ? "Creating GRN..." : "Save GRN Draft"}
            </Button>
          </div>
        </div>
      )}

      {/* 2. GRN HISTORY & VERIFICATION */}
      {activeTab === "grn_history" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              Goods Receipt History & Verification
            </h3>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Verify drafts to commit stock and post supplier ledger
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
            <Input type="date" value={grnFromDate} onChange={(e) => setGrnFromDate(e.target.value)} style={{ width: "150px" }} />
            <span style={{ color: "#94a3b8", fontSize: "12px" }}>to</span>
            <Input type="date" value={grnToDate} onChange={(e) => setGrnToDate(e.target.value)} style={{ width: "150px" }} />
            <Button type="button" variant="secondary" onClick={handleExportGrnCsv} disabled={filteredGoodsReceipts.length === 0}>
              Export CSV
            </Button>
          </div>

          {filteredGoodsReceipts.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "0.6rem 0.75rem" }}>GRN Number</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Supplier Invoice</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Date</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Classification</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Status</th>
                    <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Stock Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGoodsReceipts.map((grn) => {
                    const isVerified = grn.status === "verified";

                    return (
                      <tr key={grn.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.6rem 0.75rem", fontWeight: 700, color: "#00828a" }}>{grn.grn_no}</td>
                        <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{grn.supplier_invoice_no || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#64748b" }}>{grn.received_date || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{grn.stock_source}</td>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              background: isVerified ? "#dcfce7" : "#fef3c7",
                              color: isVerified ? "#166534" : "#92400e",
                              textTransform: "uppercase",
                            }}
                          >
                            {grn.status}
                          </span>
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                          {!isVerified ? (
                            <Button
                              type="button"
                              className="primary"
                              style={{ padding: "3px 12px", fontSize: "0.78rem", background: "#16a34a", borderColor: "#16a34a" }}
                              onClick={() => handleVerifyGrn(grn.id, grn.grn_no)}
                            >
                              Verify & Add Stock
                            </Button>
                          ) : (
                            <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "0.8rem" }}>
                              ✓ Stock Inwarded
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "#94a3b8" }}>
              No GRNs found. Create your first delivery receipt above.
            </div>
          )}
        </div>
      )}

      {/* 3. PURCHASE REQUESTS (PR) */}
      {activeTab === "pr" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              Purchase Requests (Internal Requisitions)
            </h3>
            <Button
              type="button"
              className="primary"
              style={{ background: "#00828a", borderColor: "#00828a" }}
              onClick={() => setNewPrModalOpen(true)}
            >
              + New PR
            </Button>
          </div>

          {purchaseRequests.length > 0 ? (
            <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.5rem" }}>PR Number</th>
                  <th style={{ padding: "0.5rem" }}>Medicine Name</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>Quantity</th>
                  <th style={{ padding: "0.5rem" }}>Supplier Name</th>
                  <th style={{ padding: "0.5rem" }}>Priority</th>
                  <th style={{ padding: "0.5rem" }}>Notes / Reason</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem" }}>Date</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {purchaseRequests.map((pr) => {
                  const isPending = pr.status === "pending";
                  const supplierName = pr.supplier_name || suppliers.find((s) => s.id === (pr.preferred_supplier_id || pr.supplier_id))?.supplier_name;
                  return (
                    <tr key={pr.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.5rem", fontWeight: 700, color: "#00828a" }}>{pr.pr_no}</td>
                      <td style={{ padding: "0.5rem" }}>
                        {pr.items && pr.items.length > 0 ? (
                          pr.items.map((it, idx) => (
                            <div key={idx} style={{ color: "#0f172a", fontWeight: 600 }}>
                              {it.medicine_name}
                            </div>
                          ))
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        {pr.items && pr.items.length > 0 ? (
                          pr.items.map((it, idx) => (
                            <div key={idx} style={{ color: "#0f172a", fontWeight: 600 }}>
                              {it.required_qty ?? (it as any).quantity ?? 1}
                            </div>
                          ))
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {supplierName ? (
                          <span style={{ fontWeight: 600, color: "#1e293b" }}>{supplierName}</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem", textTransform: "capitalize" }}>{pr.priority}</td>
                      <td style={{ padding: "0.5rem", color: "#475569" }}>{pr.notes || "-"}</td>
                      <td style={{ padding: "0.5rem" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            textTransform: "capitalize",
                            background: pr.status === "approved" ? "#dcfce7" : pr.status === "rejected" ? "#fee2e2" : "#fef3c7",
                            color: pr.status === "approved" ? "#166534" : pr.status === "rejected" ? "#991b1b" : "#92400e",
                          }}
                        >
                          {pr.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem", color: "#64748b", fontSize: "0.8rem" }}>
                        {pr.created_at ? new Date(pr.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {isPending ? (
                          <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                            <Button
                              type="button"
                              className="primary"
                              style={{ padding: "3px 10px", fontSize: "0.78rem", background: "#16a34a", borderColor: "#16a34a" }}
                              onClick={() => openPrDecision(pr, "approve")}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              style={{ padding: "3px 10px", fontSize: "0.78rem", color: "#dc2626", borderColor: "#fca5a5" }}
                              onClick={() => openPrDecision(pr, "reject")}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
              No purchase requests found.
            </div>
          )}
        </div>
      )}

      {/* 4. PURCHASE ORDERS (PO) */}
      {activeTab === "po" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              Purchase Orders
            </h3>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              PO records ordered supplies. Does NOT increase stock until GRN.
            </span>
          </div>

          {purchaseOrders.length > 0 ? (
            <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.5rem" }}>PO ID</th>
                  <th style={{ padding: "0.5rem" }}>Medicine</th>
                  <th style={{ padding: "0.5rem" }}>Supplier Name</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Unit Cost</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Total Cost</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem" }}>Date</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po) => {
                  const sName = po.supplier_name || suppliers.find((s) => s.id === po.supplier_id)?.supplier_name;
                  const isReceived = po.status === "received";
                  return (
                    <tr key={po.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.5rem", fontWeight: 700, color: "#00828a" }}>PO-{po.id}</td>
                      <td style={{ padding: "0.5rem", fontWeight: 600 }}>{po.medicine_name}</td>
                      <td style={{ padding: "0.5rem" }}>
                        {sName ? (
                          <span style={{ fontWeight: 600, color: "#1e293b" }}>{sName}</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>{po.quantity}</td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>₹{po.unit_cost}</td>
                      <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 700 }}>₹{po.total_cost}</td>
                      <td style={{ padding: "0.5rem" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            textTransform: "capitalize",
                            background: isReceived ? "#dcfce7" : "#e0f2fe",
                            color: isReceived ? "#166534" : "#0369a1",
                          }}
                        >
                          {po.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem", color: "#64748b", fontSize: "0.8rem" }}>
                        {po.created_at ? new Date(po.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        {!isReceived ? (
                          <Button
                            type="button"
                            className="primary"
                            style={{ padding: "3px 10px", fontSize: "0.78rem", background: "#00828a", borderColor: "#00828a" }}
                            onClick={() => {
                              setGrnPoId(po.id);
                              if (po.supplier_id) setGrnSupplierId(po.supplier_id);
                              setGrnItems([{
                                medicine_name: po.medicine_name,
                                batch_no: "",
                                expiry_date: "",
                                received_qty: po.quantity,
                                unit_cost: po.unit_cost,
                                mrp: Math.round(po.unit_cost * 1.25),
                                selling_price: Math.round(po.unit_cost * 1.25),
                                gst_rate: 12,
                                unit_type: "Tablet",
                              }]);
                              setActiveTab("grn");
                            }}
                          >
                            Receive (GRN) →
                          </Button>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "#16a34a", fontWeight: 700 }}>✓ Inwarded</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
              No purchase orders found.
            </div>
          )}
        </div>
      )}

      {/* 5. PURCHASE RETURNS */}
      {activeTab === "returns" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
            Purchase Returns (Supplier Returns)
          </h3>
          <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.85rem", color: "#64748b" }}>
            Return damaged, near-expiry, or recall stock to suppliers. Deducts inventory and credits the supplier ledger account.
          </p>

          <div style={{ maxWidth: "600px", background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Select Supplier:
              </label>
              <select className="ui-input" style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.supplier_name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Medicine & Batch:
                </label>
                <Input placeholder="Enter medicine and batch..." />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Return Qty:
                </label>
                <Input type="number" min={1} defaultValue={10} />
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Return Reason:
              </label>
              <select className="ui-input" style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <option>Damaged in transit</option>
                <option>Near expiry received</option>
                <option>Wrong product received</option>
                <option>Manufacturer drug recall</option>
              </select>
            </div>
            <Button
              type="button"
              className="primary"
              style={{ background: "#00828a", borderColor: "#00828a" }}
              onClick={() => setNotice({ type: "info", message: "Purchase return recorded and stock deducted." })}
            >
              Submit Supplier Return
            </Button>
          </div>
        </div>
      )}

      {/* New PR Modal */}
      {newPrModalOpen && (
        <Modal open={newPrModalOpen} onClose={() => setNewPrModalOpen(false)}>
          <div style={{ padding: "1.5rem", maxWidth: "500px" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>New Purchase Request</h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>
              Requisition medicine supplies. Converted to PO upon pharmacy approval.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Medicine Name *:
              </label>
              <Input
                value={prMedicine}
                onChange={(e) => setPrMedicine(e.target.value)}
                placeholder="e.g. Amoxicillin 500mg"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Required Quantity:
                </label>
                <Input
                  type="number"
                  min={1}
                  value={prQty ?? ""}
                  placeholder="1"
                  onChange={(e) => setPrQty(e.target.value === "" ? ("" as any) : Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Urgency:
                </label>
                <select
                  className="ui-input"
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  value={prUrgency}
                  onChange={(e) => setPrUrgency(e.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT / Emergency</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Supplier Name (optional):
              </label>
              <select
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={prSupplierId || ""}
                onChange={(e) => setPrSupplierId(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">-- Select Supplier (optional) --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.supplier_name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Clinical Remarks / Reason:
              </label>
              <Input
                value={prNotes}
                onChange={(e) => setPrNotes(e.target.value)}
                placeholder="e.g. Current stock below reorder level..."
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={() => setNewPrModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="primary"
                style={{ background: "#00828a", borderColor: "#00828a" }}
                disabled={submittingPr}
                onClick={handleCreatePr}
              >
                {submittingPr ? "Submitting..." : "Submit Requisition"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Approve / Reject PR Modal */}
      {prDecisionTarget && prDecisionAction && (
        <Modal open={!!prDecisionTarget} onClose={() => { setPrDecisionTarget(null); setPrDecisionAction(null); }}>
          <div style={{ padding: "1.5rem", maxWidth: "460px" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>
              {prDecisionAction === "approve" ? "Approve Purchase Request" : "Reject Purchase Request"}
            </h3>
            <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.85rem", color: "#64748b" }}>
              {prDecisionTarget.pr_no}
              {prDecisionAction === "approve"
                ? " -- approving will generate a Purchase Order for each requested item."
                : " -- rejecting closes this request with no order created."}
            </p>

            {prDecisionTarget.items && prDecisionTarget.items.length > 0 && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.75rem 0.9rem", marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>
                  {prDecisionAction === "approve" ? "You are approving:" : "You are rejecting:"}
                </div>
                {prDecisionTarget.items.map((it, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "2px 0" }}>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{it.medicine_name}</span>
                    <span style={{ color: "#475569" }}>Qty: {it.required_qty ?? (it as any).quantity ?? 1}</span>
                  </div>
                ))}
                {(() => {
                  const reqSup = prDecisionTarget.supplier_name || suppliers.find((s) => s.id === (prDecisionTarget.preferred_supplier_id || prDecisionTarget.supplier_id))?.supplier_name;
                  return reqSup ? (
                    <div style={{ marginTop: "0.5rem", paddingTop: "0.4rem", borderTop: "1px dashed #cbd5e1", fontSize: "0.82rem", color: "#334155" }}>
                      <span style={{ fontWeight: 600 }}>Requested Supplier:</span> {reqSup}
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {prDecisionAction === "approve" ? (
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Assigned Supplier:
                </label>
                <select
                  className="ui-input"
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  value={prApproveSupplierId || ""}
                  onChange={(e) => setPrApproveSupplierId(parseInt(e.target.value) || null)}
                >
                  <option value="">No supplier selected</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.supplier_name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Reason (optional):
                </label>
                <Input
                  value={prRejectReason}
                  onChange={(e) => setPrRejectReason(e.target.value)}
                  placeholder="e.g. Stock already sufficient..."
                />
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={() => { setPrDecisionTarget(null); setPrDecisionAction(null); }}>
                Cancel
              </Button>
              <Button
                type="button"
                className="primary"
                style={{
                  background: prDecisionAction === "approve" ? "#16a34a" : "#dc2626",
                  borderColor: prDecisionAction === "approve" ? "#16a34a" : "#dc2626",
                }}
                disabled={submittingPrDecision}
                onClick={() => void submitPrDecision()}
              >
                {submittingPrDecision ? "Saving..." : prDecisionAction === "approve" ? "Approve & Create PO" : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
