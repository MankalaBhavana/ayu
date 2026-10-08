import { useState, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Modal } from "../components/ui";
import { API_BASE } from "../lib/constants";
import { apiFetch, getHospitalCode, reportError } from "../lib/api";
import { fullPatientName } from "../lib/patientLookup";
import type { Notice, Patient } from "../types";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate?: (pageId: string) => void;
};

type PatientDocument = {
  id: number;
  doc_type: string;
  file_name?: string;
  mime_type?: string;
  created_at: string;
};

export default function DoctorPrescriptionPage({ setNotice, onNavigate }: Props) {
  // Current patient being consulted -- never pre-filled with a fake default.
  const [patient, setPatient] = useState<Patient | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<Patient[] | null>(null);

  // Uploaded handwritten file state -- reflects the actual chosen file, never a fake sample.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedAt, setUploadedAt] = useState<string | null>(null);
  const [prescriptionStatus, setPrescriptionStatus] = useState<"Draft" | "Sent">("Draft");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Real prescription-scan history for this patient, loaded from the backend.
  const [sentList, setSentList] = useState<PatientDocument[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewModalItem, setViewModalItem] = useState<PatientDocument | null>(null);

  const loadDocumentHistory = async (patientId: string) => {
    setLoadingHistory(true);
    try {
      const data = await apiFetch<{ documents?: PatientDocument[] }>(`/api/patients/${encodeURIComponent(patientId)}/documents`);
      setSentList((data.documents || []).filter((d) => d.doc_type === "prescriptions"));
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to load prescription history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const selectPatient = (p: Patient) => {
    setPatient(p);
    setCandidates(null);
    setSearchQuery("");
    void loadDocumentHistory(p.patient_id);
  };

  // Safe candidate-list search: a single unambiguous match auto-fills; more
  // than one always shows a clickable list, never guesses.
  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setNotice({ type: "info", message: "Enter UHID, patient name, or phone to search." });
      return;
    }
    setSearching(true);
    try {
      const data = await apiFetch<{ patients?: Patient[] }>(`/api/patients?q=${encodeURIComponent(q)}`);
      const list = data.patients || [];
      if (list.length === 0) {
        setCandidates([]);
        setNotice({ type: "warning", message: "No matching patients found." });
      } else if (list.length === 1) {
        selectPatient(list[0]);
        setNotice({ type: "success", message: `Patient loaded: ${fullPatientName(list[0]) || list[0].patient_id}.` });
      } else {
        setCandidates(list);
      }
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to search patients.");
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setCandidates(null);
    setPatient(null);
    setSentList([]);
    handleRemoveFile();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setNotice({ type: "warning", message: "File is too large (max 10MB)." });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    setUploadedAt(new Date().toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }));
    setPrescriptionStatus("Draft");
    setNotice({ type: "success", message: `"${file.name}" ready. Send to Pharmacy to upload it.` });
  };

  const handleRemoveFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadedAt(null);
    setPrescriptionStatus("Draft");
  };

  const handleSaveDraft = () => {
    if (!selectedFile) {
      setNotice({ type: "warning", message: "Choose a file first." });
      return;
    }
    setNotice({ type: "info", message: "Kept locally. It will not be visible to Pharmacy until you press Send To Pharmacy." });
  };

  const handleSendToPharmacy = async () => {
    if (!patient) {
      setNotice({ type: "warning", message: "Select a patient first." });
      return;
    }
    if (!selectedFile) {
      setNotice({ type: "warning", message: "Please choose a prescription file before sending." });
      return;
    }
    setSending(true);
    try {
      const body = new FormData();
      body.append("file", selectedFile);
      body.append("doc_type", "prescriptions");
      const response = await fetch(`${API_BASE}/api/patients/${encodeURIComponent(patient.patient_id)}/documents`, {
        method: "POST",
        body,
        credentials: "include",
        headers: { "X-Hospital-Code": getHospitalCode() },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Upload failed");
      }
      setPrescriptionStatus("Sent");
      setNotice({ type: "success", message: `Prescription for ${fullPatientName(patient) || patient.patient_id} sent to Pharmacy.` });
      await loadDocumentHistory(patient.patient_id);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to send prescription to Pharmacy." });
    } finally {
      setSending(false);
    }
  };

  const ageGender = patient ? [patient.age, patient.gender].filter(Boolean).join(" / ") : "";

  return (
    <div className="doc-rx-page-container">
      {/* Top Breadcrumb */}
      <div className="doc-rx-top-header">
        <div className="doc-rx-breadcrumb">
          <span className="crumb-root" onClick={() => window.history.back()}>Sri Raksha Hospital</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-module">OP Management</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-active">Doctor Prescription</span>
        </div>
      </div>

      {/* Main Page Title */}
      <div className="doc-rx-title-section">
        <h1 className="doc-rx-title">Doctor Prescription</h1>
        <p className="doc-rx-subtitle">Upload and send handwritten prescriptions to pharmacy</p>
      </div>

      {/* Patient Details Card */}
      <div className="doc-rx-card doc-rx-patient-card">
        <div className="patient-card-header-row">
          <div>
            <h2 className="card-heading">Patient Details</h2>
            <p className="card-subheading">Search and select a patient to create prescription.</p>
          </div>

          <div className="patient-search-group">
            <div className="search-input-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
                placeholder="Search by UHID, patient name, or phone"
                className="patient-search-input"
              />
            </div>
            <button type="button" className="btn-search-teal" disabled={searching} onClick={() => void handleSearch()}>
              {searching ? "Searching…" : "Search"}
            </button>
            <button type="button" className="btn-clear-outlined" onClick={handleClear}>
              Clear
            </button>
          </div>
        </div>

        {candidates && candidates.length > 0 && (
          <ul className="patient-search-results" role="listbox" style={{ marginTop: 10 }}>
            {candidates.map((p) => (
              <li key={p.patient_id}>
                <button type="button" className="patient-search-result-item" onClick={() => selectPatient(p)}>
                  <strong>{fullPatientName(p)}</strong>
                  <span>{p.patient_id} · {p.phone || "no phone"} · {p.gender || "-"} {p.age ? `· ${p.age}y` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Patient Details Grid Row */}
        {patient ? (
          <div className="patient-details-grid">
            <div className="patient-detail-col">
              <span className="detail-label">UHID</span>
              <span className="detail-val">{patient.patient_id}</span>
            </div>
            <div className="patient-detail-col">
              <span className="detail-label">Patient</span>
              <span className="detail-val">{fullPatientName(patient)}</span>
            </div>
            <div className="patient-detail-col">
              <span className="detail-label">Age / Gender</span>
              <span className="detail-val">{ageGender || "-"}</span>
            </div>
            <div className="patient-detail-col">
              <span className="detail-label">Phone</span>
              <span className="detail-val">{patient.phone || "-"}</span>
            </div>
            <div className="patient-detail-col patient-status-col">
              <span className="pill-in-consultation">
                <span className="status-dot">●</span> Selected
              </span>
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 12 }}>No patient selected yet — search above to begin.</p>
        )}
      </div>

      {/* Middle 2 Columns: Upload Prescription & Prescription Preview */}
      <div className="doc-rx-middle-row">
        {/* Left Card: Upload Prescription */}
        <div className="doc-rx-card doc-rx-upload-card">
          <h2 className="card-heading">Upload Prescription</h2>
          <p className="card-subheading">Drag &amp; drop or click to upload handwritten prescription.</p>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={handleFileUpload}
          />

          <div className="doc-rx-dropzone" onClick={() => fileInputRef.current?.click()}>
            <div className="dropzone-cloud-icon">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#00828a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                <polyline points="12 13 12 8 9 11" />
                <polyline points="12 8 15 11" />
              </svg>
            </div>
            <div className="dropzone-main-text">Drag &amp; drop or click to upload handwritten prescription</div>
            <div className="dropzone-sub-text">Supported: JPG, PNG, PDF</div>

            <div className="dropzone-btn-row">
              <button type="button" className="btn-choose-file" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Choose File
              </button>
            </div>
          </div>
        </div>

        {/* Right Card: Prescription Preview -- shows the actual chosen file */}
        <div className="doc-rx-card doc-rx-preview-card">
          <h2 className="card-heading">Prescription Preview</h2>

          {selectedFile ? (
            <div className="preview-content-row">
              <div className="handwritten-sheet-wrap">
                {previewUrl ? (
                  <img src={previewUrl} alt={selectedFile.name} style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                ) : (
                  <div className="handwritten-sheet" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
                    <span style={{ fontWeight: 700, color: "#64748b" }}>PDF document</span>
                  </div>
                )}
              </div>

              <div className="preview-meta-col">
                <div className="meta-block">
                  <span className="meta-block-label">File Name</span>
                  <span className="meta-block-value filename">{selectedFile.name}</span>
                </div>
                <div className="meta-block">
                  <span className="meta-block-label">Selected At</span>
                  <span className="meta-block-value">{uploadedAt}</span>
                </div>
                <div className="meta-block">
                  <span className="meta-block-label">Status</span>
                  <span className={`meta-status-pill status-${prescriptionStatus.toLowerCase()}`}>
                    <span className="dot">●</span> {prescriptionStatus}
                  </span>
                </div>
                <div className="preview-actions-row">
                  <button type="button" className="btn-replace" onClick={() => fileInputRef.current?.click()}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Replace
                  </button>
                  <button type="button" className="btn-remove" onClick={handleRemoveFile}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="no-preview-placeholder">
              <p>No prescription uploaded yet. Please choose a file.</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="doc-rx-action-bar">
        <button type="button" className="btn-send-pharmacy" disabled={sending} onClick={() => void handleSendToPharmacy()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          {sending ? "Sending…" : "Send To Pharmacy"}
        </button>

        <button type="button" className="btn-save-draft" onClick={handleSaveDraft}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
          </svg>
          Save Draft
        </button>

        <span className="action-bar-hint">Once sent, the prescription becomes visible in the pharmacy portal.</span>
      </div>

      {/* Bottom Row: Sent Prescriptions & Pharmacy Portal Flow */}
      <div className="doc-rx-bottom-row">
        <div className="doc-rx-card doc-rx-sent-card">
          <h2 className="card-heading">Sent Prescriptions</h2>
          <p className="card-subheading">{patient ? `Upload history for ${fullPatientName(patient)}.` : "Select a patient to see their upload history."}</p>

          <div className="table-wrapper">
            <table className="sent-rx-table">
              <thead>
                <tr>
                  <th>FILE</th>
                  <th>UPLOADED</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: "center" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory && (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: "1rem" }}>Loading…</td></tr>
                )}
                {!loadingHistory && sentList.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: "1rem", color: "#627d98" }}>No prescriptions sent yet.</td></tr>
                )}
                {!loadingHistory && sentList.map((item) => (
                  <tr key={item.id}>
                    <td className="patient-name-cell">{item.file_name || `Document #${item.id}`}</td>
                    <td className="time-cell">{new Date(item.created_at).toLocaleString()}</td>
                    <td>
                      <span className="status-badge status-sent">
                        <span className="badge-dot">●</span> Visible to Pharmacy
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button type="button" className="btn-view-rx" onClick={() => setViewModalItem(item)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="doc-rx-card doc-rx-flow-card">
          <h2 className="card-heading">Pharmacy Portal Flow</h2>
          <p className="card-subheading">How it works after you send the prescription.</p>

          <div className="flow-steps-list">
            <div className="flow-step-item">
              <div className="flow-step-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00828a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <div className="flow-step-text">
                <div className="flow-step-title">1. Upload Prescription</div>
                <div className="flow-step-desc">Upload handwritten prescription</div>
              </div>
            </div>
            <div className="flow-step-item">
              <div className="flow-step-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00828a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </div>
              <div className="flow-step-text">
                <div className="flow-step-title">2. Send To Pharmacy</div>
                <div className="flow-step-desc">Prescription is uploaded to the patient record</div>
              </div>
            </div>
            <div className="flow-step-item">
              <div className="flow-step-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00828a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div className="flow-step-text">
                <div className="flow-step-title">3. Pharmacist Views</div>
                <div className="flow-step-desc">Pharmacist reviews the image/PDF directly in the queue</div>
              </div>
            </div>
            <div className="flow-step-item">
              <div className="flow-step-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00828a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <div className="flow-step-text">
                <div className="flow-step-title">4. Billing / Dispense</div>
                <div className="flow-step-desc">Pharmacy dispenses and bills against real stock</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Prescription Details View Modal -- shows the real uploaded file */}
      <Modal
        open={!!viewModalItem}
        onClose={() => setViewModalItem(null)}
        title={`${viewModalItem?.file_name || "Prescription"}`}
      >
        {viewModalItem && (
          <div className="doc-rx-modal-body">
            <div className="modal-meta-grid">
              <div><strong>Uploaded:</strong> {new Date(viewModalItem.created_at).toLocaleString()}</div>
            </div>
            <div className="modal-sheet-preview" style={{ margin: "16px 0" }}>
              {(viewModalItem.mime_type || "").startsWith("image/") ? (
                <img src={`${API_BASE}/api/documents/${viewModalItem.id}/file`} alt={viewModalItem.file_name || "Prescription"} style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e2e8f0" }} />
              ) : (
                <a href={`${API_BASE}/api/documents/${viewModalItem.id}/file`} target="_blank" rel="noreferrer">Open document</a>
              )}
            </div>
            <div className="modal-footer-actions">
              <button type="button" className="btn-modal-close" onClick={() => setViewModalItem(null)}>Close</button>
              <button
                type="button"
                className="btn-modal-pharmacy"
                onClick={() => {
                  setViewModalItem(null);
                  if (onNavigate) onNavigate("pharmacy-op-dispense");
                }}
              >
                Go to Pharmacy OP Dispense
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
