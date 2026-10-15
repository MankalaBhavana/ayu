import React, { useEffect, useState, useTransition } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiFetch, reportError } from "../../lib/api";
import type { Notice } from "../../types";
import { Button, Modal } from "../../components/ui";
import { printViaIframe } from "../../lib/printViaIframe";
import { buildPrintDocumentHtml } from "../../lib/printTemplates";
import { useDropdownOptions } from "../../lib/dropdownService";
import "./billingTheme.css";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate: (pageId: string) => void;
};

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

export default function BillingOverviewPage({ setNotice, onNavigate }: Props) {
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [department, setDepartment] = useState("All departments");
  const [visitType, setVisitType] = useState("All visit types");
  const [searchQuery, setSearchQuery] = useState("");
  const [worklistTab, setWorklistTab] = useState<"pending" | "receipts">("pending");

  // Independent Loading States
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    net_billed: 26100,
    receipts_today: 21600,
    refunds_today: 600,
    net_collections: 21000,
    outstanding_dues: 18450,
  });

  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);

  const [worklistLoading, setWorklistLoading] = useState(true);
  const [worklistError, setWorklistError] = useState<string | null>(null);
  const [worklist, setWorklist] = useState<{
    pending_payments: any[];
    discharge_review: any[];
    recent_receipts: any[];
  }>({
    pending_payments: [],
    discharge_review: [],
    recent_receipts: [],
  });

  // Centralized Dropdown Options
  const { options: departmentOptions } = useDropdownOptions("departments", [
    { value: "OP", label: "Outpatient (OP)" },
    { value: "Pharmacy", label: "Pharmacy" },
    { value: "Laboratory", label: "Laboratory" },
    { value: "Imaging / Radiology", label: "Imaging / Radiology" },
  ]);
  const { options: visitTypeOptions } = useDropdownOptions("visit_types", [
    { value: "OP", label: "OP Visits" },
    { value: "Follow-up", label: "Follow-up" },
    { value: "Review", label: "Review" },
    { value: "Re-visit", label: "Re-visit" },
  ]);

  // Modal states
  const [openSessionModal, setOpenSessionModal] = useState(false);
  const [openFloat, setOpenFloat] = useState("2000");
  const [counterName, setCounterName] = useState("Main Billing Counter");
  const [openingNotes, setOpeningNotes] = useState("");

  const [closeSessionModal, setCloseSessionModal] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  // Summary Card Details Pop-up Modal State (Issue 2)
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsMetric, setDetailsMetric] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsFilterQuery, setDetailsFilterQuery] = useState("");
  const [detailsData, setDetailsData] = useState<{
    metric: string;
    title: string;
    date: string;
    count: number;
    total_amount: number;
    records: any[];
  } | null>(null);

  const handleOpenDetails = async (metric: string) => {
    setDetailsMetric(metric);
    setDetailsModalOpen(true);
    setDetailsLoading(true);
    setDetailsFilterQuery("");
    try {
      const res = await apiFetch(`/api/billing/overview-details?metric=${metric}&date=${targetDate}`);
      if (res) setDetailsData(res);
    } catch (err: any) {
      reportError(setNotice, err);
      setNotice({ type: "error", message: err.message || "Failed to load detailed records." });
    } finally {
      setDetailsLoading(false);
    }
  };

  // Independent Data Fetchers
  const loadStats = async (dateStr: string) => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await apiFetch(`/api/billing/overview-stats?date=${dateStr}`);
      if (res) setStats(res);
    } catch (err: any) {
      reportError(setNotice, err);
      setStatsError(err.message || "Failed to load summary stats.");
    } finally {
      setStatsLoading(false);
    }
  };

  const loadSession = async () => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const res = await apiFetch("/api/billing/cashier-session/current");
      if (res) setSession(res);
    } catch (err: any) {
      reportError(setNotice, err);
      setSessionError(err.message || "Failed to load cashier shift.");
    } finally {
      setSessionLoading(false);
    }
  };

  const loadWorklist = async (dept: string, query: string) => {
    setWorklistLoading(true);
    setWorklistError(null);
    try {
      const deptParam = dept && dept !== "All departments" ? `&department=${encodeURIComponent(dept)}` : "";
      const qParam = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";
      const res = await apiFetch(`/api/billing/worklist?${deptParam}${qParam}`);
      if (res) {
        setWorklist({
          pending_payments: res.pending_payments || [],
          discharge_review: res.discharge_review || [],
          recent_receipts: res.recent_receipts || [],
        });
      }
    } catch (err: any) {
      reportError(setNotice, err);
      setWorklistError(err.message || "Failed to load billing worklist.");
    } finally {
      setWorklistLoading(false);
    }
  };

  useEffect(() => {
    loadStats(targetDate);
  }, [targetDate]);

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    loadWorklist(department, searchQuery);
  }, [department]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadWorklist(department, searchQuery);
  };

  const handleStartShift = async () => {
    try {
      const res = await apiFetch("/api/billing/cashier-session/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counter_name: counterName,
          opening_float: parseFloat(openFloat) || 0,
          notes: openingNotes,
        }),
      });
      setSession(res);
      setOpenSessionModal(false);
      setNotice({ type: "success", message: `Cashier session ${res.session_code} opened successfully.` });
    } catch (err: any) {
      reportError(setNotice, err);
      setNotice({ type: "error", message: err.message || "Failed to open cashier shift." });
    }
  };

  const handleCloseShift = async () => {
    if (!session?.id) return;
    try {
      const counted = parseFloat(countedCash);
      if (isNaN(counted) || counted < 0) {
        setNotice({ type: "warning", message: "Please enter a valid counted cash amount." });
        return;
      }
      const res = await apiFetch("/api/billing/cashier-session/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          counted_cash: counted,
          notes: closingNotes,
        }),
      });
      setCloseSessionModal(false);
      setNotice({
        type: "success",
        message: `Session closed. Variance: ₹${res.variance >= 0 ? "+" : ""}${Number(res.variance || 0).toFixed(2)}`,
      });
      loadSession();
      loadStats(targetDate);
    } catch (err: any) {
      reportError(setNotice, err);
      setNotice({ type: "error", message: err.message || "Failed to close cashier shift." });
    }
  };

  const handlePrintSummary = () => {
    const html = buildPrintDocumentHtml({
      title: `Daily Billing Overview Summary`,
      subtitleLines: [
        `Ayu Polyclinic · Billing Department`,
        `Report Date: ${targetDate}`,
        `Generated: ${new Date().toLocaleTimeString("en-IN")}`,
      ],
      meta: [
        { label: "Net Billed", value: `₹${fmt(stats.net_billed)}` },
        { label: "Receipts Today", value: `₹${fmt(stats.receipts_today)}` },
        { label: "Refunds Disbursed", value: `₹${fmt(stats.refunds_today)}` },
        { label: "Outstanding Dues", value: `₹${fmt(stats.outstanding_dues)}` },
      ],
      columns: ["Classification", "Metric Details", "Amount (₹)"],
      rows: [
        ["Net Invoiced", "All services invoiced on selected date", `₹${fmt(stats.net_billed)}`],
        ["Gross Collections", "Cash, UPI, and Card receipts collected", `₹${fmt(stats.receipts_today)}`],
        ["Disbursed Refunds", "Authorised patient deposit refunds", `-₹${fmt(stats.refunds_today)}`],
        ["Net Daily Collections", "Receipts minus refunded payments", `₹${fmt(stats.net_collections)}`],
        ["Outstanding Balance", "Cumulative unpaid patient dues across all dates", `₹${fmt(stats.outstanding_dues)}`],
      ],
      totals: [
        {
          label: "Net Collections for Date",
          value: `₹${fmt(stats.net_collections)}`,
          grand: true,
        },
      ],
    });
    printViaIframe(html);
  };

  const handlePrintReceipt = (rcp: any) => {
    const html = buildPrintDocumentHtml({
      title: `Official Payment Receipt ${rcp.receipt_no}`,
      subtitleLines: [
        `Ayu Polyclinic · Central Cashier Desk`,
        `Receipt Date: ${rcp.date || targetDate} · ${rcp.time || ""}`,
        `Payment Mode: ${rcp.mode || "CASH"}`,
      ],
      meta: [
        { label: "Receipt No", value: rcp.receipt_no },
        { label: "Patient UHID", value: rcp.patient_id },
        { label: "Patient Name", value: rcp.patient_name || "-" },
        { label: "Payment Tender", value: rcp.mode || "CASH" },
      ],
      columns: ["Description", "Transaction Type", "Amount (₹)"],
      rows: [
        [
          `Settlement for ${rcp.type === "advance" ? "Patient Advance Deposit" : "Hospital Care Services"}`,
          rcp.type || "Bill Payment",
          `₹${Number(rcp.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        ],
      ],
      totals: [
        {
          label: "Total Paid",
          value: `₹${Number(rcp.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          grand: true,
        },
      ],
    });
    printViaIframe(html);
  };

  const handleCollectBill = (row: any) => {
    if (row.patient_id) {
      localStorage.setItem("selected_billing_patient", row.patient_id);
    }
    onNavigate("billing-patient-bills");
  };
return (
    <div className="billing-page-wrapper">
      {/* 1. Breadcrumbs */}
      <div className="billing-breadcrumbs">
        <span className="breadcrumb-link" onClick={() => onNavigate("dashboard")}>
          Ayu Polyclinic
        </span>
        <span className="separator">/</span>
        <span className="current">Billing</span>
      </div>

      {/* 2. Top Header Bar */}
      <div className="billing-header-row">
        <div className="billing-title-block">
          <h1>Billing Overview</h1>
          <p>Payments, settlements and daily collections.</p>
        </div>

        <div className="billing-header-actions">
          {/* Date Dropdown */}
          <div className="billing-date-dropdown">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              title="Select summary date"
            />
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>▾</span>
          </div>

          {/* Print Summary Button */}
          <button type="button" className="billing-btn-outline" onClick={handlePrintSummary}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print summary
          </button>
        </div>
      </div>

      {/* 3. Four KPI Summary Cards */}
      <div className="billing-kpi-grid-4">
        {/* Card 1: Net billed today */}
        <div
          className="billing-kpi-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDetails("net_billed")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenDetails("net_billed"); } }}
          title="Click to view detailed Net Billed records"
        >
          <div className="billing-kpi-icon-wrap" style={{ background: "#f0fdfa", color: "#0d9488" }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="billing-kpi-info">
            <span className="billing-kpi-label">Net billed today</span>
            <span className="billing-kpi-value">₹{fmt(stats.net_billed)}</span>
          </div>
        </div>

        {/* Card 2: Receipts today */}
        <div
          className="billing-kpi-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDetails("receipts_today")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenDetails("receipts_today"); } }}
          title="Click to view detailed Receipts records"
        >
          <div className="billing-kpi-icon-wrap" style={{ background: "#f0fdf4", color: "#16a34a" }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div className="billing-kpi-info">
            <span className="billing-kpi-label">Receipts today</span>
            <span className="billing-kpi-value">₹{fmt(stats.receipts_today)}</span>
            <span className="billing-kpi-subtitle">Includes advances</span>
          </div>
        </div>

        {/* Card 3: Refunds today */}
        <div
          className="billing-kpi-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDetails("refunds_today")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenDetails("refunds_today"); } }}
          title="Click to view detailed Refunds records"
        >
          <div className="billing-kpi-icon-wrap" style={{ background: "#fef2f2", color: "#dc2626" }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </div>
          <div className="billing-kpi-info">
            <span className="billing-kpi-label">Refunds today</span>
            <span className="billing-kpi-value">₹{fmt(stats.refunds_today)}</span>
          </div>
        </div>

        {/* Card 4: Outstanding patient dues */}
        <div
          className="billing-kpi-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDetails("outstanding_dues")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenDetails("outstanding_dues"); } }}
          title="Click to view detailed Outstanding Patient Dues records"
        >
          <div className="billing-kpi-icon-wrap" style={{ background: "#fff7ed", color: "#ea580c" }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="billing-kpi-info">
            <span className="billing-kpi-label">Outstanding patient dues</span>
            <span className="billing-kpi-value">₹{fmt(stats.outstanding_dues)}</span>
            <span className="billing-kpi-subtitle">Across all dates</span>
          </div>
        </div>
      </div>

      {/* 4. Search Bar & Primary Record Action */}
      <form onSubmit={handleSearchSubmit} className="billing-search-row">
        <div className="billing-search-input-box">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search patient name, UHID or bill number"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <button type="submit" className="billing-btn-teal">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search
        </button>

        <button
          type="button"
          className="billing-btn-teal"
          onClick={() => onNavigate("billing-patient-bills")}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          Record payment
        </button>
      </form>

      {/* 5. Main Two-Column Layout */}
      <div className="billing-two-col-layout">
        {/* Left Column: Worklist & Recent Receipts */}
        <div className="billing-left-col">
          {/* Card: Billing Worklist */}
          <div className="billing-card">
            <div className="billing-card-header" style={{ paddingBottom: "0" }}>
              <h2 className="billing-card-title">Billing worklist</h2>

              {/* Filters */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="billing-filter-select"
                >
                  <option value="All departments">All departments</option>
                  {departmentOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  value={visitType}
                  onChange={(e) => setVisitType(e.target.value)}
                  className="billing-filter-select"
                >
                  <option value="All visit types">All visit types</option>
                  {visitTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabs */}
            <div className="billing-tabs-nav" style={{ marginTop: "8px" }}>
              <button
                type="button"
                className={`billing-tab-btn ${worklistTab === "pending" ? "active" : ""}`}
                onClick={() => setWorklistTab("pending")}
              >
                Pending payments
                <span className="billing-tab-badge">
                  {worklist.pending_payments.length}
                </span>
              </button>

              <button
                type="button"
                className={`billing-tab-btn ${worklistTab === "receipts" ? "active" : ""}`}
                onClick={() => setWorklistTab("receipts")}
              >
                Recent receipts
              </button>
            </div>

            {/* Table Content */}
            <div className="billing-table-responsive">
              {worklistLoading ? (
                <div className="billing-state-box">
                  <div className="billing-skeleton" style={{ height: "30px", marginBottom: "8px" }} />
                  <div className="billing-skeleton" style={{ height: "30px", marginBottom: "8px" }} />
                  <div className="billing-skeleton" style={{ height: "30px" }} />
                </div>
              ) : worklistError ? (
                <div className="billing-state-box">
                  <p style={{ color: "#dc2626", margin: "0 0 8px" }}>{worklistError}</p>
                  <button type="button" className="billing-retry-btn" onClick={() => loadWorklist(department, searchQuery)}>
                    Retry
                  </button>
                </div>
              ) : worklistTab === "pending" ? (
                worklist.pending_payments.length === 0 ? (
                  <div className="billing-state-box">
                    <p style={{ margin: 0 }}>No pending payments matching the current filter.</p>
                  </div>
                ) : (
                  <table className="billing-table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Bill & service</th>
                        <th>Net bill</th>
                        <th>Applied</th>
                        <th>Balance</th>
                        <th style={{ textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {worklist.pending_payments.slice(0, 10).map((row) => (
                        <tr key={row.id}>
                          <td>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>{row.patient_name}</div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{row.patient_id}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>{row.invoice_no}</div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{row.service_desc}</div>
                          </td>
                          <td style={{ fontWeight: 600 }}>₹{fmt(row.net_bill)}</td>
                          <td style={{ color: "#64748b" }}>₹{fmt(row.applied)}</td>
                          <td style={{ fontWeight: 700, color: "#0f172a" }}>₹{fmt(row.balance)}</td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="billing-btn-collect"
                              onClick={() => handleCollectBill(row)}
                            >
                              Collect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                /* Tab: Recent Receipts */
                worklist.recent_receipts.length === 0 ? (
                  <div className="billing-state-box">
                    <p style={{ margin: 0 }}>No receipts found.</p>
                  </div>
                ) : (
                  <table className="billing-table">
                    <thead>
                      <tr>
                        <th>Receipt no.</th>
                        <th>Time</th>
                        <th>Mode</th>
                        <th>Amount</th>
                        <th style={{ textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {worklist.recent_receipts.slice(0, 10).map((rcp) => (
                        <tr key={rcp.id}>
                          <td style={{ fontWeight: 600 }}>{rcp.receipt_no}</td>
                          <td style={{ color: "#64748b" }}>{rcp.time}</td>
                          <td>{rcp.mode}</td>
                          <td style={{ fontWeight: 700 }}>₹{fmt(rcp.amount)}</td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="billing-btn-table-outline"
                              onClick={() => handlePrintReceipt(rcp)}
                            >
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="6 9 6 2 18 2 18 9" />
                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                <rect x="6" y="14" width="12" height="8" />
                              </svg>
                              Print
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>

          {/* Card: Recent Receipts (Matches Bottom Left Card) */}
          <div className="billing-card">
            <div className="billing-card-header">
              <h2 className="billing-card-title">Recent receipts</h2>
              <button
                type="button"
                className="breadcrumb-link"
                style={{ background: "none", border: "none", fontSize: "0.8125rem", fontWeight: 600, color: "#0284c7", cursor: "pointer" }}
                onClick={() => setWorklistTab("receipts")}
              >
                View all
              </button>
            </div>

            <div className="billing-table-responsive">
              {worklist.recent_receipts.length === 0 ? (
                <div className="billing-state-box">
                  <p style={{ margin: 0 }}>No recent receipts recorded today.</p>
                </div>
              ) : (
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th>Receipt no.</th>
                      <th>Time</th>
                      <th>Mode</th>
                      <th>Amount</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worklist.recent_receipts.slice(0, 3).map((rcp) => (
                      <tr key={rcp.id}>
                        <td style={{ fontWeight: 600 }}>{rcp.receipt_no}</td>
                        <td style={{ color: "#64748b" }}>{rcp.time}</td>
                        <td>{rcp.mode}</td>
                        <td style={{ fontWeight: 700 }}>₹{fmt(rcp.amount)}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="billing-btn-table-outline"
                            onClick={() => handlePrintReceipt(rcp)}
                          >
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="6 9 6 2 18 2 18 9" />
                              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <rect x="6" y="14" width="12" height="8" />
                            </svg>
                            Print
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Cashier Session Card */}
        <div className="billing-right-col">

          {/* Card: Cashier Session */}
          <div className="billing-card">
            <div className="billing-card-header">
              <h2 className="billing-card-title">Cashier session</h2>
              {sessionLoading ? (
                <span className="billing-badge-closed">Checking...</span>
              ) : session?.status === "open" ? (
                <span className="billing-badge-open">
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  Open
                </span>
              ) : (
                <span className="billing-badge-closed">Closed</span>
              )}
            </div>

            <div className="billing-card-body">
              {sessionLoading ? (
                <div className="billing-skeleton" style={{ height: "80px" }} />
              ) : sessionError ? (
                <div>
                  <p style={{ color: "#dc2626", fontSize: "0.85rem", margin: "0 0 6px" }}>{sessionError}</p>
                  <button type="button" className="billing-retry-btn" onClick={loadSession}>
                    Retry
                  </button>
                </div>
              ) : session?.status === "open" ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.875rem" }}>
                    <span style={{ color: "#64748b" }}>Opened at</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>
                      {session.opened_at ? new Date(session.opened_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "09:00 AM"}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.875rem" }}>
                    <span style={{ color: "#64748b" }}>Cashier</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>
                      {session.cashier_name || session.cashier_username || "Ramesh Kumar"}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", fontSize: "0.875rem" }}>
                    <span style={{ color: "#64748b" }}>Till / Counter</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>
                      {session.counter_name || "Main Billing Counter"}
                    </span>
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <button
                      type="button"
                      className="billing-btn-outline"
                      onClick={() => onNavigate("billing-reports-day-close")}
                      style={{ fontSize: "0.8125rem", padding: "7px 10px" }}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                      View collections
                    </button>

                    <button
                      type="button"
                      className="billing-btn-outline"
                      onClick={() => {
                        setCountedCash(String(session.expected_cash || ""));
                        setCloseSessionModal(true);
                      }}
                      style={{ fontSize: "0.8125rem", padding: "7px 10px" }}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                        <line x1="12" y1="2" x2="12" y2="12" />
                      </svg>
                      Close session
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "0.5rem 0" }}>
                  <p style={{ color: "#64748b", fontSize: "0.875rem", margin: "0 0 12px" }}>
                    No active cashier shift for your terminal.
                  </p>
                  <button
                    type="button"
                    className="billing-btn-teal"
                    onClick={() => setOpenSessionModal(true)}
                    style={{ width: "100%" }}
                  >
                    + Open cashier shift
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Open Cashier Shift */}
      {openSessionModal && (
        <Modal
          open={openSessionModal}
          title="Open Cashier Shift"
          onClose={() => setOpenSessionModal(false)}
        >
          <div style={{ padding: "0.5rem 0" }}>
            <div className="billing-form-group">
              <label className="billing-form-label">Billing Counter</label>
              <input
                type="text"
                className="billing-form-input"
                value={counterName}
                onChange={(e) => setCounterName(e.target.value)}
              />
            </div>

            <div className="billing-form-group">
              <label className="billing-form-label">Opening Float Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                className="billing-form-input"
                value={openFloat}
                onChange={(e) => setOpenFloat(e.target.value)}
              />
            </div>

            <div className="billing-form-group">
              <label className="billing-form-label">Handover Notes (Optional)</label>
              <textarea
                className="billing-form-input"
                rows={2}
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                placeholder="Terminal check notes..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "1rem" }}>
              <Button variant="secondary" onClick={() => setOpenSessionModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleStartShift}>
                Confirm & Open Shift
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Close Cashier Shift */}
      {closeSessionModal && session && (
        <Modal
          open={closeSessionModal}
          title={`Reconcile & Close Cashier Shift (${session.session_code})`}
          onClose={() => setCloseSessionModal(false)}
        >
          <div style={{ padding: "0.5rem 0" }}>
            <div className="billing-highlight-box" style={{ marginBottom: "1rem" }}>
              <div>
                <span className="box-label">Expected Drawer Cash</span>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Float + cash receipts - cash refunds</div>
              </div>
              <span className="box-value">₹{fmt(session.expected_cash || 0)}</span>
            </div>

            <div className="billing-form-group">
              <label className="billing-form-label">Physical Counted Cash (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="billing-form-input"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                placeholder="Enter physical cash in drawer"
              />
            </div>

            {countedCash !== "" && !isNaN(parseFloat(countedCash)) && (() => {
              const diff = parseFloat(countedCash) - Number(session.expected_cash || 0);
              const isMatch = Math.abs(diff) < 0.01;
              return (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    marginBottom: "1rem",
                    background: isMatch ? "#ecfdf5" : "#fff1f2",
                    border: `1px solid ${isMatch ? "#a7f3d0" : "#fecdd3"}`,
                    color: isMatch ? "#065f46" : "#991b1b",
                  }}
                >
                  Difference: <strong>₹{diff >= 0 ? "+" : ""}{diff.toFixed(2)}</strong> {isMatch ? "• Balanced" : "• Discrepancy"}
                </div>
              );
            })()}

            <div className="billing-form-group">
              <label className="billing-form-label">Closing Notes</label>
              <textarea
                className="billing-form-input"
                rows={2}
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Notes for finance auditor..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "1rem" }}>
              <Button variant="secondary" onClick={() => setCloseSessionModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleCloseShift}>
                Reconcile & Close Shift
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 8. Summary Card Details Pop-up Modal (Issue 2) */}
      <Modal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title={detailsData?.title || "Billing Metric Details"}
        description={
          detailsMetric === "outstanding_dues"
            ? "Live breakdown of outstanding dues across all patient invoices"
            : `Live transaction records for date: ${targetDate}`
        }
        className="billing-details-modal"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Top Meta & Search Bar */}
          <div className="billing-details-meta-bar">
            <div className="billing-details-summary-stats">
              <div className="billing-details-stat-item">
                <span className="billing-details-stat-label">Total Records</span>
                <span className="billing-details-stat-value">{detailsData?.count ?? 0}</span>
              </div>
              <div className="billing-details-stat-item">
                <span className="billing-details-stat-label">
                  {detailsMetric === "outstanding_dues" ? "Total Due Amount" : "Total Amount"}
                </span>
                <span className="billing-details-stat-value" style={{ color: detailsMetric === "refunds_today" ? "#dc2626" : "#0d9488" }}>
                  ₹{fmt(detailsData?.total_amount ?? 0)}
                </span>
              </div>
            </div>

            <div className="billing-details-filter-box">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#94a3b8" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Filter in details..."
                value={detailsFilterQuery}
                onChange={(e) => setDetailsFilterQuery(e.target.value)}
              />
              {detailsFilterQuery && (
                <button
                  type="button"
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", padding: 0 }}
                  onClick={() => setDetailsFilterQuery("")}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Records Table */}
          {detailsLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
              <div className="loading-spinner" style={{ margin: "0 auto 12px" }}></div>
              Loading live billing records...
            </div>
          ) : !detailsData?.records || detailsData.records.length === 0 ? (
            <div style={{ padding: "36px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px" }}>
              No records found for this metric on {targetDate}.
            </div>
          ) : (() => {
            const query = detailsFilterQuery.trim().toLowerCase();
            const filtered = detailsData.records.filter((r: any) => {
              if (!query) return true;
              return (
                (r.reference_no && r.reference_no.toLowerCase().includes(query)) ||
                (r.patient_name && r.patient_name.toLowerCase().includes(query)) ||
                (r.patient_id && r.patient_id.toLowerCase().includes(query)) ||
                (r.mode && r.mode.toLowerCase().includes(query)) ||
                (r.module && r.module.toLowerCase().includes(query)) ||
                (r.cashier && r.cashier.toLowerCase().includes(query)) ||
                (r.status && r.status.toLowerCase().includes(query))
              );
            });

            if (filtered.length === 0) {
              return (
                <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                  No matching records for "{detailsFilterQuery}".
                </div>
              );
            }

            return (
              <div className="billing-details-table-wrap">
                <table className="billing-details-table">
                  <thead>
                    <tr>
                      <th>Ref / Bill #</th>
                      <th>Patient Details</th>
                      {detailsMetric === "net_billed" && <th>Module</th>}
                      {detailsMetric === "receipts_today" && <th>Type</th>}
                      {detailsMetric === "receipts_today" && <th>Mode</th>}
                      {detailsMetric === "refunds_today" && <th>Payment Mode</th>}
                      {detailsMetric === "outstanding_dues" && <th>Module</th>}
                      <th style={{ textAlign: "right" }}>Amount (₹)</th>
                      {detailsMetric === "net_billed" && <th style={{ textAlign: "right" }}>Paid / Due</th>}
                      {detailsMetric === "outstanding_dues" && <th style={{ textAlign: "right" }}>Total Bill</th>}
                      <th>Status / Notes</th>
                      <th>Time / Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any, idx: number) => (
                      <tr key={r.id || idx}>
                        <td style={{ fontWeight: 600, color: "#0f172a" }}>
                          {r.reference_no || "-"}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, color: "#0f172a" }}>{r.patient_name || "-"}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{r.patient_id || "-"}</div>
                        </td>
                        {detailsMetric === "net_billed" && (
                          <td>
                            <span className="billing-table-badge badge-blue">{r.module}</span>
                          </td>
                        )}
                        {detailsMetric === "receipts_today" && (
                          <td>
                            <span className="billing-table-badge badge-teal">
                              {r.type === "advance" ? "Advance Deposit" : "Bill Settlement"}
                            </span>
                          </td>
                        )}
                        {detailsMetric === "receipts_today" && (
                          <td>
                            <span className="billing-table-badge badge-gray">{r.mode}</span>
                          </td>
                        )}
                        {detailsMetric === "refunds_today" && (
                          <td>
                            <span className="billing-table-badge badge-orange">{r.mode}</span>
                          </td>
                        )}
                        {detailsMetric === "outstanding_dues" && (
                          <td>
                            <span className="billing-table-badge badge-blue">{r.module || "OP"}</span>
                          </td>
                        )}
                        <td style={{ textAlign: "right", fontWeight: 700, color: detailsMetric === "refunds_today" ? "#dc2626" : "#0f172a" }}>
                          ₹{fmt(detailsMetric === "outstanding_dues" ? r.due_amount : (r.amount ?? r.total_amount))}
                        </td>
                        {detailsMetric === "net_billed" && (
                          <td style={{ textAlign: "right", fontSize: "0.75rem", color: "#64748b" }}>
                            ₹{fmt(r.paid_amount)} / <strong style={{ color: r.due_amount > 0 ? "#ea580c" : "#16a34a" }}>₹{fmt(r.due_amount)}</strong>
                          </td>
                        )}
                        {detailsMetric === "outstanding_dues" && (
                          <td style={{ textAlign: "right", fontSize: "0.75rem", color: "#64748b" }}>
                            ₹{fmt(r.total_amount)}
                          </td>
                        )}
                        <td>
                          {r.status ? (
                            <span className={`billing-table-badge ${r.status === "paid" ? "badge-green" : r.status === "due" ? "badge-orange" : "badge-gray"}`}>
                              {r.status}
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{r.notes || "-"}</span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.75rem", color: "#64748b", whiteSpace: "nowrap" }}>
                          {r.time || r.created_at || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Modal Footer */}
          <div className="billing-details-footer">
            <span style={{ fontSize: "0.8125rem", color: "#64748b" }}>
              Showing verified database billing records for Ayu Polyclinic.
            </span>
            <Button variant="primary" onClick={() => setDetailsModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

