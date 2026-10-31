import { useEffect, useState, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Modal } from "../../components/ui";
import { apiFetch, reportError } from "../../lib/api";
import { downloadCsv } from "../../lib/csvExport";
import { useDropdownOptions } from "../../lib/dropdownService";
import type { Notice } from "../../types";
import { generatePDFBlob, printPDF } from "../../lib/exportService";

import { formatDateOnlyIST, todayIST, formatIST, toISTDateKey } from "../../lib/format";
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

const DEFAULT_MEDICINES = [
  "Amoxicillin",
  "Paracetamol",
  "Cetirizine",
  "Azithromycin",
  "Pantoprazole",
  "Metformin",
  "Atorvastatin",
  "Ciprofloxacin",
  "Ibuprofen",
  "Omeprazole",
  "Cough Syrup",
  "ORS Sachet",
  "Dextrose Normal Saline (DNS)",
  "Normal Saline (NS 0.9%)",
];

export type PrLineItem = {
  medicine_name: string;
  strength_form: string;
  quantity: number | string;
  unit: string;
  notes: string;
};

const INITIAL_PR_ITEMS: PrLineItem[] = [
  { medicine_name: "", strength_form: "", quantity: "", unit: "", notes: "" },
];

type Supplier = {
  id: number;
  supplier_name: string;
  phone?: string;
  gst_number?: string;
  drug_license_no?: string;
  payment_terms?: string;
};

type MedicineMaster = {
  id: number;
  name: string;
  category?: string;
  dosage_form?: string;
  unit?: string;
  gst_rate?: number | null;
  hsn_code?: string | null;
  manufacturer?: string | null;
  active?: number | boolean | null;
};

const isActiveMedicine = (m: MedicineMaster) => m.active === undefined || m.active === null || Boolean(Number(m.active));

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
  supplier_phone?: string;
  items?: { medicine_name: string; required_qty?: number; quantity?: number; estimated_unit_cost?: number; strength_form?: string; unit?: string; notes?: string }[];
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
  /** Medicine master link, set when the typed name matches a master medicine. */
  medicine_id?: number;
  medicine_name: string;
  manufacturer?: string;
  pack?: string;
  hsn_code?: string;
  batch_no: string;
  mfg_date?: string;
  expiry_date: string;
  received_qty: number | string;
  free_qty?: number | string;
  unit_cost: number | string;
  mrp: number | string;
  selling_price: number | string;
  discount_pct?: number | string;
  gst_rate: number | string;
  unit_type: string;
  storage_location?: string;
  line_amount?: number | null;
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
  due_date?: string | null;
  payment_type?: "CREDIT" | "CASH" | null;
  taxable_amount?: number | null;
  gst_amount?: number | null;
  bill_discount?: number | null;
  adjustment?: number | null;
  round_off?: number | null;
  net_amount?: number | null;
  invoice_amount?: number | null;
  notes?: string | null;
  items?: GoodsReceiptItem[];
};

const blankGrnItem = (): GoodsReceiptItem => ({
  medicine_name: "",
  manufacturer: "",
  pack: "",
  hsn_code: "",
  batch_no: "",
  expiry_date: "",
  received_qty: "",
  free_qty: "",
  unit_cost: "",
  mrp: "",
  selling_price: "",
  discount_pct: "",
  gst_rate: "",
  unit_type: "Tablet",
});

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Billed value of a GRN line, the way supplier invoices print it: free qty is not billed. */
const computeGrnLine = (it: GoodsReceiptItem) => {
  // Blank qty is submitted as 1 (see handleCreateGrn), so total it the same way.
  const qty = String(it.received_qty ?? "").trim() === "" ? 1 : toNum(it.received_qty);
  const gross = round2(qty * toNum(it.unit_cost));
  const discount = round2((gross * toNum(it.discount_pct)) / 100);
  const taxable = round2(gross - discount);
  const gst = round2((taxable * toNum(it.gst_rate)) / 100);
  return { qty, free: toNum(it.free_qty), gross, discount, taxable, gst, amount: round2(taxable + gst) };
};

/** "30 days" / "30" / "Net 45" -> 30 / 30 / 45; null when no number is present. */
const paymentTermDays = (terms?: string) => {
  const m = String(terms || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

const addDaysIso = (isoDate: string, days: number) => {
  const [y, mo, d] = isoDate.split("-").map(Number);
  if (!y || !mo || !d) return "";
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
};

const formatInr = (n: number | null | undefined) =>
  `₹${toNum(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PharmacyPurchasesGrn({ setNotice, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<"grn" | "grn_history" | "pr" | "po" | "returns">(() => {
    const shouldOpen = typeof window !== "undefined" ? sessionStorage.getItem("pharmacy_purchases_open_new_pr") : null;
    if (shouldOpen === "true") return "pr";
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("pharmacy_purchases_tab") : null;
    if (saved === "pr" || saved === "po" || saved === "grn" || saved === "grn_history" || saved === "returns") {
      sessionStorage.removeItem("pharmacy_purchases_tab");
      return saved as any;
    }
    if (typeof window !== "undefined" && window.location.pathname.includes("pharmacy-purchases-pr")) {
      return "pr";
    }
    return "grn";
  });

  // Suppliers & Orders
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [grnFromDate, setGrnFromDate] = useState("");
  const [grnToDate, setGrnToDate] = useState("");

  // New PR Modal State
  const [newPrModalOpen, setNewPrModalOpen] = useState<boolean>(() => {
    const shouldOpen = typeof window !== "undefined" ? sessionStorage.getItem("pharmacy_purchases_open_new_pr") : null;
    if (shouldOpen === "true") {
      sessionStorage.removeItem("pharmacy_purchases_open_new_pr");
      return true;
    }
    if (typeof window !== "undefined" && (window.location.pathname.includes("pharmacy-purchases-pr") || window.location.search.includes("new_pr=true"))) {
      return true;
    }
    return false;
  });
  const [prItems, setPrItems] = useState<PrLineItem[]>(() => {
    const prefillMed = typeof window !== "undefined" ? sessionStorage.getItem("pharmacy_purchases_prefill_med") : null;
    if (prefillMed) {
      sessionStorage.removeItem("pharmacy_purchases_prefill_med");
      return [{ medicine_name: prefillMed, strength_form: "", quantity: "", unit: "", notes: "Stock reorder" }];
    }
    return INITIAL_PR_ITEMS;
  });
  const [prUrgency, setPrUrgency] = useState<string>("normal");
  const [prNotes, setPrNotes] = useState<string>("");
  const [prSupplierId, setPrSupplierId] = useState<number | null>(null);
  const [prSupplierPhone, setPrSupplierPhone] = useState<string>("");
  const [prShareWhatsApp, setPrShareWhatsApp] = useState<boolean>(true);
  const [submittingPr, setSubmittingPr] = useState(false);
  const [prModalError, setPrModalError] = useState<string | null>(null);
  const [latestPrShareUrl, setLatestPrShareUrl] = useState<string | null>(null);
  const [latestPrNo, setLatestPrNo] = useState<string | null>(null);
  const [latestPrText, setLatestPrText] = useState<string | null>(null);
  const [copiedPrBanner, setCopiedPrBanner] = useState(false);
  const [latestPrDirectPhoneUrl, setLatestPrDirectPhoneUrl] = useState<string | null>(null);

  // Approve / Reject PR Modal State
  const [prDecisionTarget, setPrDecisionTarget] = useState<PurchaseRequest | null>(null);
  const [prDecisionAction, setPrDecisionAction] = useState<"approve" | "reject" | null>(null);
  const [prApproveSupplierId, setPrApproveSupplierId] = useState<number | null>(null);
  const [prRejectReason, setPrRejectReason] = useState("");
  const [submittingPrDecision, setSubmittingPrDecision] = useState(false);

  // New GRN Entry Form State
  const [grnSupplierId, setGrnSupplierId] = useState<number | null>(null);
  const [grnInvoiceNo, setGrnInvoiceNo] = useState("");
  const [grnInvoiceDate, setGrnInvoiceDate] = useState(todayIST());
  const [grnPoId, setGrnPoId] = useState<number | null>(null);
  const [grnStockSource, setGrnStockSource] = useState<"CASH" | "INSURANCE">("CASH");
  const [grnDueDate, setGrnDueDate] = useState("");
  // Once the user picks a due date by hand, stop deriving it from supplier payment terms.
  const [grnDueDateTouched, setGrnDueDateTouched] = useState(false);
  const [grnPaymentType, setGrnPaymentType] = useState<"CREDIT" | "CASH">("CREDIT");
  const [grnBillDiscount, setGrnBillDiscount] = useState<number | string>("");
  const [grnAdjustment, setGrnAdjustment] = useState<number | string>("");
  const [grnInvoiceAmount, setGrnInvoiceAmount] = useState<number | string>("");
  const [grnNotes, setGrnNotes] = useState("");
  const [medicinesMaster, setMedicinesMaster] = useState<MedicineMaster[]>([]);
  // Dosage forms configured in Pharmacy → Settings, merged with the packaging units GRN lines need.
  const { options: dosageFormOptions } = useDropdownOptions("dosage_forms");
  // Pharmacy → Settings → Store & Rack Locations
  const { options: storageLocationOptions } = useDropdownOptions("storage_locations");
  const findMasterMedicine = (name: string) => {
    const key = name.trim().toLowerCase();
    return key ? medicinesMaster.find((m) => m.name.trim().toLowerCase() === key) : undefined;
  };
  const unitTypes = useMemo(() => {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const u of [...dosageFormOptions.map((o) => o.value), ...UNIT_TYPES]) {
      const key = u.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(u.trim());
      }
    }
    // Keep "Other" last.
    return [...merged.filter((u) => u !== "Other"), "Other"];
  }, [dosageFormOptions]);

  // Items in active GRN draft - starts empty without dummy defaults
  const [grnItems, setGrnItems] = useState<GoodsReceiptItem[]>([blankGrnItem()]);

  const grnSelectedSupplier = suppliers.find((s) => s.id === grnSupplierId);

  // Filter Purchase Orders for GRN "Link to Purchase Order" dropdown:
  // When a supplier is selected, only purchase orders for that particular supplier are visible.
  const grnAvailablePurchaseOrders = useMemo(() => {
    return purchaseOrders.filter((p) => {
      // Must be in "ordered" status (or currently linked PO)
      const isEligible = p.status === "ordered" || p.id === grnPoId;
      if (!isEligible) return false;

      // If a supplier is selected, only keep POs that match this supplier by ID or name
      if (grnSupplierId) {
        const matchId = p.supplier_id != null && Number(p.supplier_id) === Number(grnSupplierId);
        const matchName = Boolean(
          grnSelectedSupplier?.supplier_name &&
          p.supplier_name &&
          p.supplier_name.trim().toLowerCase() === grnSelectedSupplier.supplier_name.trim().toLowerCase()
        );
        return matchId || matchName;
      }

      // If no supplier is selected yet, show all eligible orders
      return true;
    });
  }, [purchaseOrders, grnPoId, grnSupplierId, grnSelectedSupplier]);

  // Due date = invoice date + supplier payment terms, unless entered by hand.
  useEffect(() => {
    if (grnDueDateTouched) return;
    const days = paymentTermDays(grnSelectedSupplier?.payment_terms);
    setGrnDueDate(days !== null && grnInvoiceDate ? addDaysIso(grnInvoiceDate, days) : "");
  }, [grnSelectedSupplier?.payment_terms, grnInvoiceDate, grnDueDateTouched]);

  // Bill footer, mirroring the server-side calculation in create_goods_receipt.
  const grnTotals = useMemo(() => {
    const lines = grnItems.map(computeGrnLine);
    const sum = (k: keyof ReturnType<typeof computeGrnLine>) => round2(lines.reduce((acc, l) => acc + l[k], 0));
    const taxable = sum("taxable");
    const gst = sum("gst");
    const billDiscount = toNum(grnBillDiscount);
    const adjustment = toNum(grnAdjustment);
    const beforeRound = round2(taxable + gst - billDiscount + adjustment);
    const net = Math.floor(beforeRound + 0.5);
    const invoiceAmount = String(grnInvoiceAmount).trim() === "" ? null : toNum(grnInvoiceAmount);
    return {
      lines,
      itemCount: grnItems.filter((it) => it.medicine_name.trim()).length,
      qty: sum("qty"),
      free: sum("free"),
      gross: sum("gross"),
      lineDiscount: sum("discount"),
      taxable,
      gst,
      billDiscount,
      adjustment,
      roundOff: round2(net - beforeRound),
      net,
      invoiceAmount,
      mismatch: invoiceAmount !== null && Math.abs(invoiceAmount - net) >= 1 ? round2(invoiceAmount - net) : 0,
    };
  }, [grnItems, grnBillDiscount, grnAdjustment, grnInvoiceAmount]);

  const resetGrnForm = () => {
    setGrnSupplierId(null);
    setGrnInvoiceNo("");
    setGrnInvoiceDate(todayIST());
    setGrnPoId(null);
    setGrnStockSource("CASH");
    setGrnDueDate("");
    setGrnDueDateTouched(false);
    setGrnPaymentType("CREDIT");
    setGrnBillDiscount("");
    setGrnAdjustment("");
    setGrnInvoiceAmount("");
    setGrnNotes("");
    setGrnItems([blankGrnItem()]);
  };

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

      if (supRes?.suppliers) {
        setSuppliers(supRes.suppliers);
      }
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

  const handleOpenNewPrModal = () => {
    setPrSupplierId(null);
    setPrSupplierPhone("");
    setPrUrgency("normal");
    setPrNotes("");
    setPrItems([{ medicine_name: "", strength_form: "", quantity: "", unit: "", notes: "" }]);
    setPrShareWhatsApp(true);
    setPrModalError(null);
    setNewPrModalOpen(true);
  };

  const totalMedicines = prItems.filter((i) => i.medicine_name.trim() !== "").length;
  const totalUnits = prItems.reduce((acc, i) => acc + (parseInt(String(i.quantity)) || 0), 0);

  const allMedicineOptions = useMemo(() => {
    const masterNames = medicinesMaster.filter(isActiveMedicine).map((m) => m.name.trim()).filter(Boolean);
    const combined = Array.from(new Set([...DEFAULT_MEDICINES, ...masterNames]));
    return combined.sort((a, b) => a.localeCompare(b));
  }, [medicinesMaster]);

  const handleAddPrItem = () => {
    setPrItems((prev) => [
      ...prev,
      { medicine_name: "", strength_form: "", quantity: "", unit: "", notes: "" },
    ]);
  };

  const handleRemovePrItem = (idx: number) => {
    if (prItems.length <= 1) return;
    setPrItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdatePrItem = (idx: number, field: keyof PrLineItem, value: any) => {
    setPrItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  useEffect(() => {
    void loadData();

    // Check on mount or navigation if PR modal should open or tab switch
    const shouldOpen = typeof window !== "undefined" ? sessionStorage.getItem("pharmacy_purchases_open_new_pr") : null;
    const targetTab = typeof window !== "undefined" ? sessionStorage.getItem("pharmacy_purchases_tab") : null;
    const prefillMed = typeof window !== "undefined" ? sessionStorage.getItem("pharmacy_purchases_prefill_med") : null;

    if (targetTab === "pr" || targetTab === "po" || targetTab === "grn" || targetTab === "grn_history" || targetTab === "returns") {
      setActiveTab(targetTab as any);
      sessionStorage.removeItem("pharmacy_purchases_tab");
    }

    if (
      shouldOpen === "true" ||
      (typeof window !== "undefined" &&
        (window.location.pathname.includes("pharmacy-purchases-pr") || window.location.search.includes("new_pr=true")))
    ) {
      if (typeof window !== "undefined") sessionStorage.removeItem("pharmacy_purchases_open_new_pr");
      setActiveTab("pr");
      setPrSupplierId(null);
      setPrSupplierPhone("");
      setPrUrgency("normal");
      setPrNotes("");
      if (prefillMed) {
        if (typeof window !== "undefined") sessionStorage.removeItem("pharmacy_purchases_prefill_med");
        setPrItems([{ medicine_name: prefillMed, strength_form: "", quantity: "", unit: "", notes: "Stock reorder" }]);
      } else {
        setPrItems([{ medicine_name: "", strength_form: "", quantity: "", unit: "", notes: "" }]);
      }
      setPrShareWhatsApp(true);
      setPrModalError(null);
      setNewPrModalOpen(true);
    }
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
      ["GRN Number", "Supplier", "Supplier Invoice", "Invoice Date", "Due Date", "Bill Type", "Classification", "Taxable", "GST", "Net Payable", "Status"],
      filteredGoodsReceipts.map((g) => [
        g.grn_no,
        g.supplier_name || "",
        g.supplier_invoice_no || "",
        g.received_date || "",
        g.due_date || "",
        g.payment_type || "",
        g.stock_source,
        g.taxable_amount ?? "",
        g.gst_amount ?? "",
        g.net_amount ?? "",
        g.status,
      ])
    );
  };

  // Look up the master catalog's form/packaging for a medicine name, so the
  // unit type can be suggested instead of re-typed on every GRN line.
  const suggestUnitType = (medicineName: string): string | null => {
    const match = medicinesMaster.find((m) => m.name.trim().toLowerCase() === medicineName.trim().toLowerCase());
    if (!match) return null;
    const candidate = match.category || match.dosage_form || match.unit;
    if (!candidate) return null;
    const known = unitTypes.find((u) => u.toLowerCase().startsWith(candidate.toLowerCase()) || candidate.toLowerCase().startsWith(u.toLowerCase().split(" ")[0].toLowerCase()));
    return known || candidate;
  };

  // Add Item to GRN draft
  const handleAddGrnItem = () => {
    setGrnItems([...grnItems, blankGrnItem()]);
  };

  // When a Purchase Order is selected in "Link to Purchase Order (optional)",
  // auto-reflect the selected medicine, quantity, unit form, and cost into the GRN lines!
  const handleLinkPurchaseOrder = (id: number | null) => {
    setGrnPoId(id);
    if (!id) return;

    const po = purchaseOrders.find((p) => p.id === id);
    if (!po) return;

    // 1. Auto-set supplier
    if (po.supplier_id) {
      setGrnSupplierId(po.supplier_id);
    } else if (po.supplier_name) {
      const matchByName = suppliers.find(
        (s) => s.supplier_name.trim().toLowerCase() === po.supplier_name?.trim().toLowerCase()
      );
      if (matchByName) {
        setGrnSupplierId(matchByName.id);
      }
    }

    // 2. Auto-set stock classification if set on PO
    if ((po as any).stock_source === "CASH" || (po as any).stock_source === "INSURANCE") {
      setGrnStockSource((po as any).stock_source);
    }

    // 3. Resolve master details and linked PR item details
    const master = findMasterMedicine(po.medicine_name);
    const linkedPr = (po as any).pr_id
      ? purchaseRequests.find((pr) => pr.id === (po as any).pr_id)
      : undefined;
    const linkedPrItem = linkedPr?.items?.find(
      (it) => it.medicine_name.trim().toLowerCase() === po.medicine_name.trim().toLowerCase()
    );

    const unitType =
      linkedPrItem?.unit ||
      suggestUnitType(po.medicine_name) ||
      master?.dosage_form ||
      master?.unit ||
      "Tablet";

    const costVal =
      po.unit_cost && Number(po.unit_cost) > 0
        ? po.unit_cost
        : linkedPrItem?.estimated_unit_cost && Number(linkedPrItem.estimated_unit_cost) > 0
        ? linkedPrItem.estimated_unit_cost
        : "";

    const gstVal =
      master && master.gst_rate !== null && master.gst_rate !== undefined
        ? master.gst_rate
        : "";

    const newLine: GoodsReceiptItem = {
      ...blankGrnItem(),
      medicine_id: master?.id,
      medicine_name: po.medicine_name,
      manufacturer: master?.manufacturer || "",
      hsn_code: master?.hsn_code || "",
      received_qty: po.quantity || 1,
      unit_type: unitType,
      unit_cost: costVal,
      gst_rate: gstVal,
      storage_location: "",
    };

    // If lines are empty or single default blank row, replace it
    const isSingleBlank =
      grnItems.length <= 1 &&
      (!grnItems[0] || (!grnItems[0].medicine_name.trim() && !grnItems[0].batch_no.trim()));

    if (isSingleBlank) {
      setGrnItems([newLine]);
    } else {
      const emptyIdx = grnItems.findIndex(
        (it) => !it.medicine_name.trim() && !it.batch_no.trim()
      );
      if (emptyIdx !== -1) {
        const copy = [...grnItems];
        copy[emptyIdx] = newLine;
        setGrnItems(copy);
      } else {
        setGrnItems([newLine]);
      }
    }

    setNotice({
      type: "info",
      message: `Selected PO-${po.id}: Auto-reflected "${po.medicine_name}" (Qty: ${po.quantity}) into Received Medicine Batches.`,
    });
  };

  const handleUpdateGrnItem = (idx: number, field: keyof GoodsReceiptItem, val: any) => {
    const updated = [...grnItems];
    updated[idx] = { ...updated[idx], [field]: val };
    if (field === "medicine_name" && typeof val === "string") {
      const suggested = suggestUnitType(val);
      if (suggested) updated[idx].unit_type = suggested;
      const master = findMasterMedicine(val);
      updated[idx].medicine_id = master?.id;
      // Pre-fill GST from the medicine master; the user can still override it.
      if (master && master.gst_rate !== null && master.gst_rate !== undefined && String(updated[idx].gst_rate ?? "") === "") {
        updated[idx].gst_rate = master.gst_rate;
      }
      // Likewise HSN and manufacturer, when the line doesn't have them yet.
      if (master?.hsn_code && !String(updated[idx].hsn_code ?? "").trim()) updated[idx].hsn_code = master.hsn_code;
      if (master?.manufacturer && !String(updated[idx].manufacturer ?? "").trim()) updated[idx].manufacturer = master.manufacturer;
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
      if (toNum(item.mrp) > 0 && toNum(item.selling_price) > toNum(item.mrp)) {
        setNotice({ type: "warning", message: `${item.medicine_name}: Sale Rate cannot exceed MRP.` });
        return;
      }
      const disc = toNum(item.discount_pct);
      if (disc < 0 || disc > 100) {
        setNotice({ type: "warning", message: `${item.medicine_name}: Discount % must be between 0 and 100.` });
        return;
      }
    }
    if (grnDueDate && grnInvoiceDate && grnDueDate < grnInvoiceDate) {
      setNotice({ type: "warning", message: "Due Date cannot be before the Invoice Date." });
      return;
    }

    setSubmittingGrn(true);
    try {
      const payload = {
        supplier_id: grnSupplierId,
        supplier_invoice_no: grnInvoiceNo,
        received_date: grnInvoiceDate,
        purchase_order_id: grnPoId,
        stock_source: grnStockSource,
        due_date: grnDueDate || undefined,
        payment_type: grnPaymentType,
        bill_discount: toNum(grnBillDiscount),
        adjustment: toNum(grnAdjustment),
        invoice_amount: grnTotals.invoiceAmount ?? undefined,
        notes: grnNotes.trim() || undefined,
        items: grnItems.map((it) => ({
          medicine_id: it.medicine_id ?? findMasterMedicine(it.medicine_name)?.id,
          medicine_name: it.medicine_name,
          manufacturer: it.manufacturer?.trim() || undefined,
          pack: it.pack?.trim() || undefined,
          hsn_code: it.hsn_code?.trim() || undefined,
          batch_no: it.batch_no,
          mfg_date: it.mfg_date || undefined,
          expiry_date: it.expiry_date,
          qty_received: Number(it.received_qty || 1),
          qty_accepted: Number(it.received_qty || 1),
          free_qty: toNum(it.free_qty),
          discount_pct: toNum(it.discount_pct),
          purchase_price: Number(it.unit_cost || 0),
          mrp: Number(it.mrp || 0),
          selling_price: Number(it.selling_price || 0),
          // Blank GST lets the server apply the medicine master's rate.
          gst_rate: String(it.gst_rate ?? "").trim() === "" ? undefined : Number(it.gst_rate),
          unit_type: it.unit_type,
          storage_location: it.storage_location || undefined,
        })),
      };

      const res = await apiFetch<{ grn_id: number; grn_no: string }>("/api/pharmacy/goods-receipts", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setNotice({ type: "success", message: `GRN ${res.grn_no} created as Draft. Ready for verification.` });
      resetGrnForm();
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

  // Helper to format WhatsApp requisition message text
  const buildPrWhatsAppMessage = (
    prNo: string,
    items: { medicine_name: string; strength_form?: string; quantity?: number | string; required_qty?: number | string; unit?: string; notes?: string }[],
    priority: string,
    supplierName?: string,
    phone?: string,
    notes?: string
  ): string => {
    const validItems = items.filter((it) => (it.medicine_name || "").trim() !== "");
    const totalQty = validItems.reduce((acc, it) => acc + (parseInt(String(it.quantity ?? it.required_qty ?? 0)) || 0), 0);

    const itemLines = validItems
      .map((it, idx) => {
        const qtyVal = it.quantity ?? it.required_qty ?? 1;
        const unitVal = it.unit || "Units";
        const formVal = it.strength_form ? ` (${it.strength_form})` : "";
        const noteVal = it.notes ? ` [${it.notes}]` : "";
        return `${idx + 1}. *${it.medicine_name}*${formVal} - ${qtyVal} ${unitVal}${noteVal}`;
      })
      .join("\n");

    const phoneStr = (phone || "").trim();

    return [
      `*PURCHASE REQUEST: ${prNo}*`,
      `🏥 *Hospital Pharmacy Requisition*`,
      `--------------------------------`,
      `*Supplier:* ${supplierName || "Valued Supplier"}${phoneStr ? ` (📱 ${phoneStr})` : ""}`,
      `*Urgency:* ${priority.toUpperCase()}`,
      `--------------------------------`,
      `*Medicine Items (${validItems.length} medicines • ${totalQty} total units):*`,
      itemLines || "No items listed",
      `--------------------------------`,
      notes ? `*Clinical Remarks / Reason:* ${notes}\n--------------------------------` : "",
      `Please confirm stock availability and send quotation / dispatch timeline.`,
      `Thank you!`,
    ]
      .filter(Boolean)
      .join("\n");
  };

  // Helper to construct WhatsApp URL:
  // By default, opens WhatsApp chat directly (https://api.whatsapp.com/send?text=...)
  // so if a contact is not saved in contacts, WhatsApp will not block with
  // "The number isn't on WhatsApp" - it opens WhatsApp chat to select the recipient.
  const getWhatsAppPrUrl = (
    prNo: string,
    items: { medicine_name: string; strength_form?: string; quantity?: number | string; required_qty?: number | string; unit?: string; notes?: string }[],
    priority: string,
    supplierName?: string,
    phone?: string,
    notes?: string,
    useDirectPhone: boolean = true
  ) => {
    const message = buildPrWhatsAppMessage(prNo, items, priority, supplierName, phone, notes);
    const encoded = encodeURIComponent(message);

    if (useDirectPhone && phone) {
      let cleanDigits = phone.replace(/[^0-9]/g, "");
      if (cleanDigits.startsWith("0")) {
        cleanDigits = cleanDigits.replace(/^0+/, "");
      }
      const finalPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
      if (finalPhone) {
        return `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encoded}`;
      }
    }

    return `https://api.whatsapp.com/send?text=${encoded}`;
  };

  // Helper to share Purchase Request via WhatsApp - opens WhatsApp chat directly
  const sharePrViaWhatsApp = (
    prNo: string,
    items: { medicine_name: string; strength_form?: string; quantity?: number | string; required_qty?: number | string; unit?: string; notes?: string }[],
    priority: string,
    supplierName?: string,
    phone?: string,
    notes?: string
  ) => {
    const message = buildPrWhatsAppMessage(prNo, items, priority, supplierName, phone, notes);
    const waUrl = getWhatsAppPrUrl(prNo, items, priority, supplierName, phone, notes, true);

    // Copy requisition text to clipboard so it's always ready to paste
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(message);
      }
    } catch (e) {
      console.warn("Clipboard copy failed:", e);
    }

    setNotice({
      type: "success",
      message: `Opening WhatsApp chat for PR ${prNo}. Requisition text copied to clipboard!`,
    });

    const opened = window.open(waUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = waUrl;
    }
  };

  // Submit Purchase Request
  const handleCreatePr = async (shareOnWhatsApp?: boolean) => {
    const shouldShare = shareOnWhatsApp !== undefined ? shareOnWhatsApp : prShareWhatsApp;
    setPrModalError(null);

    if (!prSupplierId) {
      const msg = "Supplier name is mandatory. Please select a supplier.";
      setPrModalError(msg);
      setNotice({ type: "warning", message: msg });
      return;
    }

    const validItems = prItems.filter((it) => it.medicine_name.trim() !== "");
    if (validItems.length === 0) {
      const msg = "At least one medicine with a valid name is required.";
      setPrModalError(msg);
      setNotice({ type: "warning", message: msg });
      return;
    }

    for (const item of validItems) {
      const q = parseInt(String(item.quantity));
      if (isNaN(q) || q <= 0) {
        const msg = `Please enter a valid quantity for ${item.medicine_name}.`;
        setPrModalError(msg);
        setNotice({ type: "warning", message: msg });
        return;
      }
    }

    // Pre-open blank tab synchronously during user click gesture to avoid browser popup blockers!
    let waWindow: Window | null = null;
    if (shouldShare) {
      try {
        waWindow = window.open("about:blank", "_blank");
        if (waWindow) {
          waWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head><title>Opening WhatsApp...</title></head>
              <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0fdf4;">
                <div style="text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); max-width: 380px;">
                  <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">💬</div>
                  <h3 style="color: #166534; margin: 0 0 0.5rem 0;">Opening WhatsApp Chat...</h3>
                  <p style="color: #64748b; font-size: 0.88rem; margin: 0;">Submitting Purchase Request and loading WhatsApp chat.</p>
                </div>
              </body>
            </html>
          `);
        }
      } catch (err) {
        console.warn("Unable to pre-open window for WhatsApp:", err);
      }
    }

    setSubmittingPr(true);
    try {
      const res = await apiFetch<{ pr_id: number; pr_no: string }>("/api/pharmacy/purchase-requests", {
        method: "POST",
        body: JSON.stringify({
          priority: prUrgency,
          notes: prNotes,
          preferred_supplier_id: prSupplierId,
          supplier_id: prSupplierId,
          supplier_phone: prSupplierPhone.trim(),
          items: validItems.map((it) => ({
            medicine_name: it.medicine_name.trim(),
            strength_form: it.strength_form,
            required_qty: parseInt(String(it.quantity)) || 1,
            quantity: parseInt(String(it.quantity)) || 1,
            unit: it.unit,
            notes: it.notes,
          })),
        }),
      });

      const selectedSupplier = suppliers.find((s) => s.id === prSupplierId);
      const supplierName = selectedSupplier?.supplier_name || "Supplier";
      const prNo = res?.pr_no || `PR-${Date.now()}`;

      const message = buildPrWhatsAppMessage(
        prNo,
        validItems,
        prUrgency,
        supplierName,
        prSupplierPhone.trim(),
        prNotes
      );
      const waDirectUrl = prSupplierPhone.trim()
        ? getWhatsAppPrUrl(
            prNo,
            validItems,
            prUrgency,
            supplierName,
            prSupplierPhone.trim(),
            prNotes,
            true
          )
        : null;
      const waChatUrl = getWhatsAppPrUrl(
        prNo,
        validItems,
        prUrgency,
        supplierName,
        prSupplierPhone.trim(),
        prNotes,
        false
      );
      const finalUrl = waDirectUrl || waChatUrl;

      // Copy requisition text to clipboard automatically
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(message);
        }
      } catch (clipErr) {
        console.warn("Clipboard write failed:", clipErr);
      }

      if (shouldShare) {
        setLatestPrShareUrl(finalUrl);
        setLatestPrNo(prNo);
        setLatestPrText(message);
        setLatestPrDirectPhoneUrl(waDirectUrl);

        if (waWindow && !waWindow.closed) {
          waWindow.location.href = finalUrl;
        } else {
          // If popup window was blocked, trigger link directly
          const link = document.createElement("a");
          link.href = finalUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }

      setNotice({
        type: "success",
        message: shouldShare
          ? `Purchase Request ${prNo} submitted! WhatsApp chat opened and requisition copied to clipboard.`
          : `Purchase Request ${prNo} submitted for approval.`,
      });
      setNewPrModalOpen(false);
      setPrSupplierId(null);
      setPrSupplierPhone("");
      setPrItems(INITIAL_PR_ITEMS);
      setPrUrgency("normal");
      setPrNotes("");
      setPrModalError(null);
      void loadData();
    } catch (err) {
      if (waWindow && !waWindow.closed) {
        waWindow.close();
      }
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

  const [printingReport, setPrintingReport] = useState(false);

  const handlePrintPurchasesReport = async () => {
    if (printingReport) return;
    setPrintingReport(true);
    try {
      const now = new Date();
      const dateStr = formatIST(now, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      let payload: any;

      if (activeTab === "pr") {
        payload = {
          title: "Pharmacy Purchase Requests Report",
          subtitle: `Total Purchase Requests: ${purchaseRequests.length} · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "Purchase Requests Report",
          filename: `Pharmacy_Purchase_Requests_${toISTDateKey(now)}`,
          sections: [
            {
              title: "Purchase Requisitions Summary",
              headers: ["PR No", "Priority", "Preferred Supplier", "Status", "Items Count", "Requested Date"],
              rows: purchaseRequests.map((pr) => [
                pr.pr_no,
                (pr.priority || "NORMAL").toUpperCase(),
                pr.supplier_name || "-",
                (pr.status || "PENDING").toUpperCase(),
                `${pr.items?.length || 0} items`,
                pr.created_at ? formatDateOnlyIST(pr.created_at) : "-",
              ]),
            },
          ],
        };
      } else if (activeTab === "po") {
        const totalCost = purchaseOrders.reduce((sum, p) => sum + (p.total_cost || 0), 0);
        payload = {
          title: "Pharmacy Purchase Orders Report",
          subtitle: `Total Purchase Orders: ${purchaseOrders.length} · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "Purchase Orders Report",
          filename: `Pharmacy_Purchase_Orders_${toISTDateKey(now)}`,
          sections: [
            {
              title: "Approved & Active Purchase Orders",
              headers: ["PO Ref", "Medicine", "Qty", "Unit Cost", "Total Cost", "Supplier", "Status", "Order Date"],
              rows: purchaseOrders.map((p) => [
                `PO-${p.id}`,
                p.medicine_name,
                p.quantity,
                `₹${(p.unit_cost || 0).toFixed(2)}`,
                `₹${(p.total_cost || 0).toFixed(2)}`,
                p.supplier_name || "-",
                (p.status || "ORDERED").toUpperCase(),
                p.created_at ? formatDateOnlyIST(p.created_at) : "-",
              ]),
            },
          ],
          totals: {
            grand_total: `₹${totalCost.toFixed(2)}`,
          },
        };
      } else if (activeTab === "grn_history") {
        payload = {
          title: "Pharmacy Goods Receipt Notes (GRN) Inward History",
          subtitle: `Total GRN Deliveries: ${goodsReceipts.length} · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "GRN Inward History Report",
          filename: `Pharmacy_GRN_History_${toISTDateKey(now)}`,
          sections: [
            {
              title: "Inward Goods Receipt Notes",
              headers: ["GRN Number", "Supplier Invoice", "Supplier", "Stock Source", "Invoice Date", "Due Date", "Bill Type", "Net Payable", "Status", "Items"],
              rows: goodsReceipts.map((g) => [
                g.grn_no,
                g.supplier_invoice_no || "-",
                g.supplier_name || "-",
                g.stock_source,
                g.received_date || "-",
                g.due_date || "-",
                g.payment_type || "-",
                g.net_amount != null ? formatInr(g.net_amount) : "-",
                g.status.toUpperCase(),
                `${g.items?.length || 0} batches`,
              ]),
            },
          ],
        };
      } else {
        const totalPOCost = purchaseOrders.reduce((sum, p) => sum + (p.total_cost || 0), 0);
        payload = {
          title: "Pharmacy Purchases & Procurement Report",
          subtitle: `Inward Deliveries, Orders & Requisitions Comprehensive Report · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "Procurement Report",
          filename: `Pharmacy_Purchases_Report_${toISTDateKey(now)}`,
          sections: [
            {
              title: "Goods Receipt Notes (Recent Inward Deliveries)",
              headers: ["GRN Number", "Supplier Invoice", "Supplier", "Stock Source", "Date", "Status"],
              rows: goodsReceipts.slice(0, 15).map((g) => [
                g.grn_no,
                g.supplier_invoice_no || "-",
                g.supplier_name || "-",
                g.stock_source,
                g.received_date || "-",
                g.status.toUpperCase(),
              ]),
            },
            {
              title: "Active Purchase Orders",
              headers: ["PO Ref", "Medicine", "Qty", "Unit Cost", "Total Cost", "Supplier", "Status"],
              rows: purchaseOrders.slice(0, 15).map((p) => [
                `PO-${p.id}`,
                p.medicine_name,
                p.quantity,
                `₹${(p.unit_cost || 0).toFixed(2)}`,
                `₹${(p.total_cost || 0).toFixed(2)}`,
                p.supplier_name || "-",
                (p.status || "ORDERED").toUpperCase(),
              ]),
            },
            {
              title: "Purchase Requisitions",
              headers: ["PR No", "Priority", "Supplier", "Status", "Items", "Date"],
              rows: purchaseRequests.slice(0, 15).map((pr) => [
                pr.pr_no,
                (pr.priority || "NORMAL").toUpperCase(),
                pr.supplier_name || "-",
                (pr.status || "PENDING").toUpperCase(),
                `${pr.items?.length || 0} items`,
                pr.created_at ? formatDateOnlyIST(pr.created_at) : "-",
              ]),
            },
          ],
          totals: {
            grand_total: `₹${totalPOCost.toFixed(2)}`,
          },
        };
      }

      const { blob } = await generatePDFBlob(payload);
      printPDF(blob);
      setNotice({ type: "success", message: `Generated ${payload.title} for printing.` });
    } catch (error) {
      console.error("Print purchases report failed:", error);
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to generate and print report PDF.",
      });
    } finally {
      setPrintingReport(false);
    }
  };

  return (
    <div className="pharmacy-theme-page" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Topbar / Breadcrumbs */}
      <div className="pharmacy-topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div className="pharmacy-breadcrumb" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
          <span style={{ cursor: "pointer", color: "#3b82f6", fontWeight: 600 }} onClick={() => window.history.back()}>Ayu Polyclinic & Emergency Clinic</span>
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
            onClick={handleOpenNewPrModal}
          >
            + New Purchase Request
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handlePrintPurchasesReport()}
            disabled={printingReport}
            title="Generate and print standard PDF report"
          >
            {printingReport ? "Generating..." : "Print Report"}
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
                onChange={(e) => {
                  const newSupId = parseInt(e.target.value) || null;
                  setGrnSupplierId(newSupId);
                  // If a PO is currently linked, verify it belongs to this newly selected supplier; otherwise unlink it.
                  if (grnPoId) {
                    const currentPo = purchaseOrders.find((p) => p.id === grnPoId);
                    if (currentPo) {
                      const newSupplier = suppliers.find((s) => s.id === newSupId);
                      const matchId = currentPo.supplier_id != null && newSupId != null && Number(currentPo.supplier_id) === Number(newSupId);
                      const matchName = Boolean(
                        newSupplier?.supplier_name &&
                        currentPo.supplier_name &&
                        currentPo.supplier_name.trim().toLowerCase() === newSupplier.supplier_name.trim().toLowerCase()
                      );
                      if (!matchId && !matchName) {
                        setGrnPoId(null);
                      }
                    } else {
                      setGrnPoId(null);
                    }
                  }
                }}
              >
                <option value="">Choose supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.supplier_name}</option>
                ))}
              </select>
              {grnSelectedSupplier && (grnSelectedSupplier.gst_number || grnSelectedSupplier.drug_license_no || grnSelectedSupplier.payment_terms) && (
                <p style={{ margin: "4px 0 0 0", fontSize: "0.72rem", color: "#64748b", lineHeight: 1.4 }}>
                  {grnSelectedSupplier.gst_number && <>GSTIN: {grnSelectedSupplier.gst_number}<br /></>}
                  {grnSelectedSupplier.drug_license_no && <>DL No: {grnSelectedSupplier.drug_license_no}<br /></>}
                  {grnSelectedSupplier.payment_terms && <>Terms: {grnSelectedSupplier.payment_terms}</>}
                </p>
              )}
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
              <label htmlFor="grn-due-date" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Due Date:
              </label>
              <input
                id="grn-due-date"
                type="date"
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={grnDueDate}
                min={grnInvoiceDate || undefined}
                onChange={(e) => {
                  setGrnDueDateTouched(true);
                  setGrnDueDate(e.target.value);
                }}
              />
              {!grnDueDateTouched && grnDueDate && (
                <p style={{ margin: "4px 0 0 0", fontSize: "0.72rem", color: "#64748b" }}>From supplier payment terms</p>
              )}
            </div>

            <div>
              <label htmlFor="grn-payment-type" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Bill Type:
              </label>
              <select
                id="grn-payment-type"
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={grnPaymentType}
                onChange={(e) => setGrnPaymentType(e.target.value as "CREDIT" | "CASH")}
              >
                <option value="CREDIT">Credit</option>
                <option value="CASH">Cash</option>
              </select>
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
              <label htmlFor="grn-po-id-select" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Link to Purchase Order (optional):
              </label>
              <select
                id="grn-po-id-select"
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={grnPoId || ""}
                onChange={(e) => {
                  const id = parseInt(e.target.value) || null;
                  handleLinkPurchaseOrder(id);
                }}
              >
                <option value="">Not linked to an order</option>
                {grnAvailablePurchaseOrders.length === 0 && grnSupplierId ? (
                  <option value="" disabled>
                    No open purchase orders for {grnSelectedSupplier?.supplier_name || "this supplier"}
                  </option>
                ) : (
                  grnAvailablePurchaseOrders.map((p) => (
                    <option key={p.id} value={p.id}>
                      PO-{p.id} -- {p.medicine_name} (Qty {p.quantity}{p.supplier_name ? `, ${p.supplier_name}` : ""})
                    </option>
                  ))
                )}
              </select>
              {grnPoId ? (
                <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "#00828a" }}>
                  This GRN will mark PO-{grnPoId} as received once verified.
                </p>
              ) : grnSupplierId && grnAvailablePurchaseOrders.length > 0 ? (
                <p style={{ margin: "4px 0 0 0", fontSize: "0.72rem", color: "#64748b" }}>
                  Showing {grnAvailablePurchaseOrders.length} open purchase order{grnAvailablePurchaseOrders.length === 1 ? "" : "s"} for {grnSelectedSupplier?.supplier_name}.
                </p>
              ) : null}
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
              <table className="pharmacy-data-table" style={{ width: "100%", minWidth: "1700px", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "0.5rem", minWidth: "200px" }}>Medicine Name *</th>
                    <th style={{ padding: "0.5rem", width: "100px" }}>Mfr</th>
                    <th style={{ padding: "0.5rem", width: "80px" }}>Pack</th>
                    <th style={{ padding: "0.5rem", width: "140px" }}>Unit / Form *</th>
                    <th style={{ padding: "0.5rem", width: "130px" }}>Store / Rack</th>
                    <th style={{ padding: "0.5rem", width: "100px" }}>HSN</th>
                    <th style={{ padding: "0.5rem", width: "120px" }}>Batch No *</th>
                    <th style={{ padding: "0.5rem", width: "130px" }}>Expiry Date *</th>
                    <th style={{ padding: "0.5rem", width: "70px", textAlign: "center" }}>Qty *</th>
                    <th style={{ padding: "0.5rem", width: "65px", textAlign: "center" }} title="Free / scheme quantity: added to stock, not billed">Free</th>
                    <th style={{ padding: "0.5rem", width: "85px", textAlign: "right" }}>Rate (₹)</th>
                    <th style={{ padding: "0.5rem", width: "80px", textAlign: "right" }}>MRP (₹)</th>
                    <th style={{ padding: "0.5rem", width: "85px", textAlign: "right" }} title="Price charged to patients at dispense; cannot exceed MRP">Sale Rate (₹)</th>
                    <th style={{ padding: "0.5rem", width: "65px", textAlign: "right" }}>Disc %</th>
                    <th style={{ padding: "0.5rem", width: "65px", textAlign: "right" }}>GST %</th>
                    <th style={{ padding: "0.5rem", width: "100px", textAlign: "right" }}>Amount (₹)</th>
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
                        <input
                          type="text"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px" }}
                          value={item.manufacturer ?? ""}
                          onChange={(e) => handleUpdateGrnItem(idx, "manufacturer", e.target.value)}
                          placeholder="Mfr"
                          aria-label={`Manufacturer, line ${idx + 1}`}
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="text"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px" }}
                          value={item.pack ?? ""}
                          onChange={(e) => handleUpdateGrnItem(idx, "pack", e.target.value)}
                          placeholder="1x10"
                          aria-label={`Pack, line ${idx + 1}`}
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <select
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px" }}
                          value={item.unit_type}
                          onChange={(e) => handleUpdateGrnItem(idx, "unit_type", e.target.value)}
                        >
                          {[...unitTypes, ...(item.unit_type && !unitTypes.includes(item.unit_type) ? [item.unit_type] : [])].map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <select
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px" }}
                          value={item.storage_location || ""}
                          onChange={(e) => handleUpdateGrnItem(idx, "storage_location", e.target.value)}
                          aria-label={`Store or rack, line ${idx + 1}`}
                        >
                          <option value="">Not set</option>
                          {storageLocationOptions.map((loc) => (
                            <option key={loc.value} value={loc.value}>{loc.label}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px" }}
                          value={item.hsn_code ?? ""}
                          onChange={(e) => handleUpdateGrnItem(idx, "hsn_code", e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                          placeholder="3004"
                          aria-label={`HSN code, line ${idx + 1}`}
                        />
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
                          min={0}
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px", textAlign: "center" }}
                          value={item.free_qty ?? ""}
                          placeholder="0"
                          onChange={(e) => handleUpdateGrnItem(idx, "free_qty", e.target.value)}
                          aria-label={`Free quantity, line ${idx + 1}`}
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
                          aria-invalid={toNum(item.mrp) > 0 && toNum(item.selling_price) > toNum(item.mrp)}
                          title={toNum(item.mrp) > 0 && toNum(item.selling_price) > toNum(item.mrp) ? "Sale rate exceeds MRP" : undefined}
                        />
                      </td>
                      <td style={{ padding: "0.4rem" }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          className="ui-input"
                          style={{ width: "100%", padding: "4px 8px", textAlign: "right" }}
                          value={item.discount_pct ?? ""}
                          placeholder="0"
                          onChange={(e) => handleUpdateGrnItem(idx, "discount_pct", e.target.value)}
                          aria-label={`Discount percent, line ${idx + 1}`}
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
                      <td style={{ padding: "0.4rem", textAlign: "right", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                        {formatInr(grnTotals.lines[idx]?.amount)}
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
                {medicinesMaster.filter(isActiveMedicine).map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Bill Summary: mirrors the footer of the supplier's tax invoice */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem", marginTop: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label htmlFor="grn-invoice-amount" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Invoice Net Amount (as printed on bill):
                </label>
                <Input
                  id="grn-invoice-amount"
                  type="number"
                  step="0.01"
                  min={0}
                  value={grnInvoiceAmount}
                  onChange={(e) => setGrnInvoiceAmount(e.target.value)}
                  placeholder="e.g. 6928.00"
                />
                {grnTotals.invoiceAmount !== null && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", fontWeight: 600, color: grnTotals.mismatch ? "#b91c1c" : "#15803d" }}>
                    {grnTotals.mismatch
                      ? `Does not match calculated net payable (difference ${formatInr(grnTotals.mismatch)}). Check quantities, rates and discounts.`
                      : "Matches calculated net payable."}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="grn-notes" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Notes:
                </label>
                <textarea
                  id="grn-notes"
                  className="ui-input"
                  rows={3}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1", resize: "vertical" }}
                  value={grnNotes}
                  onChange={(e) => setGrnNotes(e.target.value)}
                  placeholder="e.g. Received in good condition, 1 strip short"
                />
              </div>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem", fontSize: "0.85rem" }}>
              {(
                [
                  ["Items / Units", `${grnTotals.itemCount} items · ${grnTotals.qty} billed${grnTotals.free ? ` + ${grnTotals.free} free` : ""}`],
                  ["Gross (Qty × Rate)", formatInr(grnTotals.gross)],
                  ["Less: Line Discount", `− ${formatInr(grnTotals.lineDiscount)}`],
                  ["Taxable Value", formatInr(grnTotals.taxable)],
                  ["CGST", formatInr(grnTotals.gst / 2)],
                  ["SGST", formatInr(grnTotals.gst / 2)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#475569" }}>
                  <span>{label}</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{value}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", color: "#475569" }}>
                <label htmlFor="grn-bill-discount">Less: Bill Discount (₹)</label>
                <input
                  id="grn-bill-discount"
                  type="number"
                  min={0}
                  step="0.01"
                  className="ui-input"
                  style={{ width: "110px", padding: "3px 8px", textAlign: "right" }}
                  value={grnBillDiscount}
                  placeholder="0.00"
                  onChange={(e) => setGrnBillDiscount(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", color: "#475569" }}>
                <label htmlFor="grn-adjustment" title="Credit note, freight or other +/- adjustment printed on the bill">
                  Adjustment / Cr. Note (±₹)
                </label>
                <input
                  id="grn-adjustment"
                  type="number"
                  step="0.01"
                  className="ui-input"
                  style={{ width: "110px", padding: "3px 8px", textAlign: "right" }}
                  value={grnAdjustment}
                  placeholder="0.00"
                  onChange={(e) => setGrnAdjustment(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#475569" }}>
                <span>Rounding</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{grnTotals.roundOff >= 0 ? "+" : "−"} {formatInr(Math.abs(grnTotals.roundOff))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", paddingTop: "8px", borderTop: "2px solid #e2e8f0", fontSize: "1rem" }}>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>Net Payable</span>
                <span style={{ fontWeight: 800, color: "#00828a" }}>{formatInr(grnTotals.net)}</span>
              </div>
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
                    <th style={{ padding: "0.6rem 0.75rem" }}>Supplier</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Supplier Invoice</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Invoice Date</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Due Date</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Bill Type</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Classification</th>
                    <th style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>Net Payable</th>
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
                        <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{grn.supplier_name || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{grn.supplier_invoice_no || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#64748b" }}>{grn.received_date || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#64748b" }}>{grn.due_date || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{grn.payment_type ? grn.payment_type.charAt(0) + grn.payment_type.slice(1).toLowerCase() : "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{grn.stock_source}</td>
                        <td
                          style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}
                          title={
                            grn.invoice_amount != null && grn.net_amount != null && Math.abs(grn.invoice_amount - grn.net_amount) >= 1
                              ? `Bill says ${formatInr(grn.invoice_amount)}`
                              : undefined
                          }
                        >
                          {grn.net_amount != null ? formatInr(grn.net_amount) : "-"}
                          {grn.invoice_amount != null && grn.net_amount != null && Math.abs(grn.invoice_amount - grn.net_amount) >= 1 && (
                            <span style={{ color: "#b91c1c", marginLeft: "4px" }}>⚠</span>
                          )}
                        </td>
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
          {latestPrShareUrl && (
            <div
              style={{
                background: "#dcfce7",
                border: "1px solid #86efac",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div style={{ fontSize: "0.88rem", color: "#166534", fontWeight: 600 }}>
                ✓ Purchase Request <strong>{latestPrNo}</strong> submitted! WhatsApp chat ready.
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <a
                  href={latestPrShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "#25D366",
                    color: "white",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                  title="Opens WhatsApp chat picker so you can send to any contact or supplier"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                  </svg>
                  Open WhatsApp Chat ↗
                </a>
                {latestPrDirectPhoneUrl && (
                  <a
                    href={latestPrDirectPhoneUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: "#15803d",
                      color: "white",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      textDecoration: "none",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                    }}
                    title="Direct WhatsApp link to the entered supplier phone"
                  >
                    📱 Direct Link ↗
                  </a>
                )}
                {latestPrText && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(latestPrText);
                      setCopiedPrBanner(true);
                      setTimeout(() => setCopiedPrBanner(false), 2000);
                    }}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #86efac",
                      color: "#166534",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                    }}
                  >
                    {copiedPrBanner ? "✓ Copied!" : "📋 Copy PR Text"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLatestPrShareUrl(null);
                    setLatestPrText(null);
                    setLatestPrDirectPhoneUrl(null);
                  }}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#166534", fontWeight: 700, fontSize: "1rem" }}
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              Purchase Requests (Internal Requisitions)
            </h3>
            <Button
              type="button"
              className="primary"
              style={{ background: "#00828a", borderColor: "#00828a" }}
              onClick={handleOpenNewPrModal}
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
                  const matchedSupplier = suppliers.find((s) => s.id === (pr.preferred_supplier_id || pr.supplier_id));
                  const supplierName = pr.supplier_name || matchedSupplier?.supplier_name;
                  const supplierPhone = pr.supplier_phone || matchedSupplier?.phone;
                  const prItemsList = pr.items && pr.items.length > 0 ? pr.items : [{ medicine_name: "Supplies", quantity: 1 }];
                  return (
                    <tr key={pr.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.5rem", fontWeight: 700, color: "#00828a" }}>{pr.pr_no}</td>
                      <td style={{ padding: "0.5rem" }}>
                        {pr.items && pr.items.length > 0 ? (
                          pr.items.map((it, idx) => (
                            <div key={idx} style={{ color: "#0f172a", fontWeight: 600 }}>
                              {it.medicine_name}{" "}
                              {it.strength_form ? (
                                <span style={{ color: "#64748b", fontWeight: 400, fontSize: "0.78rem" }}>
                                  ({it.strength_form})
                                </span>
                              ) : null}
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
                              {it.required_qty ?? (it as any).quantity ?? 1}{" "}
                              {it.unit ? (
                                <span style={{ color: "#64748b", fontWeight: 400, fontSize: "0.78rem" }}>
                                  {it.unit}
                                </span>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {supplierName ? (
                          <div>
                            <span style={{ fontWeight: 600, color: "#1e293b" }}>{supplierName}</span>
                            {supplierPhone && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                📱 {supplierPhone}
                              </div>
                            )}
                          </div>
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
                        {pr.created_at ? formatDateOnlyIST(pr.created_at) : "-"}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
                          <Button
                            type="button"
                            title="Share PR via WhatsApp"
                            style={{
                              padding: "3px 8px",
                              fontSize: "0.78rem",
                              background: "#25D366",
                              borderColor: "#25D366",
                              color: "#ffffff",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontWeight: 600,
                            }}
                            onClick={() =>
                              sharePrViaWhatsApp(
                                pr.pr_no,
                                prItemsList,
                                pr.priority,
                                supplierName,
                                supplierPhone,
                                pr.notes
                              )
                            }
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                            </svg>
                            WhatsApp
                          </Button>
                          {isPending && (
                            <>
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
                            </>
                          )}
                        </div>
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
                        {po.created_at ? formatDateOnlyIST(po.created_at) : "-"}
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
                                gst_rate: findMasterMedicine(po.medicine_name)?.gst_rate ?? "",
                                medicine_id: findMasterMedicine(po.medicine_name)?.id,
                                unit_type: suggestUnitType(po.medicine_name) || "Tablet",
                                storage_location: storageLocationOptions[0]?.value,
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
        <Modal
          open={newPrModalOpen}
          onClose={() => {
            setNewPrModalOpen(false);
            setPrModalError(null);
          }}
          hideHeader
          className="ui-modal-wide"
        >
          <div style={{ padding: "1.75rem", maxWidth: "980px", margin: "0 auto", color: "#0f172a" }}>
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                paddingBottom: "18px",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: "22px",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  background: "#2563eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  boxShadow: "0 4px 8px rgba(37, 99, 235, 0.25)",
                  flexShrink: 0,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 14v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
                  <path d="M9 3h6" />
                  <path d="M10 3v4" />
                  <path d="M14 3v4" />
                  <line x1="12" y1="12" x2="12" y2="16" />
                  <line x1="10" y1="14" x2="14" y2="14" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
                  New Purchase Request
                </h2>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                  Add one medicine or build a bulk order for your supplier.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewPrModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "1.3rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  lineHeight: 1,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            {prModalError && (
              <div
                style={{
                  background: "#fee2e2",
                  border: "1px solid #fca5a5",
                  color: "#991b1b",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  marginBottom: "1.25rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontWeight: 500,
                }}
              >
                <span>⚠️</span>
                <span>{prModalError}</span>
              </div>
            )}

            {/* Top 3 Controls Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "20px" }}>
              {/* Supplier Name */}
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Supplier Name *
                </label>
                <select
                  className="ui-input"
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "0 10px",
                    borderRadius: "8px",
                    border: prModalError && !prSupplierId ? "1.5px solid #ef4444" : "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    fontSize: "0.88rem",
                    color: "#1e293b",
                    fontWeight: 500,
                  }}
                  value={prSupplierId || ""}
                  onChange={(e) => {
                    const sId = e.target.value ? parseInt(e.target.value) : null;
                    setPrSupplierId(sId);
                    if (prModalError) setPrModalError(null);
                    const selected = suppliers.find((s) => s.id === sId);
                    if (selected?.phone) {
                      setPrSupplierPhone(selected.phone);
                    } else {
                      setPrSupplierPhone("");
                    }
                  }}
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.supplier_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Supplier Mobile Number */}
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Supplier Mobile Number
                </label>
                <input
                  type="text"
                  className="ui-input"
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "0 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    fontSize: "0.88rem",
                    color: "#1e293b",
                  }}
                  placeholder="e.g. 9876543210 (Optional)"
                  value={prSupplierPhone}
                  onChange={(e) => {
                    setPrSupplierPhone(e.target.value);
                    if (prModalError) setPrModalError(null);
                  }}
                />
              </div>

              {/* Urgency */}
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Urgency
                </label>
                <select
                  className="ui-input"
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "0 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    fontSize: "0.88rem",
                    color: "#1e293b",
                  }}
                  value={prUrgency}
                  onChange={(e) => setPrUrgency(e.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT / Emergency</option>
                </select>
              </div>
            </div>

            {/* Medicine Items Section */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                backgroundColor: "#ffffff",
                padding: "16px",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", color: "#2563eb" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
                      <path d="m8.5 8.5 7 7" />
                    </svg>
                  </span>
                  <h3 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 700, color: "#0f172a" }}>
                    Medicine Items
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={handleAddPrItem}
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "7px 14px",
                    fontSize: "0.84rem",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> Add Medicine
                </button>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid #f1f5f9" }}>
                      <th style={{ padding: "8px 6px", width: "36px", textAlign: "center", fontWeight: 600 }}>#</th>
                      <th style={{ padding: "8px 8px", width: "24%", fontWeight: 600 }}>Medicine Name *</th>
                      <th style={{ padding: "8px 8px", width: "21%", fontWeight: 600 }}>Strength / Form</th>
                      <th style={{ padding: "8px 8px", width: "11%", fontWeight: 600 }}>Quantity *</th>
                      <th style={{ padding: "8px 8px", width: "15%", fontWeight: 600 }}>Unit</th>
                      <th style={{ padding: "8px 8px", width: "23%", fontWeight: 600 }}>Notes</th>
                      <th style={{ padding: "8px 6px", width: "40px", textAlign: "center", fontWeight: 600 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prItems.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f8fafc" }}>
                        <td style={{ padding: "8px 6px", textAlign: "center", fontWeight: 600, color: "#334155" }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: "8px 8px" }}>
                          <input
                            type="text"
                            className="ui-input"
                            style={{
                              width: "100%",
                              height: "38px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              backgroundColor: "#ffffff",
                              padding: "0 8px",
                              fontSize: "0.85rem",
                              color: "#0f172a",
                            }}
                            placeholder="Type medicine name"
                            list="pr-medicine-suggestions"
                            autoComplete="off"
                            aria-label={`Medicine name, line ${idx + 1}`}
                            value={item.medicine_name}
                            onChange={(e) => handleUpdatePrItem(idx, "medicine_name", e.target.value)}
                          />
                        </td>
                        <td style={{ padding: "8px 8px" }}>
                          <input
                            type="text"
                            className="ui-input"
                            style={{
                              width: "100%",
                              height: "38px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              backgroundColor: "#ffffff",
                              padding: "0 8px",
                              fontSize: "0.85rem",
                              color: "#0f172a",
                            }}
                            placeholder="e.g. 500 mg / Tablet"
                            autoComplete="off"
                            aria-label={`Strength or form, line ${idx + 1}`}
                            value={item.strength_form}
                            onChange={(e) => handleUpdatePrItem(idx, "strength_form", e.target.value)}
                          />
                        </td>
                        <td style={{ padding: "8px 8px" }}>
                          <input
                            type="number"
                            min={1}
                            placeholder="e.g. 50"
                            className="ui-input"
                            style={{
                              width: "100%",
                              height: "38px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              backgroundColor: "#ffffff",
                              padding: "0 8px",
                              fontSize: "0.85rem",
                              color: "#0f172a",
                              textAlign: "center",
                            }}
                            value={item.quantity}
                            onChange={(e) => handleUpdatePrItem(idx, "quantity", e.target.value)}
                          />
                        </td>
                        <td style={{ padding: "8px 8px" }}>
                          <input
                            type="text"
                            className="ui-input"
                            style={{
                              width: "100%",
                              height: "38px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              backgroundColor: "#ffffff",
                              padding: "0 8px",
                              fontSize: "0.85rem",
                              color: "#0f172a",
                            }}
                            placeholder="Type or pick unit"
                            list="pr-unit-suggestions"
                            autoComplete="off"
                            aria-label={`Unit, line ${idx + 1}`}
                            value={item.unit}
                            onChange={(e) => handleUpdatePrItem(idx, "unit", e.target.value)}
                          />
                        </td>
                        <td style={{ padding: "8px 8px" }}>
                          <input
                            type="text"
                            className="ui-input"
                            style={{
                              width: "100%",
                              height: "38px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              backgroundColor: "#ffffff",
                              padding: "0 10px",
                              fontSize: "0.85rem",
                              color: "#0f172a",
                            }}
                            placeholder="e.g. Brand preferred"
                            value={item.notes}
                            onChange={(e) => handleUpdatePrItem(idx, "notes", e.target.value)}
                          />
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleRemovePrItem(idx)}
                            disabled={prItems.length <= 1}
                            title={prItems.length <= 1 ? "At least one item required" : "Delete medicine"}
                            style={{
                              background: "transparent",
                              border: "none",
                              cursor: prItems.length <= 1 ? "not-allowed" : "pointer",
                              color: prItems.length <= 1 ? "#cbd5e1" : "#ef4444",
                              padding: "6px",
                              borderRadius: "6px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Typing suggestions only — any value can be entered manually. */}
                <datalist id="pr-medicine-suggestions">
                  {allMedicineOptions.map((med) => (
                    <option key={med} value={med} />
                  ))}
                </datalist>
                {/* Units follow Pharmacy → Settings → Dosage Forms & Categories. */}
                <datalist id="pr-unit-suggestions">
                  {dosageFormOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label !== opt.value ? opt.label : undefined}</option>
                  ))}
                </datalist>
              </div>

              {/* Card Footer: Add another medicine + dynamic summary */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleAddPrItem}
                  style={{
                    border: "1.5px solid #2563eb",
                    color: "#2563eb",
                    background: "#ffffff",
                    borderRadius: "9999px",
                    padding: "6px 16px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> Add another medicine
                </button>

                <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 500 }}>
                  {totalMedicines} medicines • {totalUnits} total units
                </div>
              </div>
            </div>

            {/* Clinical Remarks / Reason */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                Clinical Remarks / Reason
              </label>
              <textarea
                className="ui-input"
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  fontSize: "0.88rem",
                  color: "#0f172a",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
                placeholder="e.g. Current stock below reorder level..."
                value={prNotes}
                onChange={(e) => setPrNotes(e.target.value)}
              />
            </div>

            {/* WhatsApp Share Option */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "20px",
                padding: "10px 14px",
                background: "#f0fdf4",
                borderRadius: "8px",
                border: "1px solid #86efac",
              }}
            >
              <input
                type="checkbox"
                id="pr-share-whatsapp"
                checked={prShareWhatsApp}
                onChange={(e) => setPrShareWhatsApp(e.target.checked)}
                style={{ width: "17px", height: "17px", accentColor: "#16a34a", cursor: "pointer" }}
              />
              <label htmlFor="pr-share-whatsapp" style={{ fontSize: "0.85rem", color: "#166534", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span>Send requisition to Supplier via WhatsApp</span>
                {prSupplierPhone.trim() ? (
                  <span style={{ fontWeight: 500, color: "#15803d", fontSize: "0.82rem" }}>
                    (📱 {prSupplierPhone.trim()})
                  </span>
                ) : (
                  <span style={{ fontWeight: 400, color: "#64748b", fontSize: "0.8rem" }}>
                    (Opens WhatsApp chat picker)
                  </span>
                )}
              </label>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setNewPrModalOpen(false)}
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  color: "#334155",
                  borderRadius: "8px",
                  padding: "9px 20px",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={submittingPr}
                onClick={() => handleCreatePr()}
                style={{
                  background: "#2563eb",
                  border: "1px solid #2563eb",
                  color: "#ffffff",
                  borderRadius: "8px",
                  padding: "9px 22px",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  cursor: submittingPr ? "not-allowed" : "pointer",
                  opacity: submittingPr ? 0.7 : 1,
                }}
              >
                {submittingPr ? "Submitting..." : "Submit Requisition"}
              </button>

              <button
                type="button"
                disabled={submittingPr}
                onClick={() => handleCreatePr(true)}
                style={{
                  background: "#ffffff",
                  border: "1.5px solid #22c55e",
                  color: "#0f172a",
                  borderRadius: "8px",
                  padding: "9px 20px",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  cursor: submittingPr ? "not-allowed" : "pointer",
                  opacity: submittingPr ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#22c55e">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                </svg>
                Submit & Share with Supplier on WhatsApp
              </button>
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
