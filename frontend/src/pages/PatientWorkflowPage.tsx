import { useMemo, useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Label, Select, Textarea } from "../components/ui";
import type { Notice, Patient } from "../types";
import { fullPatientName, lookupPatientByUhid, normalizeUhidLookup } from "../lib/patientLookup";
import PatientIdentityBanner from "../components/PatientIdentityBanner";
import PatientSearchPicker from "../components/PatientSearchPicker";
import DocumentUploadDropzone from "../components/DocumentUploadDropzone";
import { API_BASE } from "../lib/constants";
import { apiFetch, getHospitalCode, reportError } from "../lib/api";
import { downloadExportBlob } from "../lib/exportShare";
import { filterInteger, filterDecimal } from "../lib/format";
import { printViaIframe } from "../lib/printViaIframe";
import { PRINT_BRAND_HEADER_DATA_URI, PRINT_WATERMARK_DATA_URI, PRINT_RX_SYMBOL_DATA_URI, PRINT_EMBLEM_DATA_URI } from "../lib/printBrand";

type Props = { setNotice: Dispatch<SetStateAction<Notice | null>>; view: "prescription" | "ip-admission" | "nurse-station" | "discharge-summary" };

type Row = Record<string, string> & { id: string };

type Medicine = { medicine_name: string; dosage: string; frequency: string; duration: string; instructions: string; freq_options?: string[]; freq_custom?: string; is_custom?: boolean; };

const FREQ_OPTIONS = [
  { id: "OD", label: "OD", sub: "Once a day" },
  { id: "BD", label: "BD", sub: "Twice a day" },
  { id: "TDS", label: "TDS", sub: "Thrice a day" },
  { id: "QID", label: "QID", sub: "Four times a day" },
  { id: "HS", label: "HS", sub: "At bedtime" },
  { id: "SOS", label: "SOS", sub: "As needed" },
  { id: "AC", label: "AC", sub: "Before meals" },
  { id: "PC", label: "PC", sub: "After meals" }
];

const titles = {
  prescription: ["Doctor Prescription", "Create branded prescriptions with medicines, lab tests, advice, and follow-up."],
  "ip-admission": ["IP Admission", "Manage admission, ward/room/bed allocation, admission notes, and deposits."],
  "nurse-station": ["Nurse Station", "Track vitals, medication administration, shift notes, and nursing tasks."],
  "discharge-summary": ["Discharge Summary", "Prepare final diagnosis, hospital course, medicines, follow-up, and printable discharge summary."],
};

const DEFAULTS = {
  prescription: {
    appointment_id: "", patient_id: "", patient_name: "", age_gender: "", doctor_name: "", department: "", diagnosis: "", lab_tests: "", advice: "", follow_up_date: "", status: "",
    lab_fbs: "", lab_ppbs: "", lab_hba1c: "", lab_tchol: "", lab_ldl: "", lab_tgl: "", lab_vitd: "",
  },
  "ip-admission": {
    patient_id: "", patient_name: "", admission_type: "", ward: "", room_no: "", bed_no: "", consultant: "", diagnosis: "", deposit_amount: "", insurance_status: "", status: "",
  },
  "nurse-station": {
    patient_id: "", patient_name: "", bp: "", temperature: "", pulse: "", spo2: "", medicine_given: "", shift: "", nurse_name: "", notes: "",
  },
  "discharge-summary": {
    admission_id: "", patient_id: "", patient_name: "", admission_date: "", discharge_date: "", final_diagnosis: "", treatment_summary: "", discharge_medicines: "", follow_up_plan: "", billing_clearance: "pending", status: "draft", ward: "", bed_no: "", room_no: "", doctor_name: "",
  },
};

function saveLocal(key: string, row: Row) {
  const rows = JSON.parse(localStorage.getItem(key) || "[]") as Row[];
  localStorage.setItem(key, JSON.stringify([row, ...rows].slice(0, 25)));
}
function loadLocal(key: string) { return JSON.parse(localStorage.getItem(key) || "[]") as Row[]; }

export default function PatientWorkflowPage({ setNotice, view }: Props) {
  const [form, setForm] = useState<Record<string, string>>({ ...DEFAULTS[view] });
  const [savedRows, setSavedRows] = useState<Row[]>(() => loadLocal(`hospai_${view}`));
  const [title, subtitle] = titles[view];
  const amount = useMemo(() => Number(form.deposit_amount || 0), [form.deposit_amount]);
  const [lookingUpPatient, setLookingUpPatient] = useState(false);
  const [bannerPatient, setBannerPatient] = useState<Patient | null>(null);
  // Defaults to false: a completed consultation with zero electronic
  // prescription is a fully valid outcome, never forced.
  const [sendToPharmacy, setSendToPharmacy] = useState(false);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [uploadingScan, setUploadingScan] = useState(false);
  const MAX_SCAN_SIZE_BYTES = 10 * 1024 * 1024;

  const uploadPrescriptionScan = async () => {
    if (!scanFile) return;
    if (!form.patient_id) { setNotice({ type: "warning", message: "Select a patient first." }); return; }
    if (scanFile.size > MAX_SCAN_SIZE_BYTES) { setNotice({ type: "warning", message: "File is too large (max 10MB)." }); return; }
    setUploadingScan(true);
    try {
      const body = new FormData();
      body.append("file", scanFile);
      body.append("doc_type", "prescriptions");
      const response = await fetch(`${API_BASE}/api/patients/${form.patient_id}/documents`, {
        method: "POST",
        body,
        credentials: "include",
        headers: { "X-Hospital-Code": getHospitalCode() },
      });
      if (!response.ok) throw new Error("Upload failed");
      setNotice({ type: "success", message: "Prescription photo/scan saved to patient record and visible to Pharmacy." });
      setScanFile(null);
    } catch {
      setNotice({ type: "error", message: "Unable to upload prescription scan." });
    } finally {
      setUploadingScan(false);
    }
  };

  // Prescription specific state
  const [queue, setQueue] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>(view === "prescription" ? [{ medicine_name: "", dosage: "", frequency: "", freq_options: [], duration: "", instructions: "" }] : []);
  const [multipleMatches, setMultipleMatches] = useState<any[] | null>(null);
  const [prescriptionHistory, setPrescriptionHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  // Visit-based prescription: save_token for idempotency (prevents duplicate records on rapid Save clicks)
  const generateToken = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const [saveToken, setSaveToken] = useState(() => generateToken());
  const [saving, setSaving] = useState(false);

  const fetchPrescriptionHistory = useCallback(async (patientId: string) => {
    if (!patientId || view !== "prescription") return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/prescriptions?patient_id=${encodeURIComponent(patientId)}`, {
        credentials: "include",
        headers: { "X-Hospital-Code": getHospitalCode() },
      });
      if (res.ok) {
        const data = await res.json();
        setPrescriptionHistory(data.prescriptions || []);
      }
    } catch {
      // silently fail — history is non-critical
    } finally {
      setHistoryLoading(false);
    }
  }, [view]);

  useEffect(() => {
    if (view === "prescription") {
      fetch(`${API_BASE}/api/appointments?status=in_consultation`, {
        credentials: "include",
        headers: { "X-Hospital-Code": getHospitalCode() }
      })
      .then(res => res.json())
      .then(data => {
        const apiQueue = (data.appointments || []).map((app: any) => {
          let ag = "";
          if (app.age || app.gender) {
            ag = `${app.age || ""} / ${app.gender || ""}`.trim();
            if (ag === "/") ag = "";
          }
          return { ...app, age_gender: ag };
        });
        const localQueueStr = localStorage.getItem("hospai_op_queue");
        const readmitQueue = localQueueStr ? JSON.parse(localQueueStr) : [];
        const readmitEntries = (Array.isArray(readmitQueue) ? readmitQueue : [])
          .filter((item: any) => item && (item.status === "In Queue" || item.status === "In Consultation"))
          .map((item: any) => {
            let ag = item.ageGender || "";
            if (ag === "- / -") ag = "";
            return {
              id: String(item.token || ""),
              patient_id: String(item.uhid || ""),
              patient_name: String(item.name || item.uhid || "Patient"),
              doctor_name: String(item.doctor || ""),
              department: String(item.department || ""),
              token_no: String(item.token || ""),
              age_gender: ag,
              is_local: true
            };
          });
        
        setQueue([...readmitEntries, ...apiQueue]);
      })
      .catch(console.error);
    }
  }, [view]);

  const update = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const fillPatientFromUhid = async (value: string) => {
    const lookup = normalizeUhidLookup(value);
    if (!lookup) return;
    setLookingUpPatient(true);

    if (view === "prescription") {
      const matches = queue.filter(q => q.patient_id && (q.patient_id.endsWith(lookup) || q.patient_id === lookup));
      if (matches.length === 1) {
        const q = matches[0];
        setForm(prev => ({ ...prev, appointment_id: String(q.id), patient_id: q.patient_id, patient_name: q.patient_name, doctor_name: q.doctor_name, department: q.department, age_gender: q.age_gender || "" }));
        void fetchPrescriptionHistory(q.patient_id);
        setNotice({ type: "success", message: `Auto-filled patient from queue: ${q.patient_name}` });
        lookupPatientByUhid(q.patient_id).then(setBannerPatient).catch(() => setBannerPatient(null));
        return;
      } else if (matches.length > 1) {
        setMultipleMatches(matches);
        setLookingUpPatient(false);
        return;
      }
      // If patient not in queue, fall through to lookupPatientByUhid
    }

    try {
      const patient = await lookupPatientByUhid(lookup);
      if (!patient) {
        setNotice({ type: "warning", message: "No patient found for that UHID / last 4 digits." });
        return;
      }
      let ag = "";
      if (patient.age || patient.gender) {
        ag = `${patient.age || ""} / ${patient.gender || ""}`.trim();
        if (ag === "/") ag = "";
      }
      setForm((prev) => ({ ...prev, patient_id: patient.patient_id, patient_name: fullPatientName(patient) || patient.patient_id, age_gender: ag, doctor_name: patient.last_doctor || "", department: patient.last_department || "" }));
      void fetchPrescriptionHistory(patient.patient_id);
      setNotice({ type: "success", message: `Patient auto-filled: ${fullPatientName(patient) || patient.patient_id}.` });
      setBannerPatient(patient);
    } catch {
      setNotice({ type: "error", message: "Unable to auto-fill patient details." });
    } finally {
      setLookingUpPatient(false);
    }
  };

  // Inpatient Admission number history auto-fill for discharge summary
  const [admissionQuery, setAdmissionQuery] = useState("");
  const [loadingAdmissionHistory, setLoadingAdmissionHistory] = useState(false);
  const [admissionData, setAdmissionData] = useState<any>(null);

  const autoFillFromAdmissionNumber = async (identifier?: string) => {
    const q = (identifier || admissionQuery || form.admission_id || form.patient_id || "").trim();
    if (!q) {
      setNotice({ type: "warning", message: "Enter an IP Admission Number (e.g. ADM-1) or UHID." });
      return;
    }
    setLoadingAdmissionHistory(true);
    try {
      const data = await apiFetch<any>(`/api/admissions/${encodeURIComponent(q)}/summary-data`);
      setAdmissionData(data);
      setForm((prev) => ({
        ...prev,
        admission_id: data.admission_id,
        patient_id: data.patient_id,
        patient_name: data.patient_name,
        admission_date: data.admission_date_full || data.admission_date,
        discharge_date: data.discharge_date_full || data.discharge_date,
        ward: data.ward,
        bed_no: data.bed_no,
        room_no: data.room_no,
        doctor_name: data.consulting_doctor,
        final_diagnosis: data.final_diagnosis,
        treatment_summary: data.treatment_summary,
        discharge_medicines: data.discharge_medicines,
        follow_up_plan: data.follow_up_plan,
        billing_clearance: data.billing_clearance,
        status: data.status,
      }));
      setNotice({
        type: "success",
        message: `Inpatient clinical history, vitals, and timings auto-filled for ${data.patient_name} (${data.admission_id}).`,
      });
    } catch (err: any) {
      reportError(setNotice, err, "Could not find inpatient admission record.");
    } finally {
      setLoadingAdmissionHistory(false);
    }
  };

  const handleQueueSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const q = queue.find(q => String(q.id) === id);
    if (q) {
      setForm(prev => ({ ...prev, appointment_id: String(q.id), patient_id: q.patient_id, patient_name: q.patient_name, doctor_name: q.doctor_name, department: q.department, age_gender: q.age_gender || "" }));
      void fetchPrescriptionHistory(q.patient_id);
      lookupPatientByUhid(q.patient_id).then(setBannerPatient).catch(() => setBannerPatient(null));
    } else {
      setForm(prev => ({ ...prev, appointment_id: "" }));
      setBannerPatient(null);
    }
  };

  const savePrescription = async (complete_consultation = false) => {
    if (!form.patient_id) { setNotice({ type: "warning", message: "Patient is required." }); return; }
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/prescriptions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Hospital-Code": getHospitalCode() },
        body: JSON.stringify({
          ...form,
          medicines: medicines.map(m => ({ ...m, is_custom: m.is_custom ? true : false, freq_custom: m.freq_custom || "" })),
          complete_consultation,
          save_token: saveToken,
          send_to_pharmacy: sendToPharmacy,
        }),
      });
      if (!res.ok) throw new Error("Failed to save prescription");
      setNotice({ type: "success", message: `Prescription saved${complete_consultation ? " and consultation completed" : ""}.` });
      // Refresh prescription history after saving
      if (form.patient_id) void fetchPrescriptionHistory(form.patient_id);
      // Only rotate save_token when completing the consultation (a new visit).
      // Plain "Save" keeps the SAME token so re-saving updates in place.
      if (complete_consultation) {
        setSaveToken(generateToken());
        setQueue(queue.filter(q => String(q.id) !== form.appointment_id));
        
        const localQueueStr = localStorage.getItem("hospai_op_queue");
        if (localQueueStr) {
          const readmitQueue = JSON.parse(localQueueStr);
          let updated = false;
          const nextReadmitQueue = (Array.isArray(readmitQueue) ? readmitQueue : []).map((item: any) => {
            if (String(item.token) === form.appointment_id) {
              updated = true;
              return { ...item, status: "Completed" };
            }
            return item;
          });
          if (updated) {
            localStorage.setItem("hospai_op_queue", JSON.stringify(nextReadmitQueue));
          }
        }

        setForm({ ...DEFAULTS.prescription });
        setMedicines([]);
        setSendToPharmacy(false);
      }
    } catch (err) {
      setNotice({ type: "error", message: "Failed to save prescription." });
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (view === "prescription") {
      void savePrescription(false);
      return;
    }
    if (view === "discharge-summary" && (!form.admission_id || !admissionData || admissionData.admission_id !== form.admission_id)) {
      setNotice({ type: "warning", message: "Enter a valid IP Admission Number and click \"Auto-Fill History\" before saving -- it's required so billing, ward, and clinical history are drawn from the real admission record." });
      return;
    }
    if (!form.patient_name.trim()) { setNotice({ type: "warning", message: "Patient name is required." }); return; }
    const row = { id: `${Date.now()}`, ...form };
    saveLocal(`hospai_${view}`, row);
    setSavedRows(loadLocal(`hospai_${view}`));
    setNotice({ type: "success", message: `${title} saved successfully.` });
  };



  const buildPdfMarkdown = () => {
    if (view === "prescription") {
      const medsMd = medicines.length > 0 
        ? "| Sl. No. | Drugname | Mor | Aft | Ngt | Comments | Duration |\n|---|---|---|---|---|---|---|\n" + 
          medicines.map((m, i) => {
            if (m.is_custom) {
              const comment = [m.freq_custom, m.instructions].filter(Boolean).join(" | ") || "-";
              return `| ${i+1} | ${m.medicine_name || "-"} | | | | ${comment} | ${m.duration || "-"} |`;
            }
            const parts = (m.frequency || "").split("-").map(p => p.trim());
            const mor = parts[0] || "0";
            const aft = parts[1] || "0";
            const ngt = parts[2] || "0";
            return `| ${i+1} | ${m.medicine_name || "-"} | ${mor} | ${aft} | ${ngt} | ${m.instructions || "-"} | ${m.duration || "-"} |`;
          }).join("\n")
        : "-";
      return [
        "## Patient Details",
        `Patient ID: ${form.patient_id || "-"}`,
        `Patient Name: ${form.patient_name || "-"}`,
        `Doctor: ${form.doctor_name || "-"}`,
        `Department: ${form.department || "-"}`,
        "## Clinical Notes",
        form.diagnosis || "-",
        "## Medicines",
        medsMd,
        "## Investigations / Lab Tests",
        form.lab_tests || "-",
        "## Advice",
        form.advice || "-",
        "## Follow-up",
        `Follow-up Date: ${form.follow_up_date || "-"}`,
      ].join("\n");
    }
    if (view === "discharge-summary") {
      return [
        "## Inpatient Discharge Summary",
        `Admission Number: ${form.admission_id || "-"}`,
        `Patient ID / UHID: ${form.patient_id || "-"}`,
        `Patient Name: ${form.patient_name || "-"}`,
        `Ward / Bed: ${form.ward || "-"} / ${form.bed_no || "-"}`,
        `Attending Consultant: ${form.doctor_name || "-"}`,
        `Admission Date & Time: ${form.admission_date || "-"}`,
        `Discharge Date & Time: ${form.discharge_date || "-"}`,
        `Discharge Status: ${form.status || "-"}`,
        `Total Bill: ₹${Number(admissionData?.total_bill || 0).toLocaleString("en-IN")}`,
        `Amount Paid: ₹${Number(admissionData?.amount_paid || 0).toLocaleString("en-IN")}`,
        `Amount Due: ₹${Number(admissionData?.amount_due || 0).toLocaleString("en-IN")}`,
        `Billing Clearance: ${form.billing_clearance || "-"}`,
        "## Final Clinical Diagnosis",
        form.final_diagnosis || "-",
        "## Inpatient Treatment & Vitals History (With Exact Timings)",
        form.treatment_summary || "-",
        "## Discharge Medications",
        form.discharge_medicines || "-",
        "## Follow-up & Review Instructions",
        form.follow_up_plan || "-",
      ].join("\n");
    }
    return Object.entries(form).map(([key, value]) => `${key.replace(/_/g, " ")}: ${value || "-"}`).join("\n");
  };

  const downloadPdf = async () => {
    if (view === "discharge-summary" && (!form.admission_id || !admissionData || admissionData.admission_id !== form.admission_id)) {
      setNotice({ type: "warning", message: "Enter a valid IP Admission Number and click \"Auto-Fill History\" before printing -- it's required so billing, ward, and clinical history are drawn from the real admission record." });
      return;
    }
    if (!form.patient_name.trim()) {
      setNotice({ type: "warning", message: "Patient name is required before PDF download." });
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/export/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Hospital-Code": getHospitalCode() },
        body: JSON.stringify({
          patient_name: form.patient_name || form.patient_id || "Patient",
          doc_type: view,
          ocr_text: buildPdfMarkdown(),
        }),
      });
      if (!response.ok) throw new Error("Unable to generate PDF.");
      const blob = await response.blob();
      downloadExportBlob(blob, `${form.patient_id || view}-${view}.pdf`);
      setNotice({ type: "success", message: `${title} PDF downloaded.` });
    } catch {
      setNotice({ type: "error", message: "Unable to generate PDF download." });
    }
  };

  const getPrescriptionHtml = () => {
    const pid = form.patient_id || "-";
    const patientName = form.patient_name || "-";
    const printDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
    const doctorName = form.doctor_name || "-";
    
    const medsRows = medicines.map((m, i) => {
      const drugNameHtml = m.dosage
        ? `<b>${m.medicine_name || "-"}</b><br/><i style="font-weight:normal;">(${m.dosage})</i>`
        : `<b>${m.medicine_name || "-"}</b>`;
      const durationVal = m.duration ? `(${m.duration})` : "-";

      if (m.is_custom) {
        return `
        <tr>
          <td style="text-align:center; font-weight:bold;">${i+1})</td>
          <td>${drugNameHtml}</td>
          <td colspan="3" style="text-align:center;">${m.freq_custom || "-"}</td>
          <td>${m.instructions || "-"}</td>
          <td style="text-align:center;">${durationVal}</td>
        </tr>`;
      }

      const parts = (m.frequency || "").split("-").map(p => p.trim());
      const mor = parts[0] || "";
      const aft = parts[1] || "";
      const ngt = parts[2] || "";
      return `
      <tr>
        <td style="text-align:center; font-weight:bold;">${i+1})</td>
        <td>${drugNameHtml}</td>
        <td style="text-align:center;">${mor}</td>
        <td style="text-align:center;">${aft}</td>
        <td style="text-align:center;">${ngt}</td>
        <td>${m.instructions || ""}</td>
        <td style="text-align:center;">${durationVal}</td>
      </tr>
    `}).join("");



    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Prescription Preview</title>
</head>
<body style="margin: 0; padding: 0; display: flex; flex-direction: column;">
      <div class="rx-print-wrap" data-hospai-shared-print-shell>
        <style>
          @page { margin: 0; }
          .rx-print-wrap { font-family: Arial, sans-serif; color: #111; position: relative; padding: 15mm 15mm 35mm 15mm; box-sizing: border-box; background: #fff; }
          
          /* Header */
          .rx-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #ddd; padding-bottom: 10px; margin-bottom: 15px; }
          .rx-header-left { color: #274384; }
          .rx-header-left h1 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; }
          .rx-header-left .doc-name { font-weight: 800; font-size: 15px; margin-top: 5px; color: #1e3a8a; }
          .rx-header-left .doc-qual { font-size: 12px; margin-top: 2px; }
          .rx-logo { width: 90px; object-fit: contain; }

          /* Patient Info */
          .rx-patient-info { font-size: 13px; line-height: 2; margin-bottom: 10px; }
          .rx-pi-row { display: flex; justify-content: flex-end; margin-bottom: 6px; }
          .rx-pi-row.full { justify-content: space-between; }
          .rx-line-fill { border-bottom: 1px solid #777; display: inline-block; padding-left: 5px; }
          
          .rx-symbol { height: 50px; width: 65px; margin: 15px 0 25px 0; display: block; object-fit: contain; }

          
          /* Table */
          .rx-content-area { position: relative; z-index: 1; }
            .rx-watermark { position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%); opacity: 0.10; width: 55%; z-index: 0; pointer-events: none; }
          .rx-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px; }
          .rx-table th, .rx-table td { padding: 8px 5px; border-bottom: 1px dashed #ccc; text-align: left; vertical-align: middle; }
          .rx-table th { font-weight: bold; border-bottom: 2px solid #aaa; }
          .rx-table th.center, .rx-table td.center { text-align: center; }
          
          .rx-advice { font-size: 13px; margin-bottom: 25px; line-height: 1.8; }
          .rx-advice h4 { font-size: 14px; font-weight: bold; margin: 0 0 8px 0; }
          .rx-advice p { margin: 4px 0 4px 10px; }
          
          .rx-bottom-container { position: absolute; bottom: 35mm; left: 15mm; right: 15mm; display: flex; justify-content: flex-end; }
          .rx-sig-block { text-align: right; padding-right: 15px; font-size: 13px; font-weight: bold; width: 280px; border-top: 1px solid #111; padding-top: 5px; color: #274384; }
          
          /* Footer */
          .rx-footer { position: fixed; left: 0; right: 0; bottom: 0; height: 30mm; background: #fff; padding: 5mm 15mm; display: flex; justify-content: space-between; align-items: flex-end; color: #274384; font-size: 11px; z-index: 9999; }
          .rx-footer-left { display: flex; align-items: center; gap: 15px; }
          .rx-footer-list { list-style: disc; margin: 0; padding-left: 20px; line-height: 1.6; font-weight: 600; }
          .rx-footer-icon { font-size: 36px; color: #274384; display: flex; align-items: center; justify-content: center; background: #e0e7ff; border-radius: 8px; padding: 8px; }
          .rx-footer-right { border-left: 2px solid #274384; padding-left: 15px; line-height: 1.5; font-weight: 600; max-width: 55%; }
          .rx-footer-right .contact-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
        </style>
        

        
        <div class="rx-header">
          <div class="rx-header-left">
            <h1>AYU POLYCLINIC</h1>
            <div class="doc-name">Dr. Sushanth. B</div>
            <div class="doc-qual">MBBS (Gandhi), (FCCM)</div>
            <div class="doc-qual">TSMC/FM/27444</div>
          </div>
          <img src="${PRINT_EMBLEM_DATA_URI}" class="rx-logo" />
          </div>
          
          <div class="rx-content-area">
            <img src="${PRINT_WATERMARK_DATA_URI}" class="rx-watermark" />
          <div class="rx-patient-info">
            <div class="rx-pi-row">
              <div style="width: 250px; display:flex;">Date:&nbsp;<span class="rx-line-fill" style="flex:1;">${printDate}</span></div>
            </div>
            <div class="rx-pi-row full">
              <div style="flex: 1; display:flex; padding-right: 30px;">Patient Name:&nbsp;<span class="rx-line-fill" style="flex:1;">${patientName}</span></div>
            </div>
            <div class="rx-pi-row full">
              <div style="flex: 1; display:flex; padding-right: 30px;">Address:&nbsp;<span class="rx-line-fill" style="flex:1;"></span></div>
              <div style="width: 150px; display:flex;">Age:&nbsp;<span class="rx-line-fill" style="flex:1;">${form.age_gender || "-"}</span></div>
            </div>
            <div class="rx-pi-row full">
              <div style="flex: 1; display:flex;">Diagnosis:&nbsp;<span class="rx-line-fill" style="flex:1;">${form.diagnosis || ""}</span></div>
            </div>
          </div>
          
          <img class="rx-symbol" src="${PRINT_RX_SYMBOL_DATA_URI}" alt="Rx" />
          
          ${medicines.length > 0 || (false) ? `
          <table class="rx-table">
            <thead>
              <tr>
                <th style="width: 5%;" class="center">#</th>
                <th style="width: 35%;">Medicine</th>
                <th style="width: 15%;" class="center">Frequency</th>
                <th style="width: 30%;">Instructions</th>
                <th style="width: 15%;" class="center">Duration</th>
              </tr>
            </thead>
            <tbody>
              ${medsRows}
            </tbody>
          </table>
          ` : ""}
          
          <div class="rx-advice">
            ${(form.advice) ? `<h4>Advice :</h4>${(form.advice).split('\n').filter(Boolean).map(line => `<p>${line}</p>`).join('')}` : ""}
            ${(form.follow_up_date) ? `<h4>Next Review:</h4><p>${form.follow_up_date}</p>` : ""}
          </div>
        </div>
        
        <div class="rx-bottom-container">
          <div class="rx-sig-block">SIGNATURE</div>
        </div>
        
        <footer class="rx-footer">
          <div class="rx-footer-left">
            <ul class="rx-footer-list">
              <li>24/7 Emergency</li>
              <li>Ambulance Service</li>
              <li>Home Care Service Available</li>
            </ul>
            <div class="rx-footer-icon">🚑</div>
          </div>
          <div class="rx-footer-right">
            <div class="contact-row">
              <span style="font-size: 14px;">📍</span> 
              <span>GGF2+2F8, Old Alwal Road, Jonnabanda, Chetana Housing Colony, Brundavan Colony, Bolaram - 500010, Hyderabad.</span>
            </div>
            <div class="contact-row">
              <span style="font-size: 14px;">📞</span> <span>+91 6303346810</span> &nbsp;&nbsp;&nbsp; 
              <span style="font-size: 14px;">✉️</span> <span>dr.sushanth108@gmail.com</span>
            </div>
          </div>
        </footer>
      </div>
</body>
</html>
    `;
    return html;
  };

  const handlePrintPrescription = () => {
    printViaIframe(getPrescriptionHtml(), `Doctor_Prescription_${form.patient_id || "-"}`);
  };

  const getHistoryPrescriptionHtml = (rx: any) => {
    const pid = rx.patient_id || form.patient_id || "-";
    const patientName = form.patient_name || "-";
    const printDate = rx.created_at
      ? new Date(rx.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "-";
    const doctorName = rx.doctor_name || "-";
    const rxMeds = rx.medicines || [];

    const medsRows = rxMeds.map((m: any, i: number) => {
      const drugNameHtml = m.dosage
        ? `<b>${m.medicine_name || "-"}</b><br/><i style="font-weight:normal;">(${m.dosage})</i>`
        : `<b>${m.medicine_name || "-"}</b>`;
      const durationVal = m.duration ? `(${m.duration})` : "-";
      if (m.is_custom) {
        return `
        <tr>
          <td style="text-align:center; font-weight:bold;">${i+1})</td>
          <td>${drugNameHtml}</td>
          <td colspan="3" style="text-align:center;">${m.freq_custom || "-"}</td>
          <td>${m.instructions || "-"}</td>
          <td style="text-align:center;">${durationVal}</td>
        </tr>`;
      }
      
      const parts = (m.frequency || "").split("-").map((p: string) => p.trim());
      const mor = parts[0] || "";
      const aft = parts[1] || "";
      const ngt = parts[2] || "";
      return `
      <tr>
        <td style="text-align:center; font-weight:bold;">${i+1})</td>
        <td>${drugNameHtml}</td>
        <td style="text-align:center;">${mor}</td>
        <td style="text-align:center;">${aft}</td>
        <td style="text-align:center;">${ngt}</td>
        <td>${m.instructions || ""}</td>
        <td style="text-align:center;">${durationVal}</td>
      </tr>
      `;
    }).join("");



    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Prescription Preview</title>
</head>
<body style="margin: 0; padding: 0; display: flex; flex-direction: column;">
      <div class="rx-print-wrap" data-hospai-shared-print-shell>
        <style>
          @page { margin: 0; }
          .rx-print-wrap { font-family: Arial, sans-serif; color: #111; position: relative; padding: 15mm 15mm 35mm 15mm; box-sizing: border-box; background: #fff; }
          
          /* Header */
          .rx-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #ddd; padding-bottom: 10px; margin-bottom: 15px; }
          .rx-header-left { color: #274384; }
          .rx-header-left h1 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; }
          .rx-header-left .doc-name { font-weight: 800; font-size: 15px; margin-top: 5px; color: #1e3a8a; }
          .rx-header-left .doc-qual { font-size: 12px; margin-top: 2px; }
          .rx-logo { width: 90px; object-fit: contain; }

          /* Patient Info */
          .rx-patient-info { font-size: 13px; line-height: 2; margin-bottom: 10px; }
          .rx-pi-row { display: flex; justify-content: flex-end; margin-bottom: 6px; }
          .rx-pi-row.full { justify-content: space-between; }
          .rx-line-fill { border-bottom: 1px solid #777; display: inline-block; padding-left: 5px; }
          
          .rx-symbol { height: 50px; width: 65px; margin: 15px 0 25px 0; display: block; object-fit: contain; }

          
          /* Table */
          .rx-content-area { position: relative; z-index: 1; }
            .rx-watermark { position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%); opacity: 0.10; width: 55%; z-index: 0; pointer-events: none; }
          .rx-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px; }
          .rx-table th, .rx-table td { padding: 8px 5px; border-bottom: 1px dashed #ccc; text-align: left; vertical-align: middle; }
          .rx-table th { font-weight: bold; border-bottom: 2px solid #aaa; }
          .rx-table th.center, .rx-table td.center { text-align: center; }
          
          .rx-advice { font-size: 13px; margin-bottom: 25px; line-height: 1.8; }
          .rx-advice h4 { font-size: 14px; font-weight: bold; margin: 0 0 8px 0; }
          .rx-advice p { margin: 4px 0 4px 10px; }
          
          .rx-bottom-container { position: absolute; bottom: 35mm; left: 15mm; right: 15mm; display: flex; justify-content: flex-end; }
          .rx-sig-block { text-align: right; padding-right: 15px; font-size: 13px; font-weight: bold; width: 280px; border-top: 1px solid #111; padding-top: 5px; color: #274384; }
          
          /* Footer */
          .rx-footer { position: fixed; left: 0; right: 0; bottom: 0; height: 30mm; background: #fff; padding: 5mm 15mm; display: flex; justify-content: space-between; align-items: flex-end; color: #274384; font-size: 11px; z-index: 9999; }
          .rx-footer-left { display: flex; align-items: center; gap: 15px; }
          .rx-footer-list { list-style: disc; margin: 0; padding-left: 20px; line-height: 1.6; font-weight: 600; }
          .rx-footer-icon { font-size: 36px; color: #274384; display: flex; align-items: center; justify-content: center; background: #e0e7ff; border-radius: 8px; padding: 8px; }
          .rx-footer-right { border-left: 2px solid #274384; padding-left: 15px; line-height: 1.5; font-weight: 600; max-width: 55%; }
          .rx-footer-right .contact-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
        </style>
        

        
        <div class="rx-header">
          <div class="rx-header-left">
            <h1>AYU POLYCLINIC</h1>
            <div class="doc-name">Dr. Sushanth. B</div>
            <div class="doc-qual">MBBS (Gandhi), (FCCM)</div>
            <div class="doc-qual">TSMC/FM/27444</div>
          </div>
          <img src="${PRINT_EMBLEM_DATA_URI}" class="rx-logo" />
          </div>
          
          <div class="rx-content-area">
            <img src="${PRINT_WATERMARK_DATA_URI}" class="rx-watermark" />
          <div class="rx-patient-info">
            <div class="rx-pi-row">
              <div style="width: 250px; display:flex;">Date:&nbsp;<span class="rx-line-fill" style="flex:1;">${printDate}</span></div>
            </div>
            <div class="rx-pi-row full">
              <div style="flex: 1; display:flex; padding-right: 30px;">Patient Name:&nbsp;<span class="rx-line-fill" style="flex:1;">${patientName}</span></div>
            </div>
            <div class="rx-pi-row full">
              <div style="flex: 1; display:flex; padding-right: 30px;">Address:&nbsp;<span class="rx-line-fill" style="flex:1;"></span></div>
              <div style="width: 150px; display:flex;">Age:&nbsp;<span class="rx-line-fill" style="flex:1;">${rx.age_gender || rx.age_gender || "-"}</span></div>
            </div>
            <div class="rx-pi-row full">
              <div style="flex: 1; display:flex;">Diagnosis:&nbsp;<span class="rx-line-fill" style="flex:1;">${rx.diagnosis || rx.diagnosis || ""}</span></div>
            </div>
          </div>
          
          <img class="rx-symbol" src="${PRINT_RX_SYMBOL_DATA_URI}" alt="Rx" />
          
          ${(rx.medicines && rx.medicines.length > 0) ? `
          <table class="rx-table">
            <thead>
              <tr>
                <th style="width: 5%;" class="center">#</th>
                <th style="width: 35%;">Medicine</th>
                <th style="width: 15%;" class="center">Frequency</th>
                <th style="width: 30%;">Instructions</th>
                <th style="width: 15%;" class="center">Duration</th>
              </tr>
            </thead>
            <tbody>
              ${medsRows}
            </tbody>
          </table>
          ` : ""}
          
          <div class="rx-advice">
            ${(rx.advice || rx.advice) ? `<h4>Advice :</h4>${(rx.advice || rx.advice).split('\n').filter(Boolean).map((line: string) => `<p>${line}</p>`).join('')}` : ""}
            ${(rx.follow_up_date || rx.follow_up_date) ? `<h4>Next Review:</h4><p>${rx.follow_up_date || rx.follow_up_date}</p>` : ""}
          </div>
        </div>
        
        <div class="rx-bottom-container">
          <div class="rx-sig-block">SIGNATURE</div>
        </div>
        
        <footer class="rx-footer">
          <div class="rx-footer-left">
            <ul class="rx-footer-list">
              <li>24/7 Emergency</li>
              <li>Ambulance Service</li>
              <li>Home Care Service Available</li>
            </ul>
            <div class="rx-footer-icon">🚑</div>
          </div>
          <div class="rx-footer-right">
            <div class="contact-row">
              <span style="font-size: 14px;">📍</span> 
              <span>GGF2+2F8, Old Alwal Road, Jonnabanda, Chetana Housing Colony, Brundavan Colony, Bolaram - 500010, Hyderabad.</span>
            </div>
            <div class="contact-row">
              <span style="font-size: 14px;">📞</span> <span>+91 6303346810</span> &nbsp;&nbsp;&nbsp; 
              <span style="font-size: 14px;">✉️</span> <span>dr.sushanth108@gmail.com</span>
            </div>
          </div>
        </footer>
      </div>
</body>
</html>
    `;
    return html;
  };

  const handlePrintHistoryPrescription = (rx: any) => {
    printViaIframe(getHistoryPrescriptionHtml(rx), `Doctor_Prescription_${rx.patient_id || "-"}_${rx.id}`);
  };

  return (
    <section className="module-page">
      {view === "prescription" && (
        <div className="module-unified-topbar">
          <div className="module-topbar-breadcrumb-row">
            <div className="module-topbar-breadcrumb">
              <span className="breadcrumb-root" onClick={() => window.history.back()}>Ayu Polyclinic</span>
              <span className="breadcrumb-sep">/</span>
              <span>OP Management</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-active">Doctor Prescription</span>
            </div>
          </div>
          <div className="module-topbar-heading-row">
            <div className="module-topbar-titles">
              <h2>Doctor Prescription</h2>
              <p className="muted">Create branded prescriptions with medicines, lab tests, advice, and follow-up.</p>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "row", gap: "2rem", flexWrap: "wrap", alignItems: "flex-start" }}>
      <div className="panel registration-desk-panel" style={{ flex: "1 1 600px", maxWidth: view === "prescription" ? "100%" : undefined }}>

        {view === "prescription" && (<>
          <div style={{ marginBottom: "1rem" }}>
            <PatientSearchPicker
              placeholder="Or search by patient name / phone (for a patient not currently in the queue)"
              onSelect={(patient) => {
                let ag = "";
                if (patient.age || patient.gender) {
                  ag = `${patient.age || ""} / ${patient.gender || ""}`.trim();
                  if (ag === "/") ag = "";
                }
                setForm((prev) => ({ ...prev, patient_id: patient.patient_id, patient_name: fullPatientName(patient) || patient.patient_id, age_gender: ag }));
                setBannerPatient(patient);
                void fetchPrescriptionHistory(patient.patient_id);
              }}
            />
          </div>

          {/* Row 1: Patient Identity details */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", alignItems: "end", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
            <Label style={{ margin: 0 }}>Patient in Consultation ({queue.length})
              <Select style={{ width: "100%" }} value={form.appointment_id || ""} onChange={handleQueueSelect}>
                <option value="">Select patient...</option>
                {queue.map(q => <option key={q.id} value={q.id}>{q.patient_id} - {q.patient_name} | {q.age_gender || "-"}</option>)}
              </Select>
            </Label>
            <Label style={{ margin: 0 }}>Patient ID
              <Input style={{ width: "100%" }} value={form.patient_id || ""} onChange={(e) => update("patient_id", e.target.value)} onBlur={(e) => void fillPatientFromUhid(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void fillPatientFromUhid((e.currentTarget as HTMLInputElement).value); } }} placeholder="UHID" />
            </Label>
            <Label style={{ margin: 0 }}>Name
              <Input style={{ width: "100%", background: "var(--bg-muted)" }} value={form.patient_name || ""} onChange={(e) => update("patient_name", e.target.value)} placeholder="Patient name" readOnly />
            </Label>
            <Label style={{ margin: 0 }}>Age/Gender
              <Input style={{ width: "100%", background: "var(--bg-muted)" }} value={form.age_gender || ""} readOnly />
            </Label>
          </div>

          {bannerPatient && (
            <div style={{ marginBottom: "1rem" }}>
              <PatientIdentityBanner patient={bannerPatient} />
            </div>
          )}

          {/* Row 2: Diagnosis */}
          <div style={{ marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
            <Label style={{ margin: 0, display: "block", width: "100%" }}>Diagnosis
              <Textarea style={{ width: "100%", boxSizing: "border-box" }} value={form.diagnosis || ""} onChange={(e) => update("diagnosis", e.target.value)} placeholder="Diagnosis / clinical impression" />
            </Label>
          </div>



          {/* Medicine Table */}
          <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-card)", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "0.75rem" }}>
              <Button type="button" variant="primary" onClick={() => setMedicines([...medicines, { medicine_name: "", dosage: "", frequency: "", freq_options: [], duration: "", instructions: "" }])}>+ Add Medicine</Button>
            </div>
            
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", textAlign: "left", minWidth: "700px" }}>
                <thead>
                  <tr>
                    <th style={{ width: "5%", textAlign: "center" }}>Sl. No.</th>
                    <th style={{ width: "30%" }}>Drugname</th>
                    <th style={{ width: "20%", textAlign: "center" }}>Frequency (Mor-Aft-Ngt)</th>
                    <th style={{ width: "25%" }}>Comments</th>
                    <th style={{ width: "15%", textAlign: "center" }}>Duration</th>
                    <th style={{ width: "5%", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {medicines.map((med, i) => {
                    const isCustom = !!med.is_custom;
                    const freqParts = (med.frequency || "").split("-");
                    const slot1 = freqParts[0] || "";
                    const slot2 = freqParts[1] || "";
                    const slot3 = freqParts[2] || "";
                    const updateFreqSlot = (slotIndex: number, value: string) => {
                      const digit = value.replace(/[^0-1]/g, "").slice(-1);
                      const p = [slot1, slot2, slot3];
                      p[slotIndex] = digit;
                      setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, frequency: p.join("-") } : m));
                    };
                    const handleFreqKeyDown = (slotIndex: number, e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const nextId = `freq-${i}-${slotIndex + 1}`;
                        const nextInput = document.getElementById(nextId) as HTMLInputElement | null;
                        if (nextInput) { nextInput.focus(); nextInput.select(); }
                        else {
                          const dur = (e.currentTarget as HTMLElement)?.closest("tr")?.querySelector<HTMLInputElement>('input[placeholder="Days"]');
                          if (dur) { dur.focus(); dur.select(); }
                        }
                      } else if (e.key === "Backspace" && !(e.currentTarget as HTMLInputElement).value && slotIndex > 0) {
                        e.preventDefault();
                        const prevInput = document.getElementById(`freq-${i}-${slotIndex - 1}`) as HTMLInputElement | null;
                        if (prevInput) { prevInput.focus(); prevInput.select(); }
                      }
                    };
                    const handleFreqChange = (slotIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
                      const digit = e.target.value.replace(/[^0-1]/g, "").slice(-1);
                      updateFreqSlot(slotIndex, digit);
                      if (digit && slotIndex < 2) {
                        setTimeout(() => {
                          const next = document.getElementById(`freq-${i}-${slotIndex + 1}`) as HTMLInputElement | null;
                          if (next) { next.focus(); next.select(); }
                        }, 0);
                      }
                    };
                    const freqSlotStyle: React.CSSProperties = { width: "32px", textAlign: "center", padding: "6px 2px", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "0.95rem", fontWeight: "bold", background: "var(--bg-card)" };
                    const toggleCustom = () => setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, is_custom: !m.is_custom, freq_custom: m.freq_custom || "" } : m));
                    const cellPad: React.CSSProperties = { verticalAlign: "top", paddingTop: "12px", paddingBottom: "12px" };

                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ ...cellPad, fontWeight: "bold", textAlign: "center" }}>{i + 1})</td>
                        <td style={cellPad}><Input style={{ width: "100%", boxSizing: "border-box" }} value={med.medicine_name} onChange={(e) => setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, medicine_name: e.target.value } : m))} placeholder="Medicine name" /></td>

                        {isCustom ? (
                          <td style={cellPad}>
                            <Input value={med.freq_custom || ""} onChange={(e) => setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, freq_custom: e.target.value } : m))} placeholder="e.g. Weekly once, Alternate days" style={{ fontSize: "0.85rem", width: "100%", boxSizing: "border-box" }} />
                            <button type="button" onClick={toggleCustom} style={{ display: "block", marginTop: "4px", fontSize: "0.75rem", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", margin: "4px auto 0 auto" }}>↩ Switch to Daily</button>
                          </td>
                        ) : (
                          <td style={{ ...cellPad, textAlign: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                              <input id={`freq-${i}-0`} type="text" inputMode="numeric" value={slot1} onChange={(e) => handleFreqChange(0, e)} onKeyDown={(e) => handleFreqKeyDown(0, e)} placeholder="0" maxLength={1} style={freqSlotStyle} />
                              <span style={{ color: "#aaa", fontWeight: "bold" }}>-</span>
                              <input id={`freq-${i}-1`} type="text" inputMode="numeric" value={slot2} onChange={(e) => handleFreqChange(1, e)} onKeyDown={(e) => handleFreqKeyDown(1, e)} placeholder="0" maxLength={1} style={freqSlotStyle} />
                              <span style={{ color: "#aaa", fontWeight: "bold" }}>-</span>
                              <input id={`freq-${i}-2`} type="text" inputMode="numeric" value={slot3} onChange={(e) => handleFreqChange(2, e)} onKeyDown={(e) => handleFreqKeyDown(2, e)} placeholder="0" maxLength={1} style={freqSlotStyle} />
                            </div>
                            <button type="button" onClick={toggleCustom} style={{ display: "block", marginTop: "6px", fontSize: "0.75rem", color: "#888", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", margin: "6px auto 0 auto" }}>Custom</button>
                          </td>
                        )}

                        <td style={cellPad}><Input style={{ width: "100%", boxSizing: "border-box" }} value={med.instructions} onChange={(e) => setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, instructions: e.target.value } : m))} placeholder="Comments" /></td>
                        <td style={{ ...cellPad, textAlign: "center" }}><Input style={{ width: "100%", boxSizing: "border-box", textAlign: "center" }} value={med.duration} onChange={(e) => setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, duration: e.target.value } : m))} placeholder="Days" /></td>
                        <td style={{ ...cellPad, textAlign: "center" }}>
                          <Button type="button" variant="ghost" style={{ color: "var(--danger)", padding: "4px 8px", minWidth: "auto", fontWeight: "bold" }} onClick={() => setMedicines(prev => prev.filter((_, idx) => idx !== i))} title="Remove Medicine">&#10006;</Button>
                        </td>
                      </tr>
                    );
                  })}
                  {medicines.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>No medicines added yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Advice - full width */}
          <div style={{ marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
            <Label style={{ margin: 0, display: "block", width: "100%" }}>Advice
              <Textarea style={{ width: "100%", boxSizing: "border-box" }} value={form.advice || ""} onChange={(e) => update("advice", e.target.value)} placeholder="Advice" rows={4} />
            </Label>
          </div>

          {/* Row: Next Review Date + Tests to be taken */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", alignItems: "end", marginBottom: "1rem" }}>
            <Label style={{ margin: 0 }}>Next Review Date
              <Input style={{ width: "100%" }} type="date" value={form.follow_up_date || ""} onChange={(e) => update("follow_up_date", e.target.value)} />
            </Label>
            <Label style={{ margin: 0 }}>Tests to be taken for next visit
              <Input style={{ width: "100%" }} value={form.lab_tests || ""} onChange={(e) => update("lab_tests", e.target.value)} placeholder="e.g., GLUCOMETER READINGS" />
            </Label>
          </div>
        </>)}

        {view === "discharge-summary" && (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "10px", padding: "16px 20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <strong style={{ color: "#166534", fontSize: "15px", display: "block" }}>
                  Auto-Fill History from IP Admission Number
                </strong>
                <span style={{ fontSize: "12.5px", color: "#64748b" }}>
                  Enter IP Admission ID (e.g. ADM-1 or 1) or Patient UHID to auto-fill all history, treatments, vitals, and timings.
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <Input
                  value={admissionQuery}
                  onChange={(e) => setAdmissionQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void autoFillFromAdmissionNumber(e.currentTarget.value); } }}
                  placeholder="Enter ADM-1 or UHID..."
                  style={{ width: "220px", height: "38px" }}
                />
                <Button
                  type="button"
                  variant="primary"
                  disabled={loadingAdmissionHistory || !admissionQuery.trim()}
                  onClick={() => void autoFillFromAdmissionNumber()}
                  style={{ background: "#00828a", borderColor: "#00828a", height: "38px", fontWeight: 700 }}
                >
                  {loadingAdmissionHistory ? "Loading History…" : "Auto-Fill History"}
                </Button>
              </div>
            </div>

            {admissionData && (
              <>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12.5px", color: "#166534", background: "#ffffff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bbf7d0", marginTop: "12px" }}>
                  <span><strong>Admission ID:</strong> {admissionData.admission_id}</span>
                  <span><strong>Patient:</strong> {admissionData.patient_name} ({admissionData.patient_id})</span>
                  <span><strong>Stay Duration:</strong> {admissionData.days_stayed} Day(s) ({admissionData.hours_stayed} hrs)</span>
                  <span><strong>Ward / Bed:</strong> {admissionData.ward} · {admissionData.bed_no}</span>
                  <span><strong>Attending Doctor:</strong> {admissionData.consulting_doctor}</span>
                </div>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12.5px", background: "#ffffff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bbf7d0", marginTop: "8px" }}>
                  <span style={{ color: "#166534" }}><strong>Total Bill:</strong> ₹{Number(admissionData.total_bill || 0).toLocaleString("en-IN")}</span>
                  <span style={{ color: "#166534" }}><strong>Paid:</strong> ₹{Number(admissionData.amount_paid || 0).toLocaleString("en-IN")}</span>
                  <span style={{ color: Number(admissionData.amount_due || 0) > 0 ? "#b91c1c" : "#166534" }}>
                    <strong>Due:</strong> ₹{Number(admissionData.amount_due || 0).toLocaleString("en-IN")}
                  </span>
                  {Number(admissionData.amount_due || 0) > 0 && (
                    <span style={{ color: "#b91c1c", fontWeight: 700 }}>⚠ Outstanding balance -- billing is not cleared</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {view !== "prescription" && (
          <div className="grid-form patient-grid-form">
            <Label>UHID / Last 4 Digits<Input value={form.patient_id || ""} onChange={(e) => update("patient_id", e.target.value)} onBlur={(e) => void fillPatientFromUhid(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void fillPatientFromUhid((e.currentTarget as HTMLInputElement).value); } }} placeholder="Enter 1001 or PAT-YYYYMMDD-1001" /></Label>
            <Label>Patient Name<Input value={form.patient_name || ""} onChange={(e) => update("patient_name", e.target.value)} placeholder="Patient name" readOnly /></Label>

          {view === "ip-admission" && (<>
            <Label>Admission Type<Select value={form.admission_type} onChange={(e) => update("admission_type", e.target.value)}><option value="planned">Planned</option><option value="emergency">Emergency</option><option value="transfer">Transfer</option></Select></Label>
            <Label>Consultant<Input value={form.consultant} onChange={(e) => update("consultant", e.target.value)} placeholder="Consultant name" /></Label>
            <Label>Ward<Select value={form.ward} onChange={(e) => update("ward", e.target.value)}><option value="">Select ward</option><option value="General Ward">General Ward</option><option value="Semi Private">Semi Private</option><option value="Private Room">Private Room</option><option value="ICU">ICU</option><option value="NICU">NICU</option></Select></Label>
            <Label>Room No<Input value={form.room_no} onChange={(e) => update("room_no", e.target.value)} placeholder="Room number" /></Label>
            <Label>Bed No<Input value={form.bed_no} onChange={(e) => update("bed_no", e.target.value)} placeholder="Bed number" /></Label>
            <Label>Deposit Amount<Input type="number" value={form.deposit_amount} onChange={(e) => update("deposit_amount", e.target.value)} placeholder="0" /></Label>
            <Label>Insurance Status<Select value={form.insurance_status} onChange={(e) => update("insurance_status", e.target.value)}><option value="not_required">Not Required</option><option value="pending">Pending</option><option value="approved">Approved</option></Select></Label>
            <Label className="span-2">Diagnosis / Admission Notes<Textarea value={form.diagnosis} onChange={(e) => update("diagnosis", e.target.value)} placeholder="Diagnosis / admission notes" /></Label>
          </>)}
          {view === "nurse-station" && (<>
            <Label>BP<Input value={form.bp} onChange={(e) => { const v = e.target.value.replace(/[^0-9/]/g, ""); update("bp", v); }} placeholder="e.g., 120/80" /></Label><Label>Temperature<Input value={form.temperature} onChange={(e) => update("temperature", filterDecimal(e.target.value))} placeholder="e.g., 98.6" /></Label><Label>Pulse<Input value={form.pulse} onChange={(e) => update("pulse", filterInteger(e.target.value))} placeholder="e.g., 72" /></Label><Label>SPO2<Input value={form.spo2} onChange={(e) => update("spo2", filterDecimal(e.target.value))} placeholder="e.g., 98" /></Label>
            <Label>Medicine Given<Input value={form.medicine_given} onChange={(e) => update("medicine_given", e.target.value)} placeholder="Medicine given" /></Label><Label>Shift<Select value={form.shift} onChange={(e) => update("shift", e.target.value)}><option value="morning">Morning</option><option value="evening">Evening</option><option value="night">Night</option></Select></Label>
            <Label>Nurse Name<Input value={form.nurse_name} onChange={(e) => update("nurse_name", e.target.value)} placeholder="Nurse name" /></Label><Label className="span-2">Shift Notes<Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Shift notes" /></Label>
          </>)}
          {view === "discharge-summary" && (<>
            <Label>IP Admission Number <span style={{ color: "#dc2626" }}>*</span><Input value={form.admission_id || ""} onChange={(e) => update("admission_id", e.target.value)} onBlur={(e) => void autoFillFromAdmissionNumber(e.target.value)} placeholder="e.g. ADM-1 or 1 (required)" /></Label>
            <Label>Attending Consultant<Input value={form.doctor_name || ""} onChange={(e) => update("doctor_name", e.target.value)} placeholder="Consultant Doctor" /></Label>
            <Label>Ward / Bed<Input value={form.ward ? `${form.ward} / Bed ${form.bed_no || "-"}` : ""} onChange={(e) => update("ward", e.target.value)} placeholder="Ward / Bed" /></Label>
            <Label>Admission Date & Timing<Input value={form.admission_date || ""} onChange={(e) => update("admission_date", e.target.value)} placeholder="YYYY-MM-DD HH:MM" /></Label>
            <Label>Discharge Date & Timing<Input value={form.discharge_date || ""} onChange={(e) => update("discharge_date", e.target.value)} placeholder="YYYY-MM-DD HH:MM" /></Label>
            <Label>Billing Clearance<Select value={form.billing_clearance || "pending"} onChange={(e) => update("billing_clearance", e.target.value)}><option value="pending">Pending Settlement</option><option value="cleared">Cleared / Settle Folio</option></Select></Label>
            <Label>Discharge Status<Select value={form.status || "draft"} onChange={(e) => update("status", e.target.value)}><option value="draft">Draft Summary</option><option value="final">Final Validated Summary</option></Select></Label>
            <Label className="span-2">Final Clinical Diagnosis<Textarea rows={2} value={form.final_diagnosis || ""} onChange={(e) => update("final_diagnosis", e.target.value)} placeholder="Primary diagnosis and ICD-10 codification" /></Label>
            <Label className="span-2">Inpatient Clinical Treatment & Vitals History (With Exact Timings)<Textarea rows={6} value={form.treatment_summary || ""} onChange={(e) => update("treatment_summary", e.target.value)} placeholder="Admission course, vitals history, treatments, procedures with timings" /></Label>
            <Label className="span-2">Discharge Medications & Dosage Advice<Textarea rows={4} value={form.discharge_medicines || ""} onChange={(e) => update("discharge_medicines", e.target.value)} placeholder="List of discharge medicines, dosage, and duration" /></Label>
            <Label className="span-2">Follow-up Instructions & Emergency Red Flags<Textarea rows={3} value={form.follow_up_plan || ""} onChange={(e) => update("follow_up_plan", e.target.value)} placeholder="Review schedule, dietary instructions, and emergency contact" /></Label>
          </>)}
          </div>
        )}
        
        {lookingUpPatient && <p className="muted">Auto-filling patient details...</p>}
        {view === "ip-admission" && <p className="muted">Deposit preview: ₹{amount.toLocaleString("en-IN")}</p>}

        {view === "prescription" && (
          <label className="ui-inline-checkbox">
            <input type="checkbox" checked={sendToPharmacy} onChange={(e) => setSendToPharmacy(e.target.checked)} style={{ width: 18, height: 18 }} />
            Send to Pharmacy electronically (optional — the patient can always take a paper prescription to Pharmacy instead)
          </label>
        )}

        {view === "prescription" && form.patient_id && (
          <div className="panel" style={{ marginTop: "1rem", padding: "1rem" }}>
            <h4 style={{ marginTop: 0 }}>Or attach a photo/scan of a handwritten prescription</h4>
            <p className="muted" style={{ marginTop: 0 }}>No typing required — saved to the patient record and viewable by Pharmacy as an image/PDF.</p>
            <DocumentUploadDropzone accept="image/*,.pdf" file={scanFile || undefined} onFileSelect={setScanFile} helperText="Image or PDF, max 10MB" />
            <Button type="button" variant="secondary" disabled={!scanFile || uploadingScan} onClick={uploadPrescriptionScan} style={{ marginTop: "0.75rem" }}>
              {uploadingScan ? "Uploading..." : "Upload Prescription Scan"}
            </Button>
          </div>
        )}

        <div className="form-actions" style={{ marginTop: "1.5rem" }}>
          {view === "prescription" ? (<>
            <Button type="button" variant="primary" onClick={() => { handlePrintPrescription(); }} style={{ background: "#e8612d", borderColor: "#e8612d" }}>
              🖨 Print Prescription
            </Button>
            <Button type="button" variant="secondary" onClick={save} disabled={saving}>{saving ? "Saving\u2026" : "Save Prescription"}</Button>
            <Button type="button" variant="primary" onClick={() => savePrescription(true)} disabled={saving}>{saving ? "Saving\u2026" : "Complete Consultation"}</Button>
            <Button type="button" variant="ghost" onClick={() => { setForm({ ...DEFAULTS.prescription }); setMedicines([{ medicine_name: "", dosage: "", frequency: "", freq_options: [], duration: "", instructions: "" }]); setSaveToken(generateToken()); }}>New Prescription</Button>
          </>) : (<>
            <Button type="button" variant="secondary" onClick={save}>Save</Button>
            <Button type="button" variant="ghost" onClick={() => {
              if (view === "discharge-summary") {
                void downloadPdf();
              } else {
                window.print();
              }
            }}>
              {view === "discharge-summary" ? "Print Prescription" : "Print"}
            </Button>
          </>)}
        </div>

      </div>

      {view === "prescription" && (
        <div className="panel prescription-preview-panel" style={{ flex: "1 1 450px", minWidth: "400px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Prescription Preview</h3>
            <Button type="button" variant="primary" onClick={handlePrintPrescription}>
              🖨 Print Preview
            </Button>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden", background: "#fff", minHeight: "800px" }}>
            <iframe
              srcDoc={getPrescriptionHtml()}
              style={{ flex: 1, width: "100%", border: "none" }}
              title="Prescription Preview"
            />
          </div>
        </div>
      )}
      </div>

      {/* Prescription History Section */}
      {view === "prescription" && form.patient_id && (
        <div className="panel" style={{ flex: "1 1 100%", marginTop: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.2rem" }}>📋</span> Prescription History
              {prescriptionHistory.length > 0 && (
                <span style={{ fontSize: "0.8rem", fontWeight: 500, background: "var(--primary)", color: "#fff", borderRadius: "12px", padding: "2px 10px", marginLeft: "0.25rem" }}>
                  {prescriptionHistory.length}
                </span>
              )}
            </h3>
            <Button type="button" variant="ghost" style={{ fontSize: "0.85rem" }} onClick={() => void fetchPrescriptionHistory(form.patient_id)}>
              ↻ Refresh
            </Button>
          </div>

          {historyLoading && <p className="muted" style={{ textAlign: "center", padding: "1rem" }}>Loading prescription history...</p>}

          {!historyLoading && prescriptionHistory.length === 0 && (
            <p className="muted" style={{ textAlign: "center", padding: "2rem 1rem", fontStyle: "italic" }}>No previous prescriptions found for this patient.</p>
          )}

          {!historyLoading && prescriptionHistory.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {prescriptionHistory.map((rx: any) => {
                const isExpanded = expandedHistoryId === rx.id;
                const rxDate = rx.created_at ? new Date(rx.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
                const rxMeds = rx.medicines || [];
                return (
                  <div key={rx.id} style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden", background: isExpanded ? "var(--bg-card)" : undefined, transition: "background 0.2s" }}>
                    {/* Header row — always visible */}
                    <button
                      type="button"
                      onClick={() => setExpandedHistoryId(isExpanded ? null : rx.id)}
                      style={{
                        display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
                        padding: "0.75rem 1rem", background: "none", border: "none", cursor: "pointer",
                        fontFamily: "inherit", fontSize: "0.9rem", textAlign: "left", gap: "1rem"
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{rxDate}</span>
                      <span style={{ flex: 1, color: "var(--text-muted)", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Dr. {rx.doctor_name || "-"} · {rx.diagnosis ? rx.diagnosis.slice(0, 60) + (rx.diagnosis.length > 60 ? "…" : "") : "No diagnosis"}
                      </span>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        {rxMeds.length} med{rxMeds.length !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontSize: "1rem", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div style={{ padding: "0 1rem 1rem", borderTop: "1px solid var(--border)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 2rem", fontSize: "0.85rem", marginTop: "0.75rem", marginBottom: "0.75rem" }}>
                          <div><strong>Doctor:</strong> {rx.doctor_name || "-"}</div>
                          <div><strong>Department:</strong> {rx.department || "-"}</div>
                          <div style={{ gridColumn: "1 / -1" }}><strong>Diagnosis:</strong> {rx.diagnosis || "-"}</div>
                        </div>

                        {rxMeds.length > 0 && (
                          <div style={{ overflowX: "auto", marginBottom: "0.75rem" }}>
                            <table className="data-table" style={{ width: "100%", fontSize: "0.83rem" }}>
                              <thead>
                                <tr>
                                  <th style={{ width: "40px", textAlign: "center" }}>#</th>
                                  <th>Medicine</th>
                                  <th style={{ width: "60px", textAlign: "center" }}>Dosage</th>
                                  <th style={{ width: "80px", textAlign: "center" }}>Frequency</th>
                                  <th style={{ width: "80px", textAlign: "center" }}>Duration</th>
                                  <th>Instructions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rxMeds.map((m: any, idx: number) => (
                                  <tr key={m.id || idx}>
                                    <td style={{ textAlign: "center" }}>{idx + 1}</td>
                                    <td style={{ fontWeight: 500 }}>{m.medicine_name || "-"}</td>
                                    <td style={{ textAlign: "center" }}>{m.dosage || "-"}</td>
                                    <td style={{ textAlign: "center" }}>{m.frequency || "-"}</td>
                                    <td style={{ textAlign: "center" }}>{m.duration || "-"}</td>
                                    <td>{m.instructions || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {(rx.advice || rx.lab_tests || rx.follow_up_date) && (
                          <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            {rx.advice && <div><strong>Advice:</strong> {rx.advice}</div>}
                            {rx.lab_tests && <div><strong>Lab Tests:</strong> {rx.lab_tests}</div>}
                            {rx.follow_up_date && <div><strong>Follow-up:</strong> {rx.follow_up_date}</div>}
                          </div>
                        )}



                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                          <Button type="button" variant="primary" onClick={() => handlePrintHistoryPrescription(rx)} style={{ background: "#e8612d", borderColor: "#e8612d", fontSize: "0.85rem", padding: "6px 16px" }}>
                            🖨 Print Prescription
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view !== "prescription" && (
        <div className="panel registration-desk-panel">
          <h4>Recent Records</h4>
          {savedRows.length === 0 ? <p className="muted">No records saved yet.</p> : savedRows.map((row) => <p key={row.id} className="muted"><strong>{row.patient_name}</strong> · {row.patient_id || "No UHID"} · {row.status || row.shift || row.billing_clearance || "saved"}</p>)}
        </div>
      )}

      {multipleMatches && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="modal-content" style={{ background: "var(--bg-card)", padding: "2rem", borderRadius: "8px", maxWidth: "400px", width: "100%" }}>
            <h3>Multiple Patients Found</h3>
            <p className="muted">Please select the correct patient from the queue:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
              {multipleMatches.map(q => (
                <Button key={q.id} variant="secondary" onClick={() => {
                  setForm(prev => ({ ...prev, appointment_id: String(q.id), patient_id: q.patient_id, patient_name: q.patient_name, doctor_name: q.doctor_name, department: q.department }));
                  setMultipleMatches(null);
                  setNotice({ type: "success", message: `Selected ${q.patient_name}` });
                  void fetchPrescriptionHistory(q.patient_id);
                }}>
                  {q.patient_name} ({q.patient_id})
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setMultipleMatches(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

