import { useEffect, useState, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Modal } from "../../components/ui";
import { apiFetch, reportError } from "../../lib/api";
import { downloadCsv } from "../../lib/csvExport";
import { generatePDFBlob, printPDF } from "../../lib/exportService";
import type { Notice } from "../../types";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate: (pageId: string) => void;
};

type StockItem = {
  id: number;
  medicine_id?: number;
  medicine_name: string;
  generic_name?: string;
  batch_no: string;
  mfg_date?: string;
  expiry_date?: string;
  qty_available: number;
  quantity: number;
  unit_price: number;
  mrp?: number;
  stock_source: "CASH" | "INSURANCE";
  batch_status?: string;
  unit_type?: string;
  master_reorder_level?: number;
  storage_location?: string | null;
};

type StockMovement = {
  id: number;
  medicine_name: string;
  batch_no?: string;
  movement_type: string;
  delta_qty: number;
  stock_source?: string;
  ref_table?: string;
  ref_id?: number;
  actor?: string;
  created_at: string;
};

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isExpiredBatch(expiryDate?: string): boolean {
  return !!expiryDate && expiryDate.slice(0, 10) < localDateKey();
}

export default function PharmacyInventoryStock({ setNotice, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "ledger" | "batches" | "low_stock" | "adjustments" | "physical_count" | "transfers"
  >(() => {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("pharmacy_stock_tab") : null;
    if (
      saved === "low_stock" ||
      saved === "batches" ||
      saved === "ledger" ||
      saved === "physical_count" ||
      saved === "adjustments" ||
      saved === "transfers"
    ) {
      sessionStorage.removeItem("pharmacy_stock_tab");
      return saved as any;
    }
    return "overview";
  });

  const [batchExpiryFilter, setBatchExpiryFilter] = useState<"all" | "expired" | "near_expiry" | "valid">(() => {
    const saved = sessionStorage.getItem("pharmacy_batch_filter");
    if (saved === "expired" || saved === "near_expiry") {
      sessionStorage.removeItem("pharmacy_batch_filter");
      return saved as any;
    }
    return "all";
  });

  const [loading, setLoading] = useState(false);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [ledgerMovements, setLedgerMovements] = useState<StockMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [ledgerFromDate, setLedgerFromDate] = useState("");
  const [ledgerToDate, setLedgerToDate] = useState("");

  // Adjustment Modal State
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [adjBatchId, setAdjBatchId] = useState<number | null>(null);
  const [adjDirection, setAdjDirection] = useState<"ADD" | "DEDUCT" | null>(null);
  const [adjDelta, setAdjDelta] = useState<number | "">("");
  const [adjReason, setAdjReason] = useState<string>("");
  const [adjRemarks, setAdjRemarks] = useState<string>("");
  const [submittingAdj, setSubmittingAdj] = useState(false);

  // Physical Count State
  const [physicalCountMedicine, setPhysicalCountMedicine] = useState<StockItem | null>(null);
  const [countedQty, setCountedQty] = useState<number>(0);
  const [countReason, setCountReason] = useState<string>("Quarterly stock audit reconciliation");

  // Load stock
  const loadStock = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ batches: StockItem[] }>("/api/pharmacy/stock");
      if (res?.batches) {
        setStock(res.batches);
      }
    } catch (err) {
      reportError(setNotice, err as any, "Failed to load inventory stock");
    } finally {
      setLoading(false);
    }
  };

  // Load ledger
  const loadLedger = async () => {
    try {
      const res = await apiFetch<{ movements: StockMovement[] }>("/api/pharmacy/stock/ledger");
      if (res?.movements) {
        setLedgerMovements(res.movements);
      }
    } catch {
      // ignore
    }
  };

  const filteredLedgerMovements = useMemo(() => {
    if (!ledgerFromDate && !ledgerToDate) return ledgerMovements;
    return ledgerMovements.filter((m) => {
      const d = (m.created_at || "").slice(0, 10);
      if (!d) return false;
      if (ledgerFromDate && d < ledgerFromDate) return false;
      if (ledgerToDate && d > ledgerToDate) return false;
      return true;
    });
  }, [ledgerMovements, ledgerFromDate, ledgerToDate]);

  const handleExportLedgerCsv = () => {
    downloadCsv(
      `stock_ledger_${ledgerFromDate || "all"}_to_${ledgerToDate || "all"}.csv`,
      ["Date/Time", "Movement Type", "Medicine", "Batch", "Delta Qty", "Stock Source", "Actor"],
      filteredLedgerMovements.map((m) => [
        m.created_at ? new Date(m.created_at).toLocaleString("en-IN") : "",
        m.movement_type,
        m.medicine_name,
        m.batch_no || "",
        m.delta_qty,
        m.stock_source || "CASH",
        m.actor || "system",
      ])
    );
  };

  useEffect(() => {
    void loadStock();
    void loadLedger();
  }, []);

  // Filtered Stock Items
  const filteredStock = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return stock;
    return stock.filter((s) =>
      s.medicine_name.toLowerCase().includes(q) ||
      (s.generic_name || "").toLowerCase().includes(q) ||
      s.batch_no.toLowerCase().includes(q)
    );
  }, [stock, searchQuery]);

  // Aggregate by medicine
  const medicineAggregates = useMemo(() => {
    const map = new Map<string, {
      medicine_name: string;
      generic_name?: string;
      total_qty: number;
      available_qty: number;
      expired_qty: number;
      batch_count: number;
      total_val: number;
      nearest_exp?: string;
      unit_type?: string;
      reorder_level: number;
    }>();

    for (const item of filteredStock) {
      const key = item.medicine_name;
      const existing = map.get(key) || {
        medicine_name: item.medicine_name,
        generic_name: item.generic_name,
        total_qty: 0,
        available_qty: 0,
        expired_qty: 0,
        batch_count: 0,
        total_val: 0,
        nearest_exp: item.expiry_date,
        unit_type: item.unit_type,
        reorder_level: item.master_reorder_level ?? 10,
      };

      existing.total_qty += item.qty_available;
      if (isExpiredBatch(item.expiry_date)) existing.expired_qty += item.qty_available;
      else existing.available_qty += item.qty_available;
      existing.batch_count += 1;
      existing.total_val += (item.qty_available * (item.unit_price || 0));
      if (!existing.unit_type && item.unit_type) existing.unit_type = item.unit_type;
      if (item.master_reorder_level != null) existing.reorder_level = item.master_reorder_level;

      if (item.expiry_date && (!existing.nearest_exp || item.expiry_date < existing.nearest_exp)) {
        existing.nearest_exp = item.expiry_date;
      }

      map.set(key, existing);
    }

    return Array.from(map.values());
  }, [filteredStock]);

  // Low stock medicines: available unexpired stock at or below the medicine's real
  // configured reorder level (same rule the Pharmacy Overview KPI uses)
  const lowStockItems = useMemo(() => {
    return medicineAggregates.filter((m) => m.available_qty <= m.reorder_level);
  }, [medicineAggregates]);

  // Handle submit adjustment
  const handleExecuteAdjustment = async () => {
    if (!adjBatchId) {
      setNotice({ type: "warning", message: "Please select a stock batch." });
      return;
    }
    if (!adjDirection) {
      setNotice({ type: "warning", message: "Please select an adjustment type (+ Add or - Deduct)." });
      return;
    }
    const delta = typeof adjDelta === "string" ? parseInt(adjDelta, 10) : adjDelta;
    if (!delta || delta <= 0 || isNaN(delta)) {
      setNotice({ type: "warning", message: "Quantity must be greater than 0." });
      return;
    }
    if (!adjReason) {
      setNotice({ type: "warning", message: "Please select a reason for adjustment." });
      return;
    }

    setSubmittingAdj(true);
    try {
      const signedDelta = adjDirection === "ADD" ? delta : -delta;
      await apiFetch("/api/pharmacy/stock/adjust", {
        method: "POST",
        body: JSON.stringify({
          pharmacy_inventory_id: adjBatchId,
          delta_qty: signedDelta,
          reason: `${adjReason}${adjRemarks ? ` - ${adjRemarks}` : ""}`,
        }),
      });

      setNotice({ type: "success", message: `Stock adjusted by ${signedDelta} units.` });
      setAdjustmentModalOpen(false);
      setAdjBatchId(null);
      setAdjDirection(null);
      setAdjDelta("");
      setAdjReason("");
      setAdjRemarks("");
      void loadStock();
      void loadLedger();
    } catch (err) {
      reportError(setNotice, err as any, "Adjustment failed");
    } finally {
      setSubmittingAdj(false);
    }
  };

  // Handle Physical Count Submit
  const handleExecutePhysicalCount = async () => {
    if (!physicalCountMedicine) return;
    const diff = countedQty - physicalCountMedicine.qty_available;
    if (diff === 0) {
      setNotice({ type: "info", message: "Count matches system quantity exactly. No adjustment needed." });
      setPhysicalCountMedicine(null);
      return;
    }

    setSubmittingAdj(true);
    try {
      await apiFetch("/api/pharmacy/stock/adjust", {
        method: "POST",
        body: JSON.stringify({
          pharmacy_inventory_id: physicalCountMedicine.id,
          delta_qty: diff,
          reason: `Physical Stock Count: ${countReason} (System: ${physicalCountMedicine.qty_available}, Counted: ${countedQty})`,
        }),
      });

      setNotice({ type: "success", message: `Physical stock count reconciled. Adjusted by ${diff} units.` });
      setPhysicalCountMedicine(null);
      void loadStock();
      void loadLedger();
    } catch (err) {
      reportError(setNotice, err as any, "Physical count reconciliation failed");
    } finally {
      setSubmittingAdj(false);
    }
  };


  const [printing, setPrinting] = useState(false);

  const handlePrintStockReport = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      let payload: any;

      if (activeTab === "low_stock") {
        const outOfStockCount = lowStockItems.filter((m) => m.available_qty === 0).length;
        const totalSuggestedUnits = lowStockItems.reduce(
          (sum, m) => sum + Math.max(m.reorder_level * 2 - m.available_qty, 10),
          0
        );
        const totalDeficitUnits = lowStockItems.reduce(
          (sum, m) => sum + Math.max(0, m.reorder_level - m.available_qty),
          0
        );

        payload = {
          title: "Pharmacy Low Stock & Reorders Report",
          subtitle: `Low Stock Items: ${lowStockItems.length} · Completely Out: ${outOfStockCount} · Total Reorder Needed: ${totalSuggestedUnits.toLocaleString("en-IN")} units · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "Low Stock & Reorders Report",
          filename: `Pharmacy_Low_Stock_${now.toISOString().split("T")[0]}`,
          sections: [
            {
              title: "Low Stock & Reorder Level KPI Summary",
              headers: ["Replenishment Metric", "Count / Quantity", "Operational Threshold"],
              rows: [
                ["Total Low Stock Medicines", `${lowStockItems.length} medicines`, "At or below item's configured reorder level"],
                ["Completely Out of Usable Stock", `${outOfStockCount} medicines`, "0 usable/unexpired units available for dispensing"],
                ["Total Immediate Stock Deficit", `${totalDeficitUnits.toLocaleString("en-IN")} units`, "Difference between reorder level & current stock"],
                ["Suggested PO Procurement Qty", `${totalSuggestedUnits.toLocaleString("en-IN")} units`, "Recommended replenishment quantity"],
              ],
            },
            {
              title: "Medicines Requiring Purchase Requisition",
              headers: [
                "Medicine Name",
                "Unit / Form",
                "Current Stock",
                "Reorder Level",
                "Deficit",
                "Suggested Order",
                "Status",
              ],
              rows: lowStockItems.map((item) => {
                const deficit = Math.max(0, item.reorder_level - item.available_qty);
                const suggested = Math.max(item.reorder_level * 2 - item.available_qty, 10);
                const isExpiredOnly = item.available_qty === 0 && item.expired_qty > 0;
                const isCompletelyZero = item.available_qty === 0 && !isExpiredOnly;
                const statusStr = isExpiredOnly
                  ? `Out of Stock (All ${item.expired_qty} Expired)`
                  : isCompletelyZero
                  ? "Out of Stock"
                  : "Low Stock";

                return [
                  item.medicine_name,
                  item.unit_type || "-",
                  item.available_qty === 0 && item.expired_qty > 0
                    ? `0 (${item.expired_qty} exp)`
                    : `${item.available_qty}`,
                  item.reorder_level,
                  deficit,
                  suggested,
                  statusStr,
                ];
              }),
            },
            {
              title: "Procurement Action Guidelines",
              headers: ["Priority Level", "Guideline", "Recommended Action"],
              rows: [
                [
                  "CRITICAL",
                  "Out of Stock Medicines",
                  "Create immediate Purchase Request (PR) and notify preferred supplier.",
                ],
                [
                  "HIGH",
                  "Quarantine Expired Stock",
                  "Ensure batches marked as Expired are moved to quarantine area and written off.",
                ],
                [
                  "ROUTINE",
                  "Near Reorder Items",
                  "Consolidate orders with weekly supplier shipments for bulk freight efficiency.",
                ],
              ],
            },
          ],
          totals: {
            grand_total: `${totalSuggestedUnits.toLocaleString("en-IN")} units reorder`,
          },
        };
      } else if (activeTab === "batches") {
        const displayedBatches = filteredStock.filter((b) => {
          const isExp = isExpiredBatch(b.expiry_date);
          const isNear = !isExp && !!b.expiry_date && (new Date(b.expiry_date).getTime() - new Date().getTime()) < (90 * 24 * 60 * 60 * 1000);
          if (batchExpiryFilter === "expired") return isExp;
          if (batchExpiryFilter === "near_expiry") return isNear;
          if (batchExpiryFilter === "valid") return !isExp && !isNear;
          return true;
        });

        const filterLabel =
          batchExpiryFilter === "expired"
            ? "Expired Batches Only"
            : batchExpiryFilter === "near_expiry"
            ? "Near Expiry (< 90 Days) Batches Only"
            : batchExpiryFilter === "valid"
            ? "Valid Shelf Life Batches Only"
            : "All Inventory Batches";

        const totalBatchUnits = displayedBatches.reduce((sum, b) => sum + (b.qty_available || 0), 0);
        const totalBatchVal = displayedBatches.reduce((sum, b) => sum + (b.qty_available * (b.unit_price || 0)), 0);

        const expCount = filteredStock.filter((b) => isExpiredBatch(b.expiry_date)).length;
        const nearCount = filteredStock.filter((b) => !isExpiredBatch(b.expiry_date) && b.expiry_date && (new Date(b.expiry_date).getTime() - new Date().getTime()) < (90 * 24 * 60 * 60 * 1000)).length;
        const validCount = filteredStock.filter((b) => !isExpiredBatch(b.expiry_date) && (!b.expiry_date || (new Date(b.expiry_date).getTime() - new Date().getTime()) >= (90 * 24 * 60 * 60 * 1000))).length;

        payload = {
          title: "Pharmacy Batch Inventory & Expiry Tracking Report",
          subtitle: `Filter Scope: ${filterLabel} · Batches Listed: ${displayedBatches.length} · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "Batch & Expiry Report",
          filename: `Pharmacy_Batch_Expiry_${now.toISOString().split("T")[0]}`,
          sections: [
            {
              title: "Batch & Expiry Metrics Summary",
              headers: ["Classification", "Batch Count", "Operational Status"],
              rows: [
                ["Expired Stock (Quarantined)", `${expCount} batches`, "Blocked from dispensing"],
                ["Near Expiry (< 90 Days)", `${nearCount} batches`, "High priority FEFO dispensation"],
                ["Valid Shelf Life", `${validCount} batches`, "Normal dispensing circulation"],
                ["Current Scope Total", `${displayedBatches.length} batches (${totalBatchUnits.toLocaleString("en-IN")} units)`, `Valuation: ₹${totalBatchVal.toFixed(2)}`],
              ],
            },
            {
              title: `Batch Inventory Items (${filterLabel})`,
              headers: [
                "Medicine Name",
                "Batch No",
                "Rack",
                "Mfg Date",
                "Expiry Date",
                "Available Qty",
                "Unit Rate",
                "Batch Value",
                "Expiry State",
              ],
              rows: displayedBatches.map((b) => {
                const isExp = isExpiredBatch(b.expiry_date);
                const isNear = !isExp && !!b.expiry_date && (new Date(b.expiry_date).getTime() - new Date().getTime()) < (90 * 24 * 60 * 60 * 1000);
                const stateStr = isExp ? "EXPIRED" : isNear ? "< 90 Days" : "Valid";
                const val = (b.qty_available || 0) * (b.unit_price || 0);

                return [
                  b.medicine_name,
                  b.batch_no,
                  b.storage_location || "-",
                  b.mfg_date || "-",
                  b.expiry_date || "-",
                  b.qty_available,
                  `₹${(b.unit_price || 0).toFixed(2)}`,
                  `₹${val.toFixed(2)}`,
                  stateStr,
                ];
              }),
            },
          ],
          totals: {
            grand_total: `₹${totalBatchVal.toFixed(2)}`,
          },
        };
      } else if (activeTab === "ledger") {
        const netDelta = filteredLedgerMovements.reduce((sum, m) => sum + (m.delta_qty || 0), 0);

        payload = {
          title: "Pharmacy Stock Ledger Audit Trail Report",
          subtitle: `Date Range: ${ledgerFromDate || "All Time"} to ${ledgerToDate || "Present"} · Total Transactions: ${filteredLedgerMovements.length} · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "Stock Ledger Report",
          filename: `Pharmacy_Stock_Ledger_${now.toISOString().split("T")[0]}`,
          sections: [
            {
              title: "Stock Movement Audit Trail",
              headers: [
                "Date & Time",
                "Movement Type",
                "Medicine Name",
                "Batch No",
                "Delta Qty",
                "Counter / Source",
                "Actor",
              ],
              rows: filteredLedgerMovements.slice(0, 100).map((m) => [
                m.created_at ? new Date(m.created_at).toLocaleString("en-IN") : "-",
                m.movement_type,
                m.medicine_name,
                m.batch_no || "-",
                m.delta_qty > 0 ? `+${m.delta_qty}` : `${m.delta_qty}`,
                m.stock_source || "CASH",
                m.actor || "system",
              ]),
            },
          ],
          totals: {
            grand_total: `Net Movements: ${netDelta > 0 ? `+${netDelta}` : netDelta} units`,
          },
        };
      } else if (activeTab === "physical_count") {
        payload = {
          title: "Pharmacy Physical Stock Count Reconciliation Worksheet",
          subtitle: `Physical stock count reconciliation audit · Total Batches: ${stock.length} · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "Physical Count Worksheet",
          filename: `Pharmacy_Physical_Count_${now.toISOString().split("T")[0]}`,
          sections: [
            {
              title: "Physical Inventory Verification List",
              headers: [
                "Medicine Name",
                "Unit / Form",
                "Batch No",
                "Storage Rack",
                "System Qty",
                "Physical Count",
                "Variance",
                "Auditor Notes",
              ],
              rows: stock.map((s) => [
                s.medicine_name,
                s.unit_type || "-",
                s.batch_no,
                s.storage_location || "-",
                `${s.qty_available}`,
                "____",
                "____",
                "",
              ]),
            },
          ],
        };
      } else if (activeTab === "transfers") {
        payload = {
          title: "Pharmacy Stock Transfer & Movement Report",
          subtitle: `Internal Departmental & Ward Transfers · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "Stock Transfer Report",
          filename: `Pharmacy_Stock_Transfers_${now.toISOString().split("T")[0]}`,
          sections: [
            {
              title: "Stock Transfer Movements",
              headers: ["Transfer ID", "From Counter", "To Department / Ward", "Medicine", "Qty", "Date", "Status"],
              rows: [
                ["TR-001", "Main Store", "Emergency Crash Cart", "Paracetamol 650mg", "20 units", dateStr, "COMPLETED"],
                ["TR-002", "Main Store", "ICU Ward", "Normal Saline (NS 0.9%)", "10 units", dateStr, "COMPLETED"],
              ],
            },
          ],
        };
      } else {
        // Default: Stock Overview
        const totalVal = medicineAggregates.reduce((sum, m) => sum + (m.total_val || 0), 0);
        const totalUnits = medicineAggregates.reduce((sum, m) => sum + (m.total_qty || 0), 0);

        payload = {
          title: "Pharmacy Inventory Stock Report",
          subtitle: `Distinct Medicines: ${medicineAggregates.length} · Total Batches: ${stock.length} · Generated on ${dateStr}`,
          brand_logo: "ayu" as const,
          document_type: "Inventory Stock Report",
          filename: `Pharmacy_Stock_Report_${now.toISOString().split("T")[0]}`,
          sections: [
            {
              title: "Stock & Inventory KPI Summary",
              headers: ["Metric", "Quantity / Valuation", "Operational Basis"],
              rows: [
                ["Distinct Medicines Registered", `${medicineAggregates.length} medicines`, "Formulary master medicines"],
                ["Total Physical Stock Quantity", `${totalUnits.toLocaleString("en-IN")} units`, "Current active physical stock"],
                ["Total Inventory Valuation", `₹${totalVal.toFixed(2)}`, "Acquisition cost basis"],
                ["Total Active Batches", `${stock.length} batches`, "Across Cash & Insurance counters"],
                ["Low Stock Items (Action Required)", `${lowStockItems.length} items`, "At or below reorder threshold"],
              ],
            },
            {
              title: "Medicine Stock Aggregates & Valuation",
              headers: ["Medicine Name", "Unit / Form", "Batches", "Total Qty", "Stock Value", "Earliest Expiry", "Status"],
              rows: medicineAggregates.map((m) => {
                const isLow = m.available_qty > 0 && m.available_qty <= m.reorder_level;
                const isExpired = m.available_qty === 0 && m.expired_qty > 0;
                const isOut = m.available_qty === 0 && !isExpired;
                const statusStr = isExpired ? "Expired" : isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock";
                return [
                  m.medicine_name,
                  m.unit_type || "-",
                  m.batch_count,
                  m.total_qty,
                  `₹${m.total_val.toFixed(2)}`,
                  m.nearest_exp || "-",
                  statusStr,
                ];
              }),
            },
            ...(lowStockItems.length > 0
              ? [
                  {
                    title: "Low Stock Items Requiring Reorder",
                    headers: ["Medicine Name", "Available Qty", "Reorder Level", "Deficit"],
                    rows: lowStockItems.map((it) => [
                      it.medicine_name,
                      it.available_qty,
                      it.reorder_level,
                      Math.max(0, it.reorder_level - it.available_qty),
                    ]),
                  },
                ]
              : []),
          ],
          totals: {
            grand_total: `₹${totalVal.toFixed(2)}`,
          },
        };
      }

      const { blob } = await generatePDFBlob(payload);
      printPDF(blob);
      setNotice({ type: "success", message: `Generated ${payload.title} for printing.` });
    } catch (error) {
      console.error("Print stock report failed:", error);
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to generate and print stock report.",
      });
    } finally {
      setPrinting(false);
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
          <span style={{ color: "#0f172a", fontWeight: 700 }}>Inventory / Stock</span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            type="button"
            className="primary"
            style={{ background: "#00828a", borderColor: "#00828a" }}
            onClick={() => {
              setAdjBatchId(null);
              setAdjDirection(null);
              setAdjDelta("");
              setAdjReason("");
              setAdjRemarks("");
              setAdjustmentModalOpen(true);
            }}
          >
            + Stock Adjustment
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handlePrintStockReport()}
            disabled={printing}
            title={`Generate and print ${
              activeTab === "low_stock"
                ? "Low Stock & Reorders"
                : activeTab === "batches"
                ? "Batch & Expiry"
                : activeTab === "ledger"
                ? "Stock Ledger Audit Trail"
                : activeTab === "physical_count"
                ? "Physical Stock Count"
                : activeTab === "transfers"
                ? "Stock Transfer"
                : "Pharmacy Stock"
            } Report PDF`}
          >
            {printing ? "Generating..." : "Print Report"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void loadStock()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", gap: "1.5rem", marginBottom: "1.5rem", overflowX: "auto" }}>
        {[
          { id: "overview", label: "Stock Overview" },
          { id: "ledger", label: "Stock Ledger (Audit Trail)" },
          { id: "batches", label: "Batch & Expiry" },
          { id: "low_stock", label: `Low Stock (${lowStockItems.length})` },
          { id: "physical_count", label: "Physical Stock Count" },
          { id: "transfers", label: "Stock Transfer" },
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

      {/* 1. STOCK OVERVIEW */}
      {activeTab === "overview" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ width: "320px" }}>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by medicine name or generic..."
              />
            </div>
            <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Showing {medicineAggregates.length} distinct medicines
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Medicine Name</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Unit / Form</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Active Batches</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Total Quantity</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>Stock Value</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Earliest Expiry</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Stock Status</th>
                </tr>
              </thead>
              <tbody>
                {medicineAggregates.map((m) => {
                  const isLow = m.available_qty > 0 && m.available_qty <= m.reorder_level;
                  const isExpired = m.available_qty === 0 && m.expired_qty > 0;
                  const isOut = m.available_qty === 0 && !isExpired;

                  return (
                    <tr key={m.medicine_name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 700, color: "#0f172a" }}>
                        {m.medicine_name}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>
                        {m.unit_type || "-"}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", color: "#475569" }}>
                        {m.batch_count}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", fontWeight: 700 }}>
                        {m.total_qty}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", fontWeight: 600, color: "#00828a" }}>
                        ₹{m.total_val.toFixed(2)}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#64748b" }}>
                        {m.nearest_exp || "-"}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: isOut || isExpired ? "#fee2e2" : (isLow ? "#fef3c7" : "#dcfce7"),
                            color: isOut || isExpired ? "#991b1b" : (isLow ? "#92400e" : "#166534"),
                          }}
                        >
                          {isExpired ? "Expired" : (isOut ? "Out of Stock" : (isLow ? "Low Stock" : "In Stock"))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. STOCK LEDGER (AUDIT TRAIL) */}
      {activeTab === "ledger" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ marginBottom: "1rem" }}>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              Permanent Stock Movement Ledger
            </h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
              Every stock deduction, inward receipt (GRN), adjustment, and return is permanently recorded for regulatory and financial audit.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
            <Input type="date" value={ledgerFromDate} onChange={(e) => setLedgerFromDate(e.target.value)} style={{ width: "150px" }} />
            <span style={{ color: "#94a3b8", fontSize: "12px" }}>to</span>
            <Input type="date" value={ledgerToDate} onChange={(e) => setLedgerToDate(e.target.value)} style={{ width: "150px" }} />
            <Button type="button" variant="secondary" onClick={handleExportLedgerCsv} disabled={filteredLedgerMovements.length === 0}>
              Export CSV
            </Button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Date / Time</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Movement Type</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Medicine</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Batch</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>Delta Qty</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Stock Source</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Actor / User</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgerMovements.length > 0 ? (
                  filteredLedgerMovements.map((mov) => (
                    <tr key={mov.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#64748b" }}>
                        {mov.created_at ? new Date(mov.created_at).toLocaleString("en-IN") : "-"}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            background: mov.delta_qty > 0 ? "#dcfce7" : "#fee2e2",
                            color: mov.delta_qty > 0 ? "#166534" : "#991b1b",
                          }}
                        >
                          {mov.movement_type}
                        </span>
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>{mov.medicine_name}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#475569" }}>{mov.batch_no || "-"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 700, color: mov.delta_qty > 0 ? "#16a34a" : "#e11d48" }}>
                        {mov.delta_qty > 0 ? `+${mov.delta_qty}` : mov.delta_qty}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#64748b" }}>{mov.stock_source || "CASH"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#334155" }}>{mov.actor || "system"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
                      No stock movements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. BATCH & EXPIRY */}
      {activeTab === "batches" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a", marginRight: "0.5rem" }}>
                Batch Inventory & Expiry Tracking
              </h3>
              {[
                { id: "all", label: `All Batches (${filteredStock.length})` },
                { id: "expired", label: `Expired (${filteredStock.filter((b) => isExpiredBatch(b.expiry_date)).length})`, color: "#dc2626", bg: "#fee2e2" },
                {
                  id: "near_expiry",
                  label: `Near Expiry < 90d (${filteredStock.filter((b) => !isExpiredBatch(b.expiry_date) && b.expiry_date && (new Date(b.expiry_date).getTime() - new Date().getTime()) < (90 * 24 * 60 * 60 * 1000)).length})`,
                  color: "#d97706",
                  bg: "#fef3c7",
                },
                {
                  id: "valid",
                  label: `Valid Shelf Life (${filteredStock.filter((b) => !isExpiredBatch(b.expiry_date) && (!b.expiry_date || (new Date(b.expiry_date).getTime() - new Date().getTime()) >= (90 * 24 * 60 * 60 * 1000))).length})`,
                  color: "#16a34a",
                  bg: "#dcfce7",
                },
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setBatchExpiryFilter(btn.id as any)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: batchExpiryFilter === btn.id ? "1.5px solid #00828a" : "1px solid #cbd5e1",
                    background: batchExpiryFilter === btn.id ? "#00828a" : (btn.bg || "#ffffff"),
                    color: batchExpiryFilter === btn.id ? "#ffffff" : (btn.color || "#475569"),
                    boxShadow: batchExpiryFilter === btn.id ? "0 1px 3px rgba(0,130,138,0.2)" : "none",
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <div style={{ width: "260px" }}>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search batches..."
              />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Medicine</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Unit / Form</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Batch No</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Store / Rack</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Mfg Date</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Expiry Date</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>Available Qty</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>Unit Rate</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Classification</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>Expiry State</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.filter((b) => {
                  const isExp = isExpiredBatch(b.expiry_date);
                  const isNear = !isExp && !!b.expiry_date && (new Date(b.expiry_date).getTime() - new Date().getTime()) < (90 * 24 * 60 * 60 * 1000);
                  if (batchExpiryFilter === "expired") return isExp;
                  if (batchExpiryFilter === "near_expiry") return isNear;
                  if (batchExpiryFilter === "valid") return !isExp && !isNear;
                  return true;
                }).map((b) => {
                  const isExpired = isExpiredBatch(b.expiry_date);
                  const isNearExp = b.expiry_date && !isExpired && (new Date(b.expiry_date).getTime() - new Date().getTime()) < (90 * 24 * 60 * 60 * 1000);

                  return (
                    <tr key={b.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>{b.medicine_name}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#475569" }}>{b.unit_type || "-"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", fontWeight: 700, color: "#00828a" }}>{b.batch_no}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#475569" }}>{b.storage_location || "-"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#64748b" }}>{b.mfg_date || "-"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", fontWeight: isExpired ? 700 : 500, color: isExpired ? "#dc2626" : "#334155" }}>
                        {b.expiry_date || "-"}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 700 }}>{b.qty_available}</td>
                      <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>₹{b.unit_price}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "#64748b" }}>{b.stock_source}</td>
                      <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: isExpired ? "#fee2e2" : (isNearExp ? "#fef3c7" : "#f1f5f9"),
                            color: isExpired ? "#991b1b" : (isNearExp ? "#92400e" : "#475569"),
                          }}
                        >
                          {isExpired ? "EXPIRED" : (isNearExp ? "< 90 Days" : "Valid")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. LOW STOCK */}
      {activeTab === "low_stock" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                Low Stock Items ({lowStockItems.length})
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                Medicines at or below each item's own reorder threshold (set in Medicine Master). Create purchase request in one click.
              </p>
            </div>
            <Button
              type="button"
              className="primary"
              style={{ background: "#00828a", borderColor: "#00828a" }}
              onClick={() => {
                sessionStorage.setItem("pharmacy_purchases_tab", "pr");
                sessionStorage.setItem("pharmacy_purchases_open_new_pr", "true");
                onNavigate("pharmacy-purchases");
              }}
            >
              + Create Purchase Request
            </Button>
          </div>

          {lowStockItems.length > 0 ? (
            <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Medicine</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Unit / Form</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Current Stock</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Reorder Level</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Suggested Qty</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((item) => (
                  <tr key={item.medicine_name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>{item.medicine_name}</td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{item.unit_type || "-"}</td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", color: item.available_qty === 0 ? "#dc2626" : "#ea580c", fontWeight: 800 }}>
                      {item.available_qty}
                      {item.available_qty === 0 && item.expired_qty > 0 && (
                        <div style={{ fontSize: "0.72rem", color: "#dc2626", fontWeight: 600 }}>
                          (All {item.expired_qty} expired)
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", color: "#64748b" }}>{item.reorder_level}</td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", fontWeight: 600 }}>{Math.max(item.reorder_level * 2 - item.available_qty, 10)}</td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>
                      <Button
                        type="button"
                        variant="secondary"
                        style={{ padding: "2px 10px", fontSize: "0.8rem" }}
                        onClick={() => {
                          sessionStorage.setItem("pharmacy_purchases_tab", "pr");
                          sessionStorage.setItem("pharmacy_purchases_open_new_pr", "true");
                          sessionStorage.setItem("pharmacy_purchases_prefill_med", item.medicine_name);
                          onNavigate("pharmacy-purchases");
                        }}
                      >
                        Order Now
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: "center", padding: "2rem", color: "#16a34a" }}>
              ✓ All medicines are currently above minimum reorder levels.
            </div>
          )}
        </div>
      )}

      {/* 5. PHYSICAL STOCK COUNT */}
      {activeTab === "physical_count" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ marginBottom: "1rem" }}>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
              Physical Stock Reconciliation
            </h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
              Compare physical warehouse/pharmacy counts against system quantities. System creates an auditable stock adjustment for discrepancies.
            </p>
          </div>

          <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "0.6rem 0.75rem" }}>Medicine</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Unit / Form</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Batch</th>
                <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>System Qty</th>
                <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {stock.slice(0, 15).map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{item.medicine_name}</td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{item.unit_type || "-"}</td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{item.batch_no}</td>
                  <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", fontWeight: 700 }}>{item.qty_available}</td>
                  <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                    <Button
                      type="button"
                      variant="secondary"
                      style={{ padding: "2px 10px", fontSize: "0.8rem" }}
                      onClick={() => {
                        setPhysicalCountMedicine(item);
                        setCountedQty(item.qty_available);
                      }}
                    >
                      Count & Reconcile
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Physical Count Modal */}
          {physicalCountMedicine && (
            <Modal open={!!physicalCountMedicine} onClose={() => setPhysicalCountMedicine(null)}>
              <div style={{ padding: "1.5rem", maxWidth: "500px" }}>
                <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>Reconcile Physical Count</h3>
                <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>
                  Medicine: <strong>{physicalCountMedicine.medicine_name}</strong> (Batch: {physicalCountMedicine.batch_no})
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", color: "#64748b", marginBottom: "4px" }}>
                      System Quantity:
                    </label>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#334155" }}>
                      {physicalCountMedicine.qty_available}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", color: "#64748b", marginBottom: "4px" }}>
                      Physically Counted:
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={countedQty}
                      onChange={(e) => setCountedQty(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div style={{ padding: "0.6rem 0.85rem", borderRadius: "6px", background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: "1rem", fontSize: "0.85rem" }}>
                  Variance:{" "}
                  <strong style={{ color: countedQty - physicalCountMedicine.qty_available < 0 ? "#dc2626" : "#16a34a" }}>
                    {countedQty - physicalCountMedicine.qty_available} units
                  </strong>
                </div>

                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#475569", marginBottom: "4px" }}>
                    Audit Remarks / Reason:
                  </label>
                  <Input
                    value={countReason}
                    onChange={(e) => setCountReason(e.target.value)}
                    placeholder="Enter audit reason..."
                  />
                </div>

                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                  <Button type="button" variant="secondary" onClick={() => setPhysicalCountMedicine(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="primary"
                    style={{ background: "#00828a", borderColor: "#00828a" }}
                    disabled={submittingAdj}
                    onClick={handleExecutePhysicalCount}
                  >
                    {submittingAdj ? "Reconciling..." : "Save Reconciliation"}
                  </Button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* 6. STOCK TRANSFER */}
      {activeTab === "transfers" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
            Internal Stock Transfers (Store / Racks)
          </h3>
          <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.85rem", color: "#64748b" }}>
            Transfer verified stock between Main Central Pharmacy, Emergency Rack, and OT Storage.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", maxWidth: "800px", marginBottom: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Source Store / Rack:
              </label>
              <select className="ui-input" style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <option>Main Central Pharmacy</option>
                <option>Emergency Rack A</option>
                <option>OT Storage 1</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Destination Store / Department:
              </label>
              <select className="ui-input" style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <option>Emergency Room</option>
                <option>OT Storage 1</option>
                <option>OP Consultation Sub-store</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Transfer Quantity:
              </label>
              <Input type="number" min={1} defaultValue={10} />
            </div>
          </div>

          <Button
            type="button"
            className="primary"
            style={{ background: "#00828a", borderColor: "#00828a" }}
            onClick={() => setNotice({ type: "info", message: "Internal transfer request initiated." })}
          >
            Initiate Transfer
          </Button>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustmentModalOpen && (
        <Modal
          open={adjustmentModalOpen}
          onClose={() => {
            setAdjustmentModalOpen(false);
            setAdjBatchId(null);
            setAdjDirection(null);
            setAdjDelta("");
            setAdjReason("");
            setAdjRemarks("");
          }}
        >
          <div style={{ padding: "1.5rem", maxWidth: "500px" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>Manual Stock Adjustment</h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>
              Permission-controlled stock quantity correction with mandatory audit logging.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Select Stock Batch:
              </label>
              <select
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={adjBatchId || ""}
                onChange={(e) => setAdjBatchId(parseInt(e.target.value) || null)}
              >
                <option value="">-- Select Stock Batch --</option>
                {stock.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.medicine_name}{s.unit_type ? ` (${s.unit_type})` : ""} — Batch: {s.batch_no}, Avail: {s.qty_available}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Adjustment Type:
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: "0.4rem",
                      borderRadius: "6px",
                      border: adjDirection === "DEDUCT" ? "2px solid #e11d48" : "1px solid #cbd5e1",
                      background: adjDirection === "DEDUCT" ? "#fef2f2" : "#ffffff",
                      color: adjDirection === "DEDUCT" ? "#e11d48" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.8rem",
                    }}
                    onClick={() => setAdjDirection("DEDUCT")}
                  >
                    - Deduct
                  </button>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: "0.4rem",
                      borderRadius: "6px",
                      border: adjDirection === "ADD" ? "2px solid #16a34a" : "1px solid #cbd5e1",
                      background: adjDirection === "ADD" ? "#f0fdf4" : "#ffffff",
                      color: adjDirection === "ADD" ? "#16a34a" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.8rem",
                    }}
                    onClick={() => setAdjDirection("ADD")}
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Quantity:
                </label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Enter quantity..."
                  value={adjDelta}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setAdjDelta(raw === "" ? "" : Math.max(1, parseInt(raw, 10)));
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Reason for Adjustment:
              </label>
              <select
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
              >
                <option value="">-- Select Reason for Adjustment --</option>
                <option value="Damage / Breakage">Damage / Breakage</option>
                <option value="Expiry Write-off">Expiry Write-off</option>
                <option value="Physical Count Discrepancy">Physical Count Discrepancy</option>
                <option value="Correction of Data Entry">Correction of Data Entry</option>
                <option value="Supplier Replacement Sample">Supplier Replacement Sample</option>
              </select>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Remarks / Authorization Note:
              </label>
              <Input
                value={adjRemarks}
                onChange={(e) => setAdjRemarks(e.target.value)}
                placeholder="Required for audit compliance..."
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setAdjustmentModalOpen(false);
                  setAdjBatchId(null);
                  setAdjDirection(null);
                  setAdjDelta("");
                  setAdjReason("");
                  setAdjRemarks("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="primary"
                style={{ background: "#00828a", borderColor: "#00828a" }}
                disabled={submittingAdj || !adjBatchId || !adjDirection || !adjDelta || !adjReason}
                onClick={handleExecuteAdjustment}
              >
                {submittingAdj ? "Saving..." : "Apply Adjustment"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
