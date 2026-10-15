import React, { useEffect, useState } from "react";
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
  onNavigate?: (pageId: string) => void;
};

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

export default function DoctorPayoutsPage({ setNotice, onNavigate }: Props) {
  const [periodMonth, setPeriodMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [department, setDepartment] = useState("All departments");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Centralized Dropdown Options
  const { options: departmentOptions } = useDropdownOptions("departments", [
    { value: "General Medicine", label: "General Medicine" },
    { value: "Orthopaedics", label: "Orthopaedics" },
    { value: "Cardiology", label: "Cardiology" },
    { value: "Paediatrics", label: "Paediatrics" },
  ]);
  const { options: paymentModeOptions } = useDropdownOptions("payment_modes", [
    { value: "Bank transfer", label: "Bank Transfer (NEFT/RTGS)" },
    { value: "Cheque", label: "Cheque" },
    { value: "Cash", label: "Cash" },
    { value: "UPI", label: "UPI / QR Code" },
  ]);

  const [summary, setSummary] = useState({
    fees_earned: 0,
    adjustments: 0,
    paid: 0,
    payable: 0,
  });

  const [statements, setStatements] = useState<any[]>([]);
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);

  // Selected statement for right panel
  const [selectedStatement, setSelectedStatement] = useState<any>(null);
  const [payoutAmount, setPayoutAmount] = useState<string>("0");
  const [payoutMode, setPayoutMode] = useState<string>("Bank transfer");
  const [payoutRef, setPayoutRef] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [submittingPayout, setSubmittingPayout] = useState(false);

  // Summary Card Details Pop-up Modal State (Issue 3)
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsMetric, setDetailsMetric] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsFilterQuery, setDetailsFilterQuery] = useState("");
  const [detailsData, setDetailsData] = useState<{
    metric: string;
    title: string;
    period: string;
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
      const deptParam = department && department !== "All departments" ? `&department=${encodeURIComponent(department)}` : "";
      const qParam = searchQuery.trim() ? `&q=${encodeURIComponent(searchQuery.trim())}` : "";
      const res = await apiFetch(`/api/billing/doctor-payouts/details?metric=${metric}&month=${periodMonth}${deptParam}${qParam}`);
      if (res) setDetailsData(res);
    } catch (err: any) {
      reportError(setNotice, err);
      setNotice({ type: "error", message: err.message || "Failed to load doctor payout details." });
    } finally {
      setDetailsLoading(false);
    }
  };

  const loadDoctorStatements = async () => {
    setLoading(true);
    setError(null);
    try {
      const deptParam = department && department !== "All departments" ? `&department=${encodeURIComponent(department)}` : "";
      const qParam = searchQuery.trim() ? `&q=${encodeURIComponent(searchQuery.trim())}` : "";
      const res = await apiFetch(`/api/billing/doctor-payouts/summary?month=${periodMonth}${deptParam}${qParam}`);
      if (res) {
        if (res.summary) {
          setSummary({
            fees_earned: Number(res.summary.fees_earned || 0),
            adjustments: Number(res.summary.adjustments || 0),
            paid: Number(res.summary.paid || 0),
            payable: Number(res.summary.payable || 0),
          });
        }
        if (Array.isArray(res.statements)) {
          setStatements(res.statements);
          if (res.statements.length > 0) {
            const approvedOne = res.statements.find((s: any) => String(s.status).toLowerCase() === "approved") || res.statements[0];
            setSelectedStatement(approvedOne);
            setPayoutAmount(String(approvedOne.remaining_payable || 0));
          } else {
            setSelectedStatement(null);
            setPayoutAmount("0");
          }
        }
        if (Array.isArray(res.payout_history)) {
          setPayoutHistory(res.payout_history);
        }
      }
    } catch (err: any) {
      reportError(setNotice, err);
      setError(err.message || "Failed to load doctor statements.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDoctorStatements();
  };

  const handleSelectStatement = (stmt: any) => {
    setSelectedStatement(stmt);
    setPayoutAmount(String(stmt.remaining_payable || 0));
  };

  const handleRecordPayout = async () => {
    if (!selectedStatement) return;
    const amt = parseFloat(payoutAmount);
    if (isNaN(amt) || amt <= 0) {
      setNotice({ type: "warning", message: "Enter a valid positive payout amount." });
      return;
    }

    setSubmittingPayout(true);
    try {
      const res = await apiFetch(`/api/billing/doctor-payouts/statements/${selectedStatement.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          payment_mode: payoutMode.toLowerCase().replace(/\s+/g, "_"),
          reference: payoutRef || `${payoutMode}-DISBURSE`,
          notes: `Payout disburse for ${selectedStatement.doctor_name}`,
        }),
      });

      setNotice({
        type: "success",
        message: `Payout voucher ${res.payout_no || "recorded"} for ₹${fmt(amt)} created.`,
      });
      loadDoctorStatements();
    } catch (err: any) {
      reportError(setNotice, err);
      setNotice({ type: "error", message: err.message || "Failed to record doctor payout." });
    } finally {
      setSubmittingPayout(false);
    }
  };

  const printStatementSummary = () => {
    const html = buildPrintDocumentHtml({
      title: `Doctor Payout Statement Summary`,
      subtitleLines: [
        `Ayu Polyclinic · Medical Finance Department`,
        `Period: September 2026 · Generated: ${new Date().toLocaleDateString("en-IN")}`,
      ],
      meta: [
        { label: "Fees Earned", value: `₹${fmt(summary.fees_earned)}` },
        { label: "Adjustments / TDS", value: `-₹${fmt(Math.abs(summary.adjustments))}` },
        { label: "Disbursed Paid", value: `₹${fmt(summary.paid)}` },
        { label: "Remaining Payable", value: `₹${fmt(summary.payable)}` },
      ],
      columns: ["Doctor Name", "Department", "Earned (₹)", "Adjustments (₹)", "Paid (₹)", "Remaining (₹)", "Status"],
      rows: statements.map((s) => [
        s.doctor_name,
        s.department,
        `₹${fmt(s.fees_earned)}`,
        `-₹${fmt(Math.abs(s.adjustments || 0))}`,
        `₹${fmt(s.paid_amount || 0)}`,
        `₹${fmt(s.remaining_payable || 0)}`,
        s.status || "Ready for review",
      ]),
      totals: [
        { label: "Total Payable Balance", value: `₹${fmt(summary.payable)}`, grand: true },
      ],
    });
    printViaIframe(html);
  };

  const printVoucher = (p: any) => {
    const html = buildPrintDocumentHtml({
      title: `Doctor Payment Voucher ${p.payout_no}`,
      subtitleLines: [
        `Ayu Polyclinic · Accounts & Payout Desk`,
        `Payment Date: ${p.paid_date} · Mode: ${p.payment_mode}`,
      ],
      meta: [
        { label: "Voucher No", value: p.payout_no },
        { label: "Doctor Name", value: p.doctor_name },
        { label: "Payment Mode", value: p.payment_mode },
        { label: "Disbursed Amount", value: `₹${fmt(p.amount)}` },
      ],
      columns: ["Classification", "Terms & Scope", "Disbursed Amount (₹)"],
      rows: [
        ["Professional Medical Fees", "Contractual doctor fee entitlement settlement", `₹${fmt(p.amount)}`],
      ],
      totals: [
        { label: "Total Disbursed", value: `₹${fmt(p.amount)}`, grand: true },
      ],
    });
    printViaIframe(html);
  };

  const stmt = selectedStatement || statements[1] || statements[0];

  return (
    <div className="billing-page-wrapper">
      {/* 1. Breadcrumbs */}
      <div className="billing-breadcrumbs">
        <span className="breadcrumb-link" onClick={() => onNavigate?.("dashboard")}>
          Ayu Polyclinic
        </span>
        <span className="separator">/</span>
        <span className="breadcrumb-link" onClick={() => onNavigate?.("billing-overview")}>
          Billing
        </span>
        <span className="separator">/</span>
        <span className="current">Doctor Payouts</span>
      </div>

      {/* 2. Top Header Bar */}
      <div className="billing-header-row">
        <div className="billing-title-block">
          <h1>Doctor Payouts</h1>
          <p>Review professional fees, adjustments and payment history.</p>
        </div>
      </div>

      {/* 3. Top Toolbar / Filters Row */}
      <form onSubmit={handleSearchSubmit} className="billing-search-row" style={{ alignItems: "center" }}>
        {/* Month Dropdown */}
        <div className="billing-date-dropdown">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#64748b" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <input
            type="month"
            value={periodMonth}
            onChange={(e) => setPeriodMonth(e.target.value)}
          />
          <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>▾</span>
        </div>

        {/* Department Dropdown */}
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

        {/* Doctor Search Box */}
        <div className="billing-search-input-box" style={{ flex: 1 }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#94a3b8" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search doctor by name or staff ID"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Print Statement Button */}
        <button type="button" className="billing-btn-outline" onClick={printStatementSummary}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print statement
        </button>
      </form>

      {/* 4. Four KPI Summary Cards */}
      <div className="billing-kpi-grid-4">
        {/* Fees earned */}
        <div
          className="billing-kpi-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDetails("fees_earned")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenDetails("fees_earned"); } }}
          title="Click to view doctor-wise Fees Earned records"
        >
          <div className="billing-kpi-icon-wrap" style={{ background: "#f0fdf4", color: "#16a34a" }}>
            <span style={{ fontSize: "1.2rem", fontWeight: 700 }}>₹</span>
          </div>
          <div className="billing-kpi-info">
            <span className="billing-kpi-label">Fees earned</span>
            <span className="billing-kpi-value">₹{fmt(summary.fees_earned)}</span>
          </div>
        </div>

        {/* Adjustments */}
        <div
          className="billing-kpi-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDetails("adjustments")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenDetails("adjustments"); } }}
          title="Click to view doctor-wise Adjustments & TDS records"
        >
          <div className="billing-kpi-icon-wrap" style={{ background: "#fff7ed", color: "#ea580c" }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <div className="billing-kpi-info">
            <span className="billing-kpi-label">Adjustments</span>
            <span className="billing-kpi-value" style={{ color: "#ea580c" }}>
              -₹{fmt(Math.abs(summary.adjustments))}
            </span>
          </div>
        </div>

        {/* Paid */}
        <div
          className="billing-kpi-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDetails("paid")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenDetails("paid"); } }}
          title="Click to view doctor-wise Paid disbursements"
        >
          <div className="billing-kpi-icon-wrap" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div className="billing-kpi-info">
            <span className="billing-kpi-label">Paid</span>
            <span className="billing-kpi-value">₹{fmt(summary.paid)}</span>
          </div>
        </div>

        {/* Payable */}
        <div
          className="billing-kpi-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDetails("payable")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpenDetails("payable"); } }}
          title="Click to view doctor-wise Outstanding Payable balances"
        >
          <div className="billing-kpi-icon-wrap" style={{ background: "#faf5ff", color: "#9333ea" }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div className="billing-kpi-info">
            <span className="billing-kpi-label">Payable</span>
            <span className="billing-kpi-value">₹{fmt(summary.payable)}</span>
          </div>
        </div>
      </div>

      {/* 5. Main Two-Column Layout */}
      <div className="billing-two-col-layout">
        {/* Left Column: Doctor Statements Table */}
        <div className="billing-left-col">
          <div className="billing-card">
            <div className="billing-card-header">
              <h2 className="billing-card-title">Doctor statements</h2>
            </div>

            <div className="billing-table-responsive">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Earned</th>
                    <th>Adjustments</th>
                    <th>Paid</th>
                    <th>Due</th>
                    <th style={{ textAlign: "right" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((s) => {
                    const isSelected = stmt?.id === s.id;
                    return (
                      <tr
                        key={s.id}
                        className={isSelected ? "selected" : ""}
                        onClick={() => handleSelectStatement(s)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <div style={{ fontWeight: 600, color: "#0f172a" }}>{s.doctor_name}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{s.department}</div>
                        </td>
                        <td style={{ fontWeight: 600 }}>₹{fmt(s.fees_earned)}</td>
                        <td style={{ color: "#ea580c" }}>-₹{fmt(Math.abs(s.adjustments || 0))}</td>
                        <td style={{ color: "#64748b" }}>₹{fmt(s.paid_amount || 0)}</td>
                        <td style={{ fontWeight: 700, color: "#0f172a" }}>₹{fmt(s.remaining_payable || 0)}</td>
                        <td style={{ textAlign: "right" }}>
                          <span
                            className={
                              s.status === "Approved"
                                ? "billing-badge-approved"
                                : "billing-badge-review"
                            }
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Selected Statement Form */}
        <div className="billing-right-col">
          <div className="billing-card">
            <div className="billing-card-header">
              <h2 className="billing-card-title">Selected statement</h2>
            </div>

            <div className="billing-card-body">
              {/* Doctor header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
                    {stmt?.doctor_name || "Dr. P. Reddy"}
                  </h3>
                  <div style={{ fontSize: "0.775rem", color: "#64748b", marginTop: "2px" }}>
                    {stmt?.statement_no || "ST-0094"} • {stmt?.period_month || "September 2026"}
                  </div>
                </div>
                <span className="billing-badge-approved">
                  {stmt?.status || "Approved"}
                </span>
              </div>

              {/* Breakdown lines */}
              <div style={{ marginTop: "12px", borderTop: "1px solid #f1f5f9", paddingTop: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.875rem" }}>
                  <span style={{ color: "#64748b" }}>Fees earned</span>
                  <span style={{ fontWeight: 600 }}>₹{fmt(stmt?.fees_earned || 10000)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.875rem" }}>
                  <span style={{ color: "#64748b" }}>Adjustment</span>
                  <span style={{ color: "#ea580c", fontWeight: 600 }}>-₹{fmt(Math.abs(stmt?.adjustments || 500))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.875rem" }}>
                  <span style={{ color: "#64748b" }}>Net payable</span>
                  <span style={{ fontWeight: 600 }}>₹{fmt(stmt?.net_payable || (stmt?.fees_earned - Math.abs(stmt?.adjustments || 0)) || 9500)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", fontSize: "0.875rem" }}>
                  <span style={{ color: "#64748b" }}>Previously paid</span>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>₹{fmt(stmt?.paid_amount || 5000)}</span>
                </div>

                {/* Remaining payable highlight */}
                <div className="billing-highlight-box teal-emphasis">
                  <div>
                    <span className="box-label">Remaining payable</span>
                  </div>
                  <span className="box-value">₹{fmt(stmt?.remaining_payable || 4500)}</span>
                </div>

                {/* Form fields */}
                <div className="billing-form-group">
                  <label className="billing-form-label">Payment amount</label>
                  <div style={{ display: "flex", alignItems: "center", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0 12px" }}>
                    <span style={{ fontWeight: 600, color: "#64748b", marginRight: "4px" }}>₹</span>
                    <input
                      type="number"
                      step="0.01"
                      className="billing-form-input"
                      style={{ border: "none", padding: "8px 0" }}
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="billing-form-group">
                  <label className="billing-form-label">Payment mode</label>
                  <select
                    className="billing-form-input"
                    value={payoutMode}
                    onChange={(e) => setPayoutMode(e.target.value)}
                  >
                    {paymentModeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="billing-form-group">
                  <label className="billing-form-label">Reference</label>
                  <input
                    type="text"
                    className="billing-form-input"
                    placeholder="Enter transaction reference"
                    value={payoutRef}
                    onChange={(e) => setPayoutRef(e.target.value)}
                  />
                </div>

                <div className="billing-form-group">
                  <label className="billing-form-label">Payment date</label>
                  <div style={{ display: "flex", alignItems: "center", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0 12px" }}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#64748b" strokeWidth="2" style={{ marginRight: "6px" }}>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <input
                      type="date"
                      className="billing-form-input"
                      style={{ border: "none", padding: "8px 0" }}
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Record Payout button */}
                <button
                  type="button"
                  className="billing-btn-teal"
                  style={{ width: "100%", padding: "10px", marginTop: "4px" }}
                  onClick={handleRecordPayout}
                  disabled={submittingPayout}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <polyline points="9 15 11 17 15 13" />
                  </svg>
                  {submittingPayout ? "Recording..." : "Record payout"}
                </button>

                <div style={{ textAlign: "center", marginTop: "12px", fontSize: "0.75rem", color: "#64748b" }}>
                  ⓘ Record only after payment confirmation.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Bottom Section: Payout History */}
      <div className="billing-card" style={{ marginTop: "1.25rem" }}>
        <div className="billing-card-header">
          <h2 className="billing-card-title">Payout history</h2>
        </div>

        <div className="billing-table-responsive">
          <table className="billing-table">
            <thead>
              <tr>
                <th>Payout no.</th>
                <th>Doctor</th>
                <th>Payment date</th>
                <th>Payment mode</th>
                <th>Amount</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {payoutHistory.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.payout_no}</td>
                  <td>{p.doctor_name}</td>
                  <td style={{ color: "#64748b" }}>{p.paid_date}</td>
                  <td>{p.payment_mode}</td>
                  <td style={{ fontWeight: 700 }}>₹{fmt(p.amount)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="billing-btn-table-outline"
                      onClick={() => printVoucher(p)}
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 6 2 18 2 18 9" />
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                      Print voucher
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Doctor Payout Details Pop-up Modal (Issue 3) */}
      <Modal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title={detailsData?.title || "Doctor Payout Details"}
        description={`Doctor-wise breakdown for period: ${periodMonth}${department && department !== "All departments" ? ` · ${department}` : ""}`}
        className="billing-details-modal"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Top Meta Bar */}
          <div className="billing-details-meta-bar">
            <div className="billing-details-summary-stats">
              <div className="billing-details-stat-item">
                <span className="billing-details-stat-label">Doctors Count</span>
                <span className="billing-details-stat-value">{detailsData?.count ?? 0}</span>
              </div>
              <div className="billing-details-stat-item">
                <span className="billing-details-stat-label">
                  {detailsMetric === "adjustments" ? "Total Deductions / TDS" : "Total Amount"}
                </span>
                <span
                  className="billing-details-stat-value"
                  style={{
                    color:
                      detailsMetric === "adjustments"
                        ? "#ea580c"
                        : detailsMetric === "payable"
                        ? "#9333ea"
                        : detailsMetric === "paid"
                        ? "#2563eb"
                        : "#16a34a",
                  }}
                >
                  {detailsMetric === "adjustments" ? "-₹" : "₹"}
                  {fmt(Math.abs(detailsData?.total_amount ?? 0))}
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
                placeholder="Filter doctors or statements..."
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

          {/* Table */}
          {detailsLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
              <div className="loading-spinner" style={{ margin: "0 auto 12px" }}></div>
              Loading doctor payout details...
            </div>
          ) : !detailsData?.records || detailsData.records.length === 0 ? (
            <div style={{ padding: "36px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px" }}>
              No doctor payout records found for {periodMonth}.
            </div>
          ) : (() => {
            const query = detailsFilterQuery.trim().toLowerCase();
            const filtered = detailsData.records.filter((r: any) => {
              if (!query) return true;
              return (
                (r.doctor_name && r.doctor_name.toLowerCase().includes(query)) ||
                (r.department && r.department.toLowerCase().includes(query)) ||
                (r.statement_no && r.statement_no.toLowerCase().includes(query)) ||
                (r.mode && r.mode.toLowerCase().includes(query)) ||
                (r.reference && r.reference.toLowerCase().includes(query)) ||
                (r.status && r.status.toLowerCase().includes(query))
              );
            });

            if (filtered.length === 0) {
              return (
                <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                  No matching doctors for "{detailsFilterQuery}".
                </div>
              );
            }

            return (
              <div className="billing-details-table-wrap">
                <table className="billing-details-table">
                  <thead>
                    <tr>
                      <th>Doctor Name</th>
                      <th>Department</th>
                      <th>Statement / Ref</th>
                      {detailsMetric === "fees_earned" && <th style={{ textAlign: "center" }}>Consultations</th>}
                      {detailsMetric === "adjustments" && <th>Adjustment Reason / TDS</th>}
                      {detailsMetric === "paid" && <th>Payment Mode</th>}
                      {detailsMetric === "paid" && <th>Disbursed Date</th>}
                      <th style={{ textAlign: "right" }}>
                        {detailsMetric === "fees_earned"
                          ? "Fees Earned (₹)"
                          : detailsMetric === "adjustments"
                          ? "Adjustment (₹)"
                          : detailsMetric === "paid"
                          ? "Disbursed Amount (₹)"
                          : "Outstanding Payable (₹)"}
                      </th>
                      {detailsMetric === "payable" && <th style={{ textAlign: "right" }}>Earned / Paid</th>}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any, idx: number) => (
                      <tr key={r.id || idx}>
                        <td style={{ fontWeight: 600, color: "#0f172a" }}>
                          {r.doctor_name}
                        </td>
                        <td style={{ color: "#475569" }}>
                          {r.department || "-"}
                        </td>
                        <td style={{ fontSize: "0.75rem", fontWeight: 500, color: "#64748b" }}>
                          {r.statement_no || r.reference || "-"}
                        </td>
                        {detailsMetric === "fees_earned" && (
                          <td style={{ textAlign: "center" }}>
                            <span className="billing-table-badge badge-blue">
                              {r.consultations_count ?? 0} OP visits
                            </span>
                          </td>
                        )}
                        {detailsMetric === "adjustments" && (
                          <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                            {r.notes || "Contractual adjustment / TDS"}
                          </td>
                        )}
                        {detailsMetric === "paid" && (
                          <td>
                            <span className="billing-table-badge badge-gray">{r.mode}</span>
                          </td>
                        )}
                        {detailsMetric === "paid" && (
                          <td style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            {r.paid_date || "-"}
                          </td>
                        )}
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color:
                              detailsMetric === "adjustments"
                                ? "#ea580c"
                                : detailsMetric === "payable"
                                ? "#9333ea"
                                : detailsMetric === "paid"
                                ? "#2563eb"
                                : "#16a34a",
                          }}
                        >
                          {detailsMetric === "adjustments" ? "-₹" : "₹"}
                          {fmt(Math.abs(r.amount))}
                        </td>
                        {detailsMetric === "payable" && (
                          <td style={{ textAlign: "right", fontSize: "0.75rem", color: "#64748b" }}>
                            ₹{fmt(r.fees_earned)} earned / ₹{fmt(r.paid_amount)} paid
                          </td>
                        )}
                        <td>
                          <span
                            className={`billing-table-badge ${
                              String(r.status).toLowerCase() === "approved"
                                ? "badge-green"
                                : String(r.status).toLowerCase() === "disbursed"
                                ? "badge-blue"
                                : "badge-orange"
                            }`}
                          >
                            {r.status || "Ready for review"}
                          </span>
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
              Professional fees calculated based on hospital contractual terms and appointment attendance.
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

