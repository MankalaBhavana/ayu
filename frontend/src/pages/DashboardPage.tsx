import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Modal } from "../components/ui";
import { API_BASE } from "../lib/constants";
import { downloadPDF, printPDF, exportPDF, generateClientPdf, generatePDFBlob } from "../lib/exportService";
import type { StandardPdfPayload } from "../lib/exportService";
import { filenameFromContentDisposition } from "../lib/exportShare";
import PdfExportDropdown from "../components/PdfExportDropdown";
import type { DashboardAnalytics, DistributionItem, HospitalSummary, Patient, Stats, User, Notice } from "../types";
import { PRINT_BRAND_HEADER_DATA_URI } from "../lib/printBrand";
import { printViaIframe } from "../lib/printViaIframe";
import DateCalendarPicker, { toIsoDate, parseIsoDate } from "../components/DateCalendarPicker";

type Props = {
  stats: Stats;
  recentPatients: Patient[];
  patients: Patient[];
  analytics: DashboardAnalytics | null;
  hospitalSummary: HospitalSummary | null;
  analyticsLoading: boolean;
  onNavigate: (page: string) => void;
  user: User | null;
  onLogout: () => void;
  onRefreshDashboard?: () => Promise<boolean>;
  setNotice?: Dispatch<SetStateAction<Notice | null>>;
  dashboardDate: string;
  setDashboardDate: (date: string) => void;
};


function formatCurrency(amount?: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
}

function formatNumber(amount?: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount || 0);
}



const safeDashboardPrintText = (value: unknown) => String(value ?? "-")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");


function patientCreatedIso(patient: Patient) {
  const uhidMatch = patient.patient_id?.match(/^PAT-(\d{4})(\d{2})(\d{2})/i);
  if (uhidMatch) {
    return `${uhidMatch[1]}-${uhidMatch[2]}-${uhidMatch[3]}`;
  }

  const raw = patient.created_at || "";
  if (!raw) return "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : toIsoDate(parsed);
}

function patientDisplayName(patient: Patient) {
  return [patient.name, patient.middle_name, patient.last_name].filter(Boolean).join(" ") || patient.patient_id;
}

function isPatientActiveOnDate(patient: Patient, dateIso: string) {
  if (!patient || !dateIso) return false;
  // 1. Initial registration on this date
  if (patientCreatedIso(patient) === dateIso) return true;
  // 2. Appointment or revisit on this date
  if (patient.visit_dates) {
    const dates = patient.visit_dates.split(",").map((d) => d.trim());
    if (dates.includes(dateIso)) return true;
  }
  // 3. Admission on this date
  if (patient.admission_dates) {
    const dates = patient.admission_dates.split(",").map((d) => d.trim());
    if (dates.includes(dateIso)) return true;
  }
  return false;
}

function patientAgeGender(patient: Patient) {
  const age = patient.age ? `${patient.age} yrs` : "Age not added";
  const gender = patient.gender || "Gender not added";
  return `${age} / ${gender}`;
}

// ── Top KPI cards ────────────────────────────────────────────────────────────
function KpiCard({
  icon,
  label,
  value,
  sub,
  trend,
  iconBg,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: string; up: boolean };
  iconBg: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="hosp-kpi-card hosp-clickable-card"
      style={{ "--kpi-accent": iconBg } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="hosp-kpi-icon" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="hosp-kpi-body">
        <p className="hosp-kpi-label">{label}</p>
        <h3 className="hosp-kpi-value">{value}</h3>
        {sub && <span className="hosp-kpi-sub">{sub}</span>}
        {trend && (
          <span className={`hosp-kpi-trend ${trend.up ? "up" : "down"}`}>
            {trend.up ? "▲" : "▼"} {trend.value}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Circular / arc gauge ──────────────────────────────────────────────────────
function CircleGauge({
  pct,
  color,
  label,
  center,
}: {
  pct: number;
  color: string;
  label: string;
  center: string;
}) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="hosp-gauge-wrap">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#e8f2f8" strokeWidth="10" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
        />
        <text x="55" y="51" textAnchor="middle" fontSize="16" fontWeight="800" fill="#12344c">
          {center}
        </text>
        <text x="55" y="66" textAnchor="middle" fontSize="9" fill="#4b6678">
          {label}
        </text>
      </svg>
    </div>
  );
}

// ── Mini donut (OP queue) ──────────────────────────────────────────────────────
function MiniDonut({
  segments,
  total,
}: {
  segments: { color: string; pct: number; label: string; count: number }[];
  total: number;
}) {
  const r = 50;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="hosp-mini-donut-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        {segments.map((seg) => {
          const dash = (seg.pct / 100) * circ;
          const gap = circ - dash;
          const rot = (offset / 100) * 360 - 90;
          offset += seg.pct;
          return (
            <circle
              key={seg.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="18"
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="butt"
              transform={`rotate(${rot} 70 70)`}
            />
          );
        })}
        <text x="70" y="65" textAnchor="middle" fontSize="22" fontWeight="900" fill="#12344c">
          {total}
        </text>
        <text x="70" y="82" textAnchor="middle" fontSize="10" fill="#4b6678">
          Total
        </text>
      </svg>
    </div>
  );
}


export default function DashboardPage({
  stats,
  recentPatients,
  patients,
  analytics,
  hospitalSummary,
  analyticsLoading,
  onNavigate,
  user,
  onLogout,
  onRefreshDashboard,
  setNotice,
  dashboardDate,
  setDashboardDate,
}: Props) {
  const [exportStatus, setExportStatus] = useState<"" | "print" | "export">("");
  const [canShare, setCanShare] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const nav = navigator as any;
    if (nav.share && nav.canShare) {
      try {
        const testFile = new File([new Blob([])], "test.pdf", { type: "application/pdf" });
        const allowed = nav.canShare({ files: [testFile] });
        console.log(`[Dashboard PDF Export] canShare check on mount resolved to: ${allowed}`);
        setCanShare(allowed);
      } catch (err) {
        console.error(`[Dashboard PDF Export] canShare check failed on mount:`, err);
        setCanShare(false);
      }
    } else {
      if (import.meta.env.DEV) {
        console.log(`[Dashboard PDF Export] Navigator share or canShare API not available on this browser/environment.`);
      }
      setCanShare(false);
    }
  }, []);
  const todayIso = toIsoDate(new Date());
  const [profileOpen, setProfileOpen] = useState(false);
  const [todayPatientsOpen, setTodayPatientsOpen] = useState(false);
  const [revenuePopup, setRevenuePopup] = useState<"today" | "monthly" | "pharmacy" | "lab" | null>(null);
  const [exportingPopup, setExportingPopup] = useState(false);
  const [viewPatient, setViewPatient] = useState<Patient | null>(null);
  const dashboardProfileRef = useRef<HTMLDivElement | null>(null);
  const currentDateLabel = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(parseIsoDate(dashboardDate));

  useEffect(() => {
    const closeOverlays = (event: MouseEvent) => {
      if (dashboardProfileRef.current && !dashboardProfileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOverlays);
    return () => document.removeEventListener("mousedown", closeOverlays);
  }, []);

  // The initial load already happens where this page is mounted; record
  // that as the first "last refreshed" timestamp instead of silently
  // polling the backend in the background.
  useEffect(() => {
    setLastRefreshedAt(new Date());
  }, []);

  const handleManualRefresh = async () => {
    if (!onRefreshDashboard || refreshing) return;
    setRefreshing(true);
    try {
      await onRefreshDashboard();
      setLastRefreshedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  const go = (page: string) => onNavigate(page);


  // Removed old handleShareDashboardPdf and handleDownloadDashboardPdf in favor of PdfExportDropdown

  const patientsForDashboardDate = useMemo(
    () => patients.filter((patient) => isPatientActiveOnDate(patient, dashboardDate)),
    [patients, dashboardDate]
  );
  const newRegistrationsCount = useMemo(
    () => patientsForDashboardDate.filter((p) => patientCreatedIso(p) === dashboardDate).length,
    [patientsForDashboardDate, dashboardDate]
  );
  const revisitedPatientsCount = useMemo(
    () => patientsForDashboardDate.filter((p) => patientCreatedIso(p) !== dashboardDate).length,
    [patientsForDashboardDate, dashboardDate]
  );
  const selectedDateRegistrationCount = patientsForDashboardDate.length;
  const dashboardDateIsToday = dashboardDate === todayIso;
  const selectedDateRevenueLabel = dashboardDateIsToday ? "Today's Revenue" : "Revenue";
  // Derived values
  const dailyOp = hospitalSummary?.ip_op_counts?.daily_op || 0;
  const dailyIp = hospitalSummary?.ip_op_counts?.daily_ip || 0;
  const monthlyRevenue = hospitalSummary?.revenue?.monthly_total ?? hospitalSummary?.revenue?.total ?? 0;
  const todayRevenue = hospitalSummary?.revenue?.today_total ?? 0;
  const dueRevenue = hospitalSummary?.revenue?.due || 0;
  const diagIncome = hospitalSummary?.revenue?.module_breakdown?.today?.lab_diagnostics ?? 0;
  const pharmacyIncome = hospitalSummary?.revenue?.module_breakdown?.today?.pharmacy 
    ?? hospitalSummary?.pharmacy_summary?.today_sales 
    ?? 0;
  const monthlyPharmacyIncome = hospitalSummary?.revenue?.module_breakdown?.monthly?.pharmacy 
    ?? hospitalSummary?.pharmacy_summary?.monthly_sales 
    ?? 0;
  const bedCapacity = hospitalSummary?.bed_stats?.capacity ?? 50;
  const bedOccupied = hospitalSummary?.bed_stats?.occupied ?? dailyIp ?? 0;
  const bedAvailable = hospitalSummary?.bed_stats?.available ?? Math.max(bedCapacity - bedOccupied, 0);
  const bedOccupancyRate = hospitalSummary?.bed_stats?.occupancy_rate ?? (bedCapacity > 0 ? Math.round((bedOccupied / bedCapacity) * 100) : 0);
  const doctorPayoutReady = hospitalSummary?.revenue?.doctor_payout_ready || 0;
  const revenueBreakdown = hospitalSummary?.revenue?.module_breakdown || {};
  const todayRevenueBreakdown = revenueBreakdown.today || {};
  const monthlyRevenueBreakdown = revenueBreakdown.monthly || {};
  const paymentModes = (hospitalSummary?.revenue?.payment_mode_breakdown || []).filter(m => m.label !== "Bank Transfer" && m.label !== "Bank" && m.label !== "bank");

  const selectedDateRevenueValue = formatCurrency(todayRevenue);
  const selectedDateRevenueSub = dashboardDateIsToday ? "From today's invoices" : `Revenue for ${currentDateLabel}`;

  const opCompleted = Math.max(dailyOp, 0);
  const todayOps = hospitalSummary?.operations_today || {};
  const opStatus = (
    key: keyof NonNullable<HospitalSummary["operations_today"]>,
    fallback: { count: number; completed: number; pending: number }
  ) => {
    const source = todayOps[key];
    return {
      count: Number(source?.count ?? fallback.count ?? 0),
      completed: Number(source?.completed ?? fallback.completed ?? 0),
      pending: Number(source?.pending ?? fallback.pending ?? 0),
    };
  };

  const paymentSummaryRows = paymentModes.length
    ? paymentModes
    : [{ label: "No collections recorded", count: 0 }];
  const paymentSummaryTotal = paymentModes.reduce((total, row) => total + Number(row.count || 0), 0);

  // --- UNIFIED DATA SOURCE (Used by both UI and PDF export to guarantee consistency) ---
  const dashboardSummaryData = [
    { metric: dashboardDateIsToday ? "Today's Registrations" : "Registrations", value: selectedDateRegistrationCount, remarks: dashboardDateIsToday ? "New patient registrations today" : `New registrations for ${currentDateLabel}` },
    { metric: dashboardDateIsToday ? "Today's Revenue" : "Revenue", value: todayRevenue, remarks: dashboardDateIsToday ? "Live invoice total for today" : `Live invoice total for ${currentDateLabel}` },
    { metric: "Monthly Revenue", value: monthlyRevenue, remarks: "Live invoice total for this month" },
    { metric: "Today's Pharmacy Sales", value: pharmacyIncome, remarks: dashboardDateIsToday ? "Today's pharmacy sales" : `Pharmacy sales for ${currentDateLabel}` },
    { metric: "Lab Revenue", value: diagIncome, remarks: dashboardDateIsToday ? "Today's diagnostics" : `Diagnostics for ${currentDateLabel}` },
  ];

  const registrationOps = { count: selectedDateRegistrationCount, completed: selectedDateRegistrationCount, pending: 0 };
  const queueOps = opStatus("queue_management", { count: dailyOp, completed: opCompleted, pending: 0 });
  const consultationOps = opStatus("doctor_consultation", { count: dailyOp, completed: opCompleted, pending: 0 });
  const pharmacyOps = opStatus("pharmacy", {
    count: hospitalSummary?.pharmacy_summary?.today_transactions ?? (pharmacyIncome > 0 ? 1 : 0),
    completed: hospitalSummary?.pharmacy_summary?.today_transactions ?? (pharmacyIncome > 0 ? 1 : 0),
    pending: 0,
  });

  const doctorPayoutOps = opStatus("doctor_payout", { count: doctorPayoutReady > 0 ? 1 : 0, completed: 0, pending: doctorPayoutReady > 0 ? 1 : 0 });

  const ops = [
    { module: "Patient Registration", icon: "👤", ...registrationOps },
    { module: "Queue Management", icon: "🏥", ...queueOps },
    { module: "Patient Journey", icon: "🗺️", count: stats.total || 0, completed: stats.total || 0, pending: 0 },
    { module: "Doctor Consultation", icon: "🩺", ...consultationOps },
    { module: "Pharmacy Dispensing", icon: "💊", ...pharmacyOps },
    { module: "Doctor Payout", icon: "👨‍⚕️", ...doctorPayoutOps },
  ];

  const revenueSnapshotData = [
    { label: dashboardDateIsToday ? "Today Revenue" : "Revenue", icon: "🏥", value: todayRevenue },
    { label: "Today's Pharmacy Sales", icon: "💊", value: pharmacyIncome },
    { label: "Lab & Diagnostic Billing", icon: "🧪", value: diagIncome },
    { label: "Monthly Revenue", icon: "📅", value: monthlyRevenue },
    { label: "Pending Payments", icon: "⚠️", value: dueRevenue },
    { label: "Doctor Payout Ready", icon: "👨‍⚕️", value: doctorPayoutReady },
  ];

  const handleGeneratePdf = async () => {
    const payload: StandardPdfPayload = {
      title: "Executive Dashboard Report",
      subtitle: `Hospital Performance & Revenue Summary for ${currentDateLabel}`,
      filename: "Executive_Dashboard",
      brand_logo: "ayu",
      include_signature: false,
      include_doctor_details: false,
      operator_name: user?.full_name || "Ayu Polyclinic System",
      sections: [
        {
          title: "Dashboard Summary",
          headers: ["Metric", "Value", "Remarks"],
          rows: dashboardSummaryData.map(r => [r.metric, typeof r.value === "number" ? formatNumber(r.value) : r.value, r.remarks]),
        },
        {
          title: dashboardDateIsToday ? "Today's Operations" : `Operations for ${currentDateLabel}`,
          headers: ["Module", "Count", "Completed", "Pending"],
          rows: ops.map(op => [op.module, op.count, op.completed, op.pending]),
        },
        {
          title: "Revenue Snapshot",
          headers: ["Revenue Head", "Amount"],
          rows: [
            ...revenueSnapshotData.map(r => [r.label, formatCurrency(r.value)]),
            ["Total Revenue", formatCurrency(monthlyRevenue)],
            ["Outstanding Amount", formatCurrency(dueRevenue)],
          ],
        },
        {
          title: "Payment Summary",
          headers: ["Payment Mode", "Amount"],
          rows: paymentSummaryRows.length > 0 && paymentSummaryTotal > 0
            ? [...paymentSummaryRows.map((r) => [r.label || "Cash", formatCurrency(Number(r.count || 0))]), ["Total Collected", formatCurrency(paymentSummaryTotal)]]
            : [["No collections recorded today", formatCurrency(0)], ["Total Collected", formatCurrency(0)]],
        },
      ],
    };

    return await generatePDFBlob(payload);
  };

  const handlePrintDashboardPdf = async () => {
    if (exportStatus) return;
    setExportStatus("print");
    try {
      const { blob } = await handleGeneratePdf();
      printPDF(blob);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to print the dashboard PDF.");
    } finally {
      setExportStatus("");
    }
  };

  const revenuePopupRows = useMemo(() => {
    if (revenuePopup === "lab") {
      const breakdownToday = hospitalSummary?.revenue?.module_breakdown?.today as Record<string, number> | undefined;
      const earned = breakdownToday?.lab_earned ?? diagIncome;
      const collected = breakdownToday?.lab_collected ?? 0;
      const due = breakdownToday?.lab_due ?? 0;
      return [
        { module: "Lab & Diagnostics (Total Billed)", amount: earned },
        { module: "Collected / Received", amount: collected },
        { module: "Outstanding Due", amount: due },
      ];
    }
    if (revenuePopup === "pharmacy") {
      return [
        { module: "Today's Pharmacy Sales", amount: pharmacyIncome },
        { module: "Pharmacy Monthly Sales", amount: monthlyPharmacyIncome },
      ];
    }
    const activeBreakdown = revenuePopup === "today" ? todayRevenueBreakdown : monthlyRevenueBreakdown;
    const activeTotal = revenuePopup === "today" ? todayRevenue : monthlyRevenue;
    const labAmount = Number(activeBreakdown.lab_diagnostics ?? (revenuePopup === "today" ? 0 : diagIncome));
    const pharmacyAmount = Number(activeBreakdown.pharmacy ?? (revenuePopup === "today" ? pharmacyIncome : monthlyPharmacyIncome));
    const opAmount = Math.max(activeTotal - labAmount - pharmacyAmount, 0);
    return [
      { module: "OP / General Billing", amount: opAmount },
      { module: "Pharmacy Sales", amount: pharmacyAmount },
      { module: "Lab & Diagnostics", amount: labAmount },
      { module: "Pending / Due", amount: dueRevenue },
    ];
  }, [revenuePopup, todayRevenue, monthlyRevenue, diagIncome, pharmacyIncome, monthlyPharmacyIncome, dueRevenue, todayRevenueBreakdown, monthlyRevenueBreakdown, hospitalSummary]);

  const breakdownTodayForTotal = hospitalSummary?.revenue?.module_breakdown?.today as Record<string, number> | undefined;
  const revenuePopupTotal =
    revenuePopup === "today"
      ? todayRevenue
      : revenuePopup === "lab"
        ? (breakdownTodayForTotal?.lab_earned ?? diagIncome)
        : revenuePopup === "pharmacy"
          ? pharmacyIncome
          : monthlyRevenue;
  const revenuePopupCollected =
    revenuePopup === "today"
      ? todayRevenue
      : revenuePopup === "lab"
        ? (breakdownTodayForTotal?.lab_collected ?? diagIncome)
        : revenuePopup === "pharmacy"
          ? pharmacyIncome
          : monthlyRevenue;
  const revenuePopupOutstanding =
    revenuePopup === "lab"
      ? (breakdownTodayForTotal?.lab_due ?? 0)
      : revenuePopup === "pharmacy"
        ? 0
        : dueRevenue;
  const revenuePopupTitle =
    revenuePopup === "today"
      ? "Today's Revenue Details"
      : revenuePopup === "lab"
        ? "Lab Revenue Details"
        : revenuePopup === "pharmacy"
          ? "Today's Pharmacy Sales Details"
          : "Monthly Revenue Details";
  const revenuePopupPdfTitle = revenuePopup === "today"
    ? "Today's Revenue"
    : revenuePopup === "monthly"
      ? "Monthly Revenue"
      : revenuePopupTitle;

  const buildRevenuePopupPdfPayload = (): StandardPdfPayload => {
    return {
      title: revenuePopupTitle,
      subtitle: `Hospital Revenue Summary for ${currentDateLabel}`,
      filename: revenuePopupPdfTitle.replace(/[^A-Za-z0-9_-]+/g, "_"),
      brand_logo: "ayu",
      include_signature: false,
      include_doctor_details: false,
      operator_name: user?.full_name || user?.username || "Ayu Polyclinic System",
      sections: [
        {
          title: "Revenue Overview",
          headers: ["Metric", "Amount"],
          rows: [
            ["Total Revenue", formatCurrency(revenuePopupTotal)],
            ["Collected Amount", formatCurrency(revenuePopupCollected)],
            ["Outstanding Amount", formatCurrency(revenuePopupOutstanding)],
          ],
        },
        {
          title: "Module Breakdown",
          headers: ["Module / Head", "Amount"],
          rows: revenuePopupRows.map((r) => [r.module, formatCurrency(r.amount)]),
        },
      ],
      totals: {
        grand_total: formatCurrency(revenuePopupTotal),
        amount_received: formatCurrency(revenuePopupCollected),
        balance: formatCurrency(revenuePopupOutstanding),
      },
    };
  };

  const downloadRevenuePopupPdf = async () => {
    if (!revenuePopup || exportingPopup) return;
    setExportingPopup(true);
    try {
      const payload = buildRevenuePopupPdfPayload();
      const { blob, filename } = await generatePDFBlob(payload);
      downloadPDF(blob, filename);
      setNotice?.({ type: "success", message: `${revenuePopupPdfTitle} PDF downloaded successfully.` });
    } catch (err) {
      console.error("Revenue PDF export failed:", err);
      window.alert(err instanceof Error ? err.message : "Unable to generate revenue PDF.");
    } finally {
      setExportingPopup(false);
    }
  };

  const handlePrintRevenuePopupPdf = async () => {
    if (!revenuePopup || exportingPopup) return;
    setExportingPopup(true);
    try {
      const payload = buildRevenuePopupPdfPayload();
      const { blob } = await generatePDFBlob(payload);
      printPDF(blob);
    } catch (err) {
      console.error("Revenue PDF print failed:", err);
      window.alert(err instanceof Error ? err.message : "Unable to print revenue PDF.");
    } finally {
      setExportingPopup(false);
    }
  };

  const buildRegistrationsPopupPdfPayload = (): StandardPdfPayload => {
    const title = dashboardDateIsToday ? "Today's Registrations" : `Registrations - ${currentDateLabel}`;
    return {
      title,
      subtitle: `Patient Registration Summary for ${currentDateLabel}`,
      filename: `Patient_Registrations_${dashboardDate}`,
      brand_logo: "ayu",
      include_signature: false,
      include_doctor_details: false,
      operator_name: user?.full_name || user?.username || "Ayu Polyclinic System",
      sections: [
        {
          title: "Registration Metrics",
          headers: ["Category", "Count"],
          rows: [
            ["New Registrations", String(newRegistrationsCount)],
            ["Revisited Patients", String(revisitedPatientsCount)],
            ["Total Active Registrations", String(selectedDateRegistrationCount)],
          ],
        },
        {
          title: "Registered Patients List",
          headers: ["UHID / Patient ID", "Patient Name", "Visit Type", "Age / Gender", "Phone"],
          rows: patientsForDashboardDate.length > 0
            ? patientsForDashboardDate.map((p) => {
                const isRevisit = patientCreatedIso(p) !== dashboardDate;
                return [
                  p.patient_id,
                  patientDisplayName(p),
                  isRevisit ? "Revisit" : "New Registration",
                  patientAgeGender(p),
                  p.phone || "Phone not added",
                ];
              })
            : [["No patient registrations found for this date", "-", "-", "-", "-"]],
        },
      ],
      totals: {
        grand_total: `${selectedDateRegistrationCount} Patients`,
      },
    };
  };

  const downloadRegistrationsPopupPdf = async () => {
    if (exportingPopup) return;
    setExportingPopup(true);
    try {
      const payload = buildRegistrationsPopupPdfPayload();
      const { blob, filename } = await generatePDFBlob(payload);
      downloadPDF(blob, filename);
      setNotice?.({ type: "success", message: "Patient Registrations PDF downloaded successfully." });
    } catch (err) {
      console.error("Registration PDF export failed:", err);
      window.alert(err instanceof Error ? err.message : "Unable to generate registration PDF.");
    } finally {
      setExportingPopup(false);
    }
  };

  const handlePrintRegistrationsPopupPdf = async () => {
    if (exportingPopup) return;
    setExportingPopup(true);
    try {
      const payload = buildRegistrationsPopupPdfPayload();
      const { blob } = await generatePDFBlob(payload);
      printPDF(blob);
    } catch (err) {
      console.error("Registration PDF print failed:", err);
      window.alert(err instanceof Error ? err.message : "Unable to print registration PDF.");
    } finally {
      setExportingPopup(false);
    }
  };



  const greetingHour = new Date().getHours();
  const timeOfDayGreeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (user?.full_name || user?.username || "").trim().split(/\s+/)[0];
  const dashboardHeadline = firstName ? `${timeOfDayGreeting}, ${firstName} 👋` : `${timeOfDayGreeting} 👋`;

  return (
    <section className="hosp-dashboard">
      <div className="hosp-dashboard-top">
        <div>
          <p className="hosp-dashboard-page-title">{dashboardHeadline}</p>
          <p className="hosp-dashboard-page-subtitle">Here's how Ayu Polyclinic is doing on {currentDateLabel}.</p>
        </div>
        <div className="hosp-dashboard-top-actions">
          <DateCalendarPicker value={dashboardDate} onChange={setDashboardDate} />
          {onRefreshDashboard && (
            <button
              type="button"
              className="hosp-dashboard-icon-btn"
              onClick={() => void handleManualRefresh()}
              disabled={refreshing}
              title="Refresh dashboard data"
            >
              <span className="hosp-dashboard-action-icon">{refreshing ? "⏳" : "🔄"}</span>
              <span>
                {refreshing
                  ? "Refreshing..."
                  : lastRefreshedAt
                  ? `Last Refresh: ${lastRefreshedAt.toLocaleString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "Refresh"}
              </span>
            </button>
          )}
          <button type="button" className="hosp-dashboard-icon-btn" onClick={() => void handlePrintDashboardPdf()} disabled={exportStatus !== ""}>
            <span className="hosp-dashboard-action-icon">🖨️</span>
            <span>{exportStatus === "print" ? "Preparing..." : "Print"}</span>
          </button>
          <PdfExportDropdown
            setNotice={setNotice}
            onGenerate={async () => {
              const { blob, filename } = await handleGeneratePdf();
              return { blob, filename, title: "Ayu Polyclinic Executive Dashboard", text: "Ayu Polyclinic executive dashboard export" };
            }}
            renderTrigger={(onClick, loading) => (
              <button type="button" className="hosp-dashboard-icon-btn" onClick={onClick} disabled={loading || exportStatus !== ""}>
                <span className="hosp-dashboard-action-icon">📥</span>
                <span>{loading ? "Preparing..." : "Download PDF ▼"}</span>
              </button>
            )}
          />
          <div className="hosp-dashboard-profile-wrap" ref={dashboardProfileRef}>
            <button type="button" className="hosp-dashboard-user" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-haspopup="menu">
              <span className="hosp-dashboard-avatar">{(user?.full_name || user?.username || "U").slice(0, 2).toUpperCase()}</span>
              <div>
                <p className="hosp-dashboard-user-name">{user?.full_name || user?.username || "User"}</p>
                <p className="hosp-dashboard-user-role">{user?.user_type === "admin" || user?.role === "admin" ? "Administrator" : "Employee"}</p>
              </div>
              <span className="hosp-dashboard-user-caret">⌄</span>
            </button>
            {profileOpen && (
              <div className="hosp-dashboard-profile-menu" role="menu">
                <button type="button" disabled>
                  {user?.full_name || user?.username || "Signed in user"}
                </button>
                <button type="button" className="danger" onClick={onLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* KPI Row */}
      <div className="hosp-kpi-row">
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
          label="Today's Registrations"
          value={selectedDateRegistrationCount}
          sub={dashboardDate === todayIso ? "New patient registrations today" : `New registrations for ${currentDateLabel}`}
          iconBg="linear-gradient(135deg,#6366f1,#8b5cf6)"
          onClick={() => setTodayPatientsOpen(true)}
        />
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
          label={selectedDateRevenueLabel}
          value={selectedDateRevenueValue}
          sub={selectedDateRevenueSub}
          iconBg="linear-gradient(135deg,#f59e0b,#d97706)"
          onClick={() => setRevenuePopup("today")}
        />
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16v-5" /><path d="M12 16V8" /><path d="M16 16v-3" /></svg>}
          label="Monthly Revenue"
          value={formatCurrency(monthlyRevenue)}
          sub="Live monthly invoice total"
          iconBg="linear-gradient(135deg,#10b981,#059669)"
          onClick={() => setRevenuePopup("monthly")}
        />
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></svg>}
          label="Today's Pharmacy Sales"
          value={formatCurrency(pharmacyIncome)}
          sub={dashboardDateIsToday ? "Today's dispensing" : `Pharmacy for ${currentDateLabel}`}
          iconBg="linear-gradient(135deg,#0d9488,#0f766e)"
          onClick={() => setRevenuePopup("pharmacy")}
        />
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v5l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3.5L14 8V3" /><path d="M8.5 13h7" /></svg>}
          label="Lab Revenue"
          value={formatCurrency(diagIncome)}
          sub={
            hospitalSummary?.revenue?.module_breakdown?.today?.lab_collected
              ? `Collected: ${formatCurrency(hospitalSummary.revenue.module_breakdown.today.lab_collected)}`
              : "Today's diagnostics"
          }
          iconBg="linear-gradient(135deg,#3b82f6,#2563eb)"
          onClick={() => setRevenuePopup("lab")}
        />

      </div>

      {/* Row 2: Quick Actions */}
      <Card className="panel hosp-section-card">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hosp-quick-actions">
            {[
              { label: "Patient Registration", icon: "👤", page: "add" },
              { label: "Patients", icon: "🔍", page: "patients" },
              { label: "Queue Management", icon: "🏥", page: "op-queue-management" },
              { label: "Patient Journey", icon: "🗺️", page: "patient-journey" },
              { label: "Doctor Scheduling", icon: "🩺", page: "op-desk" },
              { label: "Re-visit", icon: "🔄", page: "readmit" },
              { label: "Pharmacy Operations", icon: "💊", page: "pharmacy-overview" },
              { label: "Lab & Diagnostic Billing", icon: "🧪", page: "diag-overview" },
              { label: "Revenue Reports", icon: "📊", page: "billing-module-collections" },
            ].map((action) => (
              <button
                key={action.label}
                className="hosp-quick-btn"
                onClick={() => go(action.page)}
              >
                <span className="hosp-quick-icon">{action.icon}</span>
                <span>{action.label}</span>
                <span className="hosp-quick-arrow">›</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Row 3: Revenue Snapshot | Payment Summary */}
      <div className="hosp-row-4col">
        {/* Revenue Snapshot */}
        <Card className="panel hosp-section-card">
          <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Revenue Snapshot (Today)</CardTitle>
            <button className="hosp-view-all" onClick={() => go("billing-module-collections")}>View All</button>
          </CardHeader>
          <CardContent>
            <div className="hosp-rev-list">
              {revenueSnapshotData.map((row) => (
                <button key={row.label} type="button" className="hosp-rev-row hosp-table-click" onClick={() => go(row.label.includes("Lab") ? "diag-overview" : row.label.includes("Doctor") ? "accounts-doctor-payouts" : "billing-module-collections")}>
                  <span className="hosp-rev-icon">{row.icon}</span>
                  <span className="hosp-rev-label">{row.label}</span>
                  <span className="hosp-rev-value">{formatCurrency(row.value)}</span>
                </button>
              ))}
            </div>
            <div className="hosp-rev-total-row">
              <span>Total Revenue</span>
              <span>{formatCurrency(monthlyRevenue)}</span>
            </div>
            <div className="hosp-rev-due-row">
              <span>Outstanding Amount</span>
              <span style={{ color: "#dc2626" }}>{formatCurrency(dueRevenue)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment Summary */}
        <Card className="panel hosp-section-card">
          <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Payment Summary (Today)</CardTitle>
            <button className="hosp-view-all" onClick={() => go("billing-module-collections")}>View Details</button>
          </CardHeader>
          <CardContent>
            <div className="hosp-pay-list">
              {paymentSummaryRows.map((row) => (
                <button key={row.label} type="button" className="hosp-pay-row hosp-table-click" onClick={() => go("billing-module-collections")}>
                  <span className="hosp-pay-icon">💳</span>
                  <span className="hosp-pay-label">{row.label}</span>
                  <span className="hosp-pay-value">{formatCurrency(row.count)}</span>
                </button>
              ))}
            </div>
            <div className="hosp-pay-total-row">
              <span>Total Collected</span>
              <span style={{ color: "#0891b2", fontWeight: 700 }}>{formatCurrency(paymentSummaryTotal)}</span>
            </div>
          </CardContent>
        </Card>
      </div>



      <Modal
        open={!!revenuePopup}
        onClose={() => setRevenuePopup(null)}
        title={revenuePopupTitle}
        description={`Dashboard revenue details for ${currentDateLabel}`}
        className="hosp-revenue-pop-modal"
      >
        <div className="hosp-revenue-pop-summary">
          <div>
            <span>TOTAL</span>
            <strong>{formatCurrency(revenuePopupTotal)}</strong>
          </div>
          <div>
            <span>Collected</span>
            <strong>{formatCurrency(revenuePopupCollected)}</strong>
          </div>
          <div>
            <span>Outstanding</span>
            <strong>{formatCurrency(revenuePopupOutstanding)}</strong>
          </div>
        </div>
        <div className="hosp-revenue-pop-table">
          <div className="hosp-revenue-pop-head">
            <span>Module</span>
            <span>Amount</span>
          </div>
          {revenuePopupRows.map((row) => (
            <div key={row.module} className="hosp-revenue-pop-row">
              <span>{row.module}</span>
              <strong>{formatCurrency(row.amount)}</strong>
            </div>
          ))}
        </div>
        <div className="hosp-revenue-pop-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <Button variant="ghost" onClick={() => setRevenuePopup(null)}>Close</Button>
          <Button variant="secondary" onClick={() => void handlePrintRevenuePopupPdf()} disabled={exportingPopup}>
            <span style={{ marginRight: 6 }}>🖨️</span> Print
          </Button>
          <Button onClick={() => void downloadRevenuePopupPdf()} disabled={exportingPopup}>
            <span style={{ marginRight: 6 }}>📥</span> {exportingPopup ? "Generating..." : "Download PDF"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={todayPatientsOpen}
        onClose={() => setTodayPatientsOpen(false)}
        title={`Registrations - ${currentDateLabel}`}
        description="Today's patient data updates automatically from the live patient list."
        className="hosp-patient-pop-modal"
      >
        <div className="hosp-patient-pop-summary">
          <div className="hosp-pop-summary-card new-reg">
            <div className="hosp-pop-summary-icon">👤</div>
            <div className="hosp-pop-summary-content">
              <span className="hosp-pop-summary-label">
                {dashboardDateIsToday ? "Today's New Registrations" : "New Registrations"}
              </span>
              <strong className="hosp-pop-summary-value">{newRegistrationsCount}</strong>
              <span className="hosp-pop-summary-sub">First-time registered</span>
            </div>
          </div>

          <div className="hosp-pop-summary-card revisit">
            <div className="hosp-pop-summary-icon">🔄</div>
            <div className="hosp-pop-summary-content">
              <span className="hosp-pop-summary-label">
                {dashboardDateIsToday ? "Today's Revisited Patients" : "Revisited Patients"}
              </span>
              <strong className="hosp-pop-summary-value">{revisitedPatientsCount}</strong>
              <span className="hosp-pop-summary-sub">Follow-up & revisit</span>
            </div>
          </div>

          <div className="hosp-pop-summary-card total">
            <div className="hosp-pop-summary-icon">📋</div>
            <div className="hosp-pop-summary-content">
              <span className="hosp-pop-summary-label">Total Active</span>
              <strong className="hosp-pop-summary-value">{selectedDateRegistrationCount}</strong>
              <span className="hosp-pop-summary-sub">Active visits</span>
            </div>
          </div>
        </div>

        {patientsForDashboardDate.length === 0 ? (
          <div className="hosp-empty-pop">
            <strong>No registrations found.</strong>
            <p>No patient registration records are available for this selected date.</p>
            <Button onClick={() => go("add")}>Add Patient Registration</Button>
          </div>
        ) : (
          <div className="hosp-patient-pop-list">
            {patientsForDashboardDate.map((patient) => {
              const isRevisit = patientCreatedIso(patient) !== dashboardDate;
              return (
                <div key={patient.patient_id} className="hosp-patient-pop-row">
                  <div>
                    <strong>
                      {patientDisplayName(patient)}
                      {isRevisit && (
                        <span
                          style={{
                            marginLeft: "8px",
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            background: "#e0e7ff",
                            color: "#3730a3",
                            fontWeight: 600,
                            display: "inline-block",
                          }}
                        >
                          Revisit
                        </span>
                      )}
                    </strong>
                    <p>{patient.patient_id} • {patientAgeGender(patient)}</p>
                    <p>{patient.phone || "Phone not added"}</p>
                  </div>
                  <Button variant="secondary" onClick={() => setViewPatient(patient)}>View</Button>
                </div>
              );
            })}
          </div>
        )}
        <div className="hosp-patient-pop-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
          <Button variant="ghost" onClick={() => setTodayPatientsOpen(false)}>Close</Button>
          {patientsForDashboardDate.length > 0 && (
            <>
              <Button variant="secondary" onClick={() => void handlePrintRegistrationsPopupPdf()} disabled={exportingPopup}>
                <span style={{ marginRight: 6 }}>🖨️</span> Print
              </Button>
              <Button onClick={() => void downloadRegistrationsPopupPdf()} disabled={exportingPopup}>
                <span style={{ marginRight: 6 }}>📥</span> {exportingPopup ? "Generating..." : "Download PDF"}
              </Button>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={!!viewPatient}
        onClose={() => setViewPatient(null)}
        title={viewPatient ? patientDisplayName(viewPatient) : "Patient Details"}
        description={viewPatient?.patient_id}
        className="hosp-patient-detail-modal"
      >
        {viewPatient && (
          <div className="hosp-patient-detail-grid">
            {[
              ["UHID / Patient ID", viewPatient.patient_id],
              ["Visit Type", patientCreatedIso(viewPatient) === dashboardDate ? "New Registration" : "Revisit / Follow-up"],
              ["Age / Gender", patientAgeGender(viewPatient)],
              ["DOB", viewPatient.dob || "Not added"],
              ["Phone", viewPatient.phone || "Not added"],
              ["Address", viewPatient.address || "Not added"],
              ["Emergency Contact", viewPatient.emergency_contact || "Not added"],
              ["Registered At", viewPatient.created_at || "Not added"],
            ].map(([label, value]) => (
              <div key={label} className="hosp-patient-detail-item">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <div className="hosp-patient-detail-actions">
              <Button variant="secondary" onClick={() => setViewPatient(null)}>Back</Button>
              <Button onClick={() => { setTodayPatientsOpen(false); setViewPatient(null); go("patients"); }}>Open Patient Module</Button>
            </div>
          </div>
        )}
      </Modal>

      {analyticsLoading ? <p className="muted" style={{ marginTop: "0.5rem" }}>Refreshing analytics…</p> : null}
    </section>
  );
}
