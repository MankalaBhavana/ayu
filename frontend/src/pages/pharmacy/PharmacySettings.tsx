import { useEffect, useState, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Modal } from "../../components/ui";
import { apiFetch, reportError } from "../../lib/api";
import { useDropdownOptions } from "../../lib/dropdownService";
import { DEFAULT_PHARMACY_NAME, fetchPharmacySettings, savePharmacySettings } from "../../lib/pharmacySettings";
import type { PharmacyPrintSettings } from "../../lib/pharmacySettings";
import type { Notice } from "../../types";
import ConfigListManager from "./ConfigListManager";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate: (pageId: string) => void;
};

type Medicine = {
  id: number;
  name: string;
  generic_name?: string;
  category?: string;
  dosage_form?: string;
  strength?: string;
  unit?: string;
  hsn_code?: string;
  gst_rate?: number;
  manufacturer?: string;
  reorder_level?: number;
  active?: number | boolean | null;
};

const isActiveMedicine = (m: Medicine) => m.active === undefined || m.active === null || Boolean(Number(m.active));

export default function PharmacySettings({ setNotice, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<"medicines" | "categories" | "stores" | "print">("medicines");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Medicine Form Modal
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);
  const [formName, setFormName] = useState("");
  const [formGeneric, setFormGeneric] = useState("");
  const [formCategory, setFormCategory] = useState("Tablet");
  const [formDosage, setFormDosage] = useState("Oral");
  const [formStrength, setFormStrength] = useState("");
  const [formUnit, setFormUnit] = useState("Strip");
  const [formHsn, setFormHsn] = useState("3004");
  const [formGst, setFormGst] = useState<number>(12);
  const [formMfr, setFormMfr] = useState("");
  const [formReorder, setFormReorder] = useState<number>(20);
  const [submittingMed, setSubmittingMed] = useState(false);

  const [formActive, setFormActive] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Dosage forms come from Settings → Dosage Forms & Categories (shared "dosage_forms" list).
  const { options: dosageFormList } = useDropdownOptions("dosage_forms");
  // Keeps a medicine's existing value selectable even if it was removed from the list.
  const dosageFormOptions = useMemo(() => {
    const opts = dosageFormList.map((f) => ({ value: f.value, label: f.label || f.value }));
    if (formCategory && !opts.some((o) => o.value.toLowerCase() === formCategory.toLowerCase())) {
      opts.push({ value: formCategory, label: formCategory });
    }
    return opts;
  }, [dosageFormList, formCategory]);

  // Print & label settings, stored on the server and used on pharmacy invoices and labels
  const [printSettings, setPrintSettings] = useState<PharmacyPrintSettings>({ pharmacy_name: "", address_line: "", dl_number: "", gstin: "" });
  const [savingPrint, setSavingPrint] = useState(false);

  useEffect(() => {
    fetchPharmacySettings()
      .then(setPrintSettings)
      .catch((err) => reportError(setNotice, err as any, "Failed to load print settings"));
  }, []);

  const handleSavePrintSettings = async () => {
    setSavingPrint(true);
    try {
      setPrintSettings(await savePharmacySettings(printSettings));
      setNotice({ type: "success", message: "Print settings saved. New pharmacy invoices and labels will use them." });
    } catch (err) {
      reportError(setNotice, err as any, "Failed to save print settings");
    } finally {
      setSavingPrint(false);
    }
  };

  // Load medicines
  const loadMedicines = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ medicines: Medicine[] }>("/api/pharmacy/medicines");
      if (res?.medicines) {
        setMedicines(res.medicines);
      }
    } catch (err) {
      reportError(setNotice, err as any, "Failed to load medicines");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMedicines();
  }, []);

  // Filtered
  const filteredMeds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const visible = showInactive ? medicines : medicines.filter(isActiveMedicine);
    if (!q) return visible;
    return visible.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      (m.generic_name || "").toLowerCase().includes(q) ||
      (m.category || "").toLowerCase().includes(q)
    );
  }, [medicines, searchQuery, showInactive]);
  const inactiveCount = medicines.filter((m) => !isActiveMedicine(m)).length;

  // Open Add
  const handleOpenAdd = () => {
    setEditingMed(null);
    setFormName("");
    setFormGeneric("");
    setFormCategory("Tablet");
    setFormDosage("Oral");
    setFormStrength("");
    setFormUnit("Strip");
    setFormHsn("3004");
    setFormGst(12);
    setFormMfr("");
    setFormReorder(20);
    setFormActive(true);
    setMedModalOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (m: Medicine) => {
    setEditingMed(m);
    setFormName(m.name);
    setFormGeneric(m.generic_name || "");
    setFormCategory(m.category || "Tablet");
    setFormDosage(m.dosage_form || "Oral");
    setFormStrength(m.strength || "");
    setFormUnit(m.unit || "Strip");
    setFormHsn(m.hsn_code || "3004");
    setFormGst(m.gst_rate ?? 12);
    setFormMfr(m.manufacturer || "");
    setFormReorder(m.reorder_level ?? 20);
    setFormActive(isActiveMedicine(m));
    setMedModalOpen(true);
  };

  // Save Medicine
  const handleSaveMedicine = async () => {
    if (!formName.trim()) {
      setNotice({ type: "warning", message: "Medicine name is required." });
      return;
    }

    setSubmittingMed(true);
    try {
      const payload = {
        name: formName,
        generic_name: formGeneric,
        category: formCategory,
        dosage_form: formDosage,
        strength: formStrength,
        unit: formUnit,
        hsn_code: formHsn,
        gst_rate: formGst,
        manufacturer: formMfr,
        reorder_level: formReorder,
        active: formActive,
      };

      if (editingMed) {
        await apiFetch(`/api/pharmacy/medicines/${editingMed.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice({ type: "success", message: `Medicine ${formName} updated.` });
      } else {
        await apiFetch("/api/pharmacy/medicines", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice({ type: "success", message: `Medicine ${formName} registered in master catalog.` });
      }

      setMedModalOpen(false);
      void loadMedicines();
    } catch (err) {
      reportError(setNotice, err as any, "Failed to save medicine");
    } finally {
      setSubmittingMed(false);
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
          <span style={{ color: "#0f172a", fontWeight: 700 }}>Settings</span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            type="button"
            className="primary"
            style={{ background: "#00828a", borderColor: "#00828a" }}
            onClick={handleOpenAdd}
          >
            + Add Medicine to Master
          </Button>
          <Button type="button" variant="secondary" onClick={() => void loadMedicines()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", gap: "1.5rem", marginBottom: "1.5rem", overflowX: "auto" }}>
        {[
          { id: "medicines", label: `Medicine Master (${medicines.length})` },
          { id: "categories", label: "Dosage Forms & Categories" },
          { id: "stores", label: "Store & Rack Locations" },
          { id: "print", label: "Print & Label Settings" },
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
            }}
            onClick={() => setActiveTab(tab.id as any)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. MEDICINE MASTER */}
      {activeTab === "medicines" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ width: "320px" }}>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search master catalog..."
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.85rem", color: "#64748b" }}>
              {inactiveCount > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                  Show inactive ({inactiveCount})
                </label>
              )}
              <span>Showing {filteredMeds.length} medicines</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.5rem" }}>Brand / Commercial Name</th>
                  <th style={{ padding: "0.5rem" }}>Generic Composition</th>
                  <th style={{ padding: "0.5rem" }}>Dosage Form</th>
                  <th style={{ padding: "0.5rem" }}>Strength</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>Reorder Level</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>GST %</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>Status</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredMeds.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.5rem", fontWeight: 700, color: "#0f172a" }}>{m.name}</td>
                    <td style={{ padding: "0.5rem", color: "#475569" }}>{m.generic_name || "-"}</td>
                    <td style={{ padding: "0.5rem", color: "#64748b" }}>{m.category || m.dosage_form || "Tablet"}</td>
                    <td style={{ padding: "0.5rem", color: "#334155" }}>{m.strength || "-"}</td>
                    <td style={{ padding: "0.5rem", textAlign: "center", fontWeight: 600 }}>{m.reorder_level ?? 10}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right", color: "#64748b" }}>{m.gst_rate ?? 0}%</td>
                    <td style={{ padding: "0.5rem", textAlign: "center" }}>
                      {isActiveMedicine(m) ? (
                        <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.72rem", fontWeight: 700, background: "#dcfce7", color: "#166534" }}>
                          Active
                        </span>
                      ) : (
                        <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.72rem", fontWeight: 700, background: "#f1f5f9", color: "#64748b" }}>
                          Inactive
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>
                      <Button
                        type="button"
                        variant="secondary"
                        style={{ padding: "2px 10px", fontSize: "0.78rem" }}
                        onClick={() => handleOpenEdit(m)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. CATEGORIES & FORMS */}
      {activeTab === "categories" && (
        <ConfigListManager
          category="dosage_forms"
          title="Dosage Forms & Categories"
          description="Used by the Dosage Form field in the medicine master, the Unit / Form on GRN lines, and unit suggestions on purchase requests."
          itemNoun="dosage form"
          placeholder="New dosage form / category, e.g. Sachet / Powder"
          setNotice={setNotice}
        />
      )}

      {/* 3. STORE & RACK LOCATIONS */}
      {activeTab === "stores" && (
        <ConfigListManager
          category="storage_locations"
          title="Store & Rack Locations"
          description="Chosen per line when receiving goods (GRN) and shown against each batch in Inventory / Stock."
          itemNoun="location"
          placeholder="New store or rack, e.g. Cold Chain Storage (2°C - 8°C)"
          setNotice={setNotice}
        />
      )}

      {/* 4. PRINT & LABEL SETTINGS */}
      {activeTab === "print" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", maxWidth: "700px" }}>
          <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
            Invoice Header & Label Printing Configuration
          </h3>
          <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>
            Printed at the top of OP Dispense invoices and on medicine labels. Leave a field blank to omit it.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Hospital / Pharmacy Name on Invoices:</label>
              <Input
                value={printSettings.pharmacy_name}
                placeholder={DEFAULT_PHARMACY_NAME}
                onChange={(e) => setPrintSettings((s) => ({ ...s, pharmacy_name: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Address & Contact Line:</label>
              <Input
                value={printSettings.address_line}
                placeholder="e.g. Old Alwal Road, Bollaram, Hyderabad · +91 63033 46810"
                onChange={(e) => setPrintSettings((s) => ({ ...s, address_line: e.target.value }))}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Drug License Numbers:</label>
                <Input
                  value={printSettings.dl_number}
                  placeholder="e.g. 20B/XX/0000, 21B/XX/0000"
                  onChange={(e) => setPrintSettings((s) => ({ ...s, dl_number: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>GSTIN Number:</label>
                <Input
                  value={printSettings.gstin}
                  placeholder="15-character GSTIN"
                  onChange={(e) => setPrintSettings((s) => ({ ...s, gstin: e.target.value.toUpperCase() }))}
                />
              </div>
            </div>
          </div>

          <Button
            type="button"
            className="primary"
            style={{ background: "#00828a", borderColor: "#00828a", fontWeight: 700 }}
            disabled={savingPrint}
            onClick={() => void handleSavePrintSettings()}
          >
            {savingPrint ? "Saving..." : "Save Print Settings"}
          </Button>
        </div>
      )}

      {/* Add / Edit Medicine Modal */}
      {medModalOpen && (
        <Modal open={medModalOpen} onClose={() => setMedModalOpen(false)}>
          <div style={{ padding: "1.5rem", maxWidth: "600px" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>
              {editingMed ? `Edit Medicine: ${editingMed.name}` : "Register Medicine in Master Catalog"}
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>
              Configured master record used across OP Dispensing, Emergency Orders, and GRN verification.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Commercial / Brand Name *:
                </label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Dolo 650mg Tablet"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Generic Salt / Composition:
                </label>
                <Input
                  value={formGeneric}
                  onChange={(e) => setFormGeneric(e.target.value)}
                  placeholder="e.g. Paracetamol"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Strength:
                </label>
                <Input
                  value={formStrength}
                  onChange={(e) => setFormStrength(e.target.value)}
                  placeholder="e.g. 650mg"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Dosage Form:
                </label>
                <select
                  className="ui-input"
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                >
                  {dosageFormOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Unit / Packaging:
                </label>
                <select
                  className="ui-input"
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value)}
                >
                  <option value="Strip">Strip</option>
                  <option value="Bottle">Bottle</option>
                  <option value="Vial">Vial / Ampoule</option>
                  <option value="Tube">Tube</option>
                  <option value="Box">Box</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  HSN / SAC Code:
                </label>
                <Input
                  value={formHsn}
                  onChange={(e) => setFormHsn(e.target.value)}
                  placeholder="3004"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  GST Tax Rate (%):
                </label>
                <Input
                  type="number"
                  value={formGst}
                  onChange={(e) => setFormGst(parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Manufacturer / Brand:
                </label>
                <Input
                  value={formMfr}
                  onChange={(e) => setFormMfr(e.target.value)}
                  placeholder="e.g. Micro Labs Ltd"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Reorder Alert Threshold:
                </label>
                <Input
                  type="number"
                  min={1}
                  value={formReorder}
                  onChange={(e) => setFormReorder(parseInt(e.target.value) || 20)}
                />
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "#334155", marginBottom: "1rem", cursor: "pointer" }}>
              <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
              Active — inactive medicines are hidden from purchase request and GRN suggestions (existing stock can still be dispensed)
            </label>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={() => setMedModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="primary"
                style={{ background: "#00828a", borderColor: "#00828a", fontWeight: 700 }}
                disabled={submittingMed}
                onClick={handleSaveMedicine}
              >
                {submittingMed ? "Saving..." : "Save Medicine"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
