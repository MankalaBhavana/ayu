import { useEffect, useState } from "react";
import { Button, Input, Modal, Table, TableCell, TableHead, TableRow } from "../components/ui";
import { apiFetch } from "../lib/api";
import { formatDateTime } from "../lib/format";
import {
  fetchAllDropdowns,
  createDropdownOption,
  updateDropdownOption,
  deleteDropdownOption,
  DropdownOption,
} from "../lib/dropdownService";
import type { AuditLog, Stats, User } from "../types";

type Props = {
  stats: Stats;
  user: User;
  canReadAudit: boolean;
};

const DROPDOWN_CATEGORIES = [
  { key: "departments", label: "Departments & Clinics", icon: "🏥", description: "Clinical departments and hospital specialities" },
  { key: "visit_types", label: "Visit & Appointment Types", icon: "📋", description: "Appointment and consultation visit classifications" },
  { key: "payment_modes", label: "Payment Modes", icon: "💳", description: "Accepted financial settlement and disbursement methods" },
  { key: "refund_reasons", label: "Advance Refund Reasons", icon: "↩️", description: "Standardised audit reasons for patient advance refunds" },
  { key: "return_reasons", label: "Pharmacy Return Reasons", icon: "💊", description: "Reasons for medication returns from patients or wards" },
  { key: "adjustment_reasons", label: "Inventory Adjustment Reasons", icon: "📦", description: "Inventory write-offs, breakages, and discrepancy reasons" },
  { key: "storage_locations", label: "Storage & Rack Locations", icon: "🏷️", description: "Pharmacy stockrooms, wards, and storage locations" },
  { key: "dosage_forms", label: "Dosage Forms", icon: "🧪", description: "Medication formulations (Tablet, Syrup, Injection, etc.)" },
  { key: "unit_types", label: "Packaging Units", icon: "📐", description: "Inventory dispense units (Strip, Vial, Bottle, etc.)" },
  { key: "counters", label: "Billing Counters", icon: "🏦", description: "Hospital registration, OPD, and pharmacy checkout counters" },
  { key: "cashiers", label: "Cashiers & Counter Operators", icon: "👤", description: "Designated billing cashiers, counter operators, and revenue collectors" },
];

export default function SettingsPage({ stats, user, canReadAudit }: Props) {
  // Audit Trail states
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [auditModule, setAuditModule] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Centralized Dropdown Management states (Issue 4)
  const [activeCategory, setActiveCategory] = useState("departments");
  const [dropdowns, setDropdowns] = useState<Record<string, DropdownOption[]>>({});
  const [dropdownLoading, setDropdownLoading] = useState(true);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Add / Edit Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<DropdownOption | null>(null);
  const [formValue, setFormValue] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formSortOrder, setFormSortOrder] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  // Role authorization check
  const isAuthorized =
    ["admin", "platform_admin", "employee"].includes((user.role || "").toLowerCase()) ||
    ["owner", "hr_manager"].includes((user.access_role || "").toLowerCase()) ||
    (user.permissions || []).includes("admin.use") ||
    (user.permissions || []).includes("settings.write");

  const loadAuditLogs = async (moduleName = auditModule) => {
    if (!canReadAudit) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (moduleName.trim()) params.set("module", moduleName.trim());
      const data = await apiFetch<{ logs?: AuditLog[] }>(`/api/audit/logs?${params.toString()}`);
      setLogs(data.logs || []);
    } catch (loadError) {
      const typedError = loadError as { message?: string; status?: number };
      setError(typedError.message || "Unable to load audit logs.");
    } finally {
      setLoading(false);
    }
  };

  const loadAllDropdowns = async () => {
    setDropdownLoading(true);
    setActionError("");
    try {
      const data = await apiFetch<Record<string, DropdownOption[]>>("/api/config/dropdowns?active_only=false");
      if (data) setDropdowns(data);
    } catch (err: any) {
      setActionError(err.message || "Failed to load centralized dropdowns.");
    } finally {
      setDropdownLoading(false);
    }
  };

  useEffect(() => {
    if (canReadAudit) {
      void loadAuditLogs("");
    }
    void loadAllDropdowns();
  }, [canReadAudit]);

  const handleCreateOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValue.trim()) {
      setActionError("Please provide an option code or value.");
      return;
    }
    setSubmitting(true);
    setActionError("");
    setActionSuccess("");
    try {
      await createDropdownOption({
        category: activeCategory,
        value: formValue.trim(),
        label: formLabel.trim() || formValue.trim(),
        sort_order: parseInt(formSortOrder, 10) || 0,
      });
      setActionSuccess(`Option '${formValue.trim()}' added successfully to ${activeCategory}.`);
      setCreateModalOpen(false);
      setFormValue("");
      setFormLabel("");
      setFormSortOrder("0");
      await loadAllDropdowns();
    } catch (err: any) {
      setActionError(err.message || "Failed to create dropdown option.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (opt: DropdownOption) => {
    setEditingOption(opt);
    setFormValue(opt.value);
    setFormLabel(opt.label);
    setFormSortOrder(String(opt.sort_order || 0));
    setActionError("");
    setActionSuccess("");
    setEditModalOpen(true);
  };

  const handleUpdateOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOption) return;
    setSubmitting(true);
    setActionError("");
    setActionSuccess("");
    try {
      await updateDropdownOption(editingOption.id, {
        value: editingOption.is_system ? editingOption.value : formValue.trim(),
        label: formLabel.trim() || formValue.trim(),
        sort_order: parseInt(formSortOrder, 10) || 0,
      });
      setActionSuccess(`Option '${editingOption.value}' updated successfully.`);
      setEditModalOpen(false);
      setEditingOption(null);
      await loadAllDropdowns();
    } catch (err: any) {
      setActionError(err.message || "Failed to update dropdown option.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (opt: DropdownOption) => {
    setActionError("");
    setActionSuccess("");
    try {
      const nextState = !opt.is_active;
      await updateDropdownOption(opt.id, { is_active: nextState });
      setActionSuccess(`Option '${opt.label}' marked as ${nextState ? "active" : "inactive"}.`);
      await loadAllDropdowns();
    } catch (err: any) {
      setActionError(err.message || "Failed to toggle option status.");
    }
  };

  const handleDeleteOption = async (opt: DropdownOption) => {
    if (!window.confirm(`Are you sure you want to delete or deactivate option '${opt.label}'?`)) {
      return;
    }
    setActionError("");
    setActionSuccess("");
    try {
      const res = await deleteDropdownOption(opt.id);
      setActionSuccess(res.message || `Option '${opt.label}' updated.`);
      await loadAllDropdowns();
    } catch (err: any) {
      setActionError(err.message || "Failed to delete option.");
    }
  };

  const currentCategoryInfo = DROPDOWN_CATEGORIES.find((c) => c.key === activeCategory) || DROPDOWN_CATEGORIES[0];
  const currentOptions = dropdowns[activeCategory] || [];
  const filteredOptions = currentOptions.filter((opt) => {
    if (!dropdownSearch.trim()) return true;
    const q = dropdownSearch.toLowerCase();
    return opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q);
  });

  return (
    <section className="module-page" style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem 1rem" }}>
      {/* 1. Header Banner */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>System Settings & Administration</h1>
        <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: "0.875rem" }}>
          Centralized configuration, dropdown management, database stats, and security audit logs.
        </p>
      </div>

      {/* 2. Centralized Dropdown Management Panel (Issue 4) */}
      <div className="panel" style={{ marginBottom: "1.75rem", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem 1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.25rem" }}>⚙️</span>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>Centralized Dropdown Management</h2>
              <span style={{ background: "#f0fdf4", color: "#16a34a", fontSize: "0.75rem", padding: "2px 8px", borderRadius: "9999px", fontWeight: 600, border: "1px solid #bbf7d0" }}>
                Active & Synced
              </span>
            </div>
            <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: "0.8125rem" }}>
              Centrally configure, add, update, and manage options across Billing, Pharmacy, Appointments, and Clinical modules.
            </p>
          </div>

          {isAuthorized ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setFormValue("");
                setFormLabel("");
                setFormSortOrder(String((currentOptions.length + 1) * 10));
                setCreateModalOpen(true);
              }}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <span>+</span> Add Option to {currentCategoryInfo.label}
            </Button>
          ) : (
            <span style={{ fontSize: "0.8125rem", color: "#ea580c", background: "#fff7ed", padding: "6px 12px", borderRadius: "6px", border: "1px solid #fed7aa" }}>
              🔒 Configuration restricted to Administrator & Management roles.
            </span>
          )}
        </div>

        {/* Feedback alerts */}
        {actionError && (
          <div style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecdd3", padding: "10px 14px", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.875rem" }}>
            ⚠️ {actionError}
          </div>
        )}
        {actionSuccess && (
          <div style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "10px 14px", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.875rem" }}>
            ✓ {actionSuccess}
          </div>
        )}

        {/* Category Selector Tabs */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "8px", marginBottom: "1.25rem", borderBottom: "1px solid #f1f5f9" }}>
          {DROPDOWN_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            const count = (dropdowns[cat.key] || []).length;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.key);
                  setDropdownSearch("");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "0.8125rem",
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  border: isActive ? "1px solid #0d9488" : "1px solid #e2e8f0",
                  background: isActive ? "#f0fdfa" : "#ffffff",
                  color: isActive ? "#0f766e" : "#475569",
                  transition: "all 0.15s ease",
                }}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span
                  style={{
                    background: isActive ? "#ccfbf1" : "#f1f5f9",
                    color: isActive ? "#0d9488" : "#64748b",
                    padding: "1px 6px",
                    borderRadius: "9999px",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Category Description & In-Table Filter */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#1e293b", margin: 0 }}>
              {currentCategoryInfo.icon} {currentCategoryInfo.label}
            </h3>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "2px 0 0" }}>
              {currentCategoryInfo.description}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 12px", minWidth: "260px" }}>
            <span style={{ color: "#94a3b8" }}>🔍</span>
            <input
              type="text"
              placeholder={`Search ${currentCategoryInfo.label.toLowerCase()}...`}
              value={dropdownSearch}
              onChange={(e) => setDropdownSearch(e.target.value)}
              style={{ border: "none", outline: "none", background: "transparent", fontSize: "0.8125rem", width: "100%", color: "#0f172a" }}
            />
            {dropdownSearch && (
              <button
                type="button"
                onClick={() => setDropdownSearch("")}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", padding: 0 }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Dropdowns Table */}
        {dropdownLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
            <div className="loading-spinner" style={{ margin: "0 auto 12px" }}></div>
            Loading configuration options...
          </div>
        ) : filteredOptions.length === 0 ? (
          <div style={{ padding: "36px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px" }}>
            No options found for this category{dropdownSearch ? ` matching '${dropdownSearch}'` : ""}.
          </div>
        ) : (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: "10px 14px", fontWeight: 600 }}>Value / Key</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600 }}>Display Label</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "center" }}>Sort Order</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "center" }}>Classification</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "center" }}>Status</th>
                  {isAuthorized && <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredOptions.map((opt) => (
                  <tr key={opt.id} style={{ borderBottom: "1px solid #f1f5f9", background: opt.is_active ? "#ffffff" : "#fbfcfe" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: opt.is_active ? "#0f172a" : "#94a3b8" }}>
                      <code>{opt.value}</code>
                    </td>
                    <td style={{ padding: "10px 14px", color: opt.is_active ? "#1e293b" : "#94a3b8", fontWeight: 500 }}>
                      {opt.label}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", color: "#64748b" }}>
                      {opt.sort_order}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      {opt.is_system ? (
                        <span style={{ background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600 }}>
                          System Core
                        </span>
                      ) : (
                        <span style={{ background: "#eff6ff", color: "#2563eb", padding: "2px 8px", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600 }}>
                          Custom User
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      {isAuthorized ? (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(opt)}
                          style={{
                            border: "none",
                            borderRadius: "9999px",
                            padding: "3px 10px",
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            background: opt.is_active ? "#ecfdf5" : "#fef2f2",
                            color: opt.is_active ? "#059669" : "#dc2626",
                            transition: "all 0.15s ease",
                          }}
                          title="Click to toggle active status"
                        >
                          {opt.is_active ? "● Active" : "○ Inactive"}
                        </button>
                      ) : (
                        <span style={{ color: opt.is_active ? "#059669" : "#dc2626", fontWeight: 600 }}>
                          {opt.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </td>
                    {isAuthorized && (
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => handleOpenEdit(opt)}
                            style={{ padding: "4px 8px", fontSize: "0.75rem", height: "auto" }}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => handleDeleteOption(opt)}
                            style={{ padding: "4px 8px", fontSize: "0.75rem", height: "auto" }}
                            title={opt.is_system ? "System options are safely deactivated" : "Delete option"}
                          >
                            {opt.is_system ? "Deactivate" : "Delete"}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Database Snapshot & Current User */}
      <div className="settings-grid" style={{ marginBottom: "1.75rem" }}>
        <div className="panel" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#0f172a", margin: "0 0 8px" }}>Database Snapshot</h3>
          <pre style={{ margin: 0, padding: "0.75rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "0.75rem" }}>
            {JSON.stringify(stats, null, 2)}
          </pre>
        </div>
        <div className="panel" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#0f172a", margin: "0 0 8px" }}>Current User</h3>
          <pre style={{ margin: 0, padding: "0.75rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "0.75rem" }}>
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>
      </div>

      {/* 4. Audit Trail */}
      <div className="panel" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem 1.5rem" }}>
        <div className="module-panel-head" style={{ marginBottom: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#0f172a", margin: "0 0 4px" }}>Audit Trail</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.8125rem", color: "#64748b" }}>
              Recent system actions, filtered by module when needed.
            </p>
          </div>
        </div>
        {!canReadAudit ? (
          <p className="muted" style={{ color: "#64748b", fontSize: "0.875rem" }}>
            Audit log access is restricted to admins with audit permission.
          </p>
        ) : (
          <>
            <div className="patient-toolbar" style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
              <Input
                value={auditModule}
                onChange={(event) => setAuditModule(event.target.value)}
                placeholder="Filter by module name (e.g. billing_invoices)"
                style={{ flex: 1, minWidth: "220px" }}
              />
              <Button type="button" onClick={() => void loadAuditLogs(auditModule)}>
                Apply
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAuditModule("");
                  void loadAuditLogs("");
                }}
              >
                Clear
              </Button>
              <span className="muted" style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                {loading ? "Loading..." : `${logs.length} rows`}
              </span>
            </div>
            {error ? <p className="notice error">{error}</p> : null}
            {!loading && !error && logs.length === 0 ? <p className="muted">No audit log entries available.</p> : null}
            {!loading && !error && logs.length > 0 ? (
              <>
                <Table className="module-table" aria-label="Audit logs table">
                  <TableHead>
                    <TableCell>When</TableCell>
                    <TableCell>Actor</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Module</TableCell>
                    <TableCell>Record</TableCell>
                    <TableCell>Details</TableCell>
                  </TableHead>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{formatDateTime(log.created_at)}</TableCell>
                      <TableCell>{log.actor_username || "-"}</TableCell>
                      <TableCell>{log.action || "-"}</TableCell>
                      <TableCell>{log.module_name || "-"}</TableCell>
                      <TableCell>{log.entity_key || "-"}</TableCell>
                      <TableCell>{log.payload || "-"}</TableCell>
                    </TableRow>
                  ))}
                </Table>
              </>
            ) : null}
          </>
        )}
      </div>

      {/* 5. Create Option Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={`Add Option to ${currentCategoryInfo.label}`}
        description={`Creates a new standardized option for the '${activeCategory}' category`}
      >
        <form onSubmit={handleCreateOption} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Value / Internal Code *
            </label>
            <input
              type="text"
              required
              className="ui-input"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder="e.g. Cardiology, Cash, Procedure cancelled"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Display Label (as seen in dropdowns)
            </label>
            <input
              type="text"
              className="ui-input"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              placeholder="Leave blank to use value"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Sort Order
            </label>
            <input
              type="number"
              className="ui-input"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
              value={formSortOrder}
              onChange={(e) => setFormSortOrder(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
            <Button type="button" variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving..." : "Create Option"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 6. Edit Option Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit Option: ${editingOption?.value}`}
        description={`Update display label and ordering for ${activeCategory}`}
      >
        <form onSubmit={handleUpdateOption} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Value / Internal Code
            </label>
            <input
              type="text"
              required
              disabled={editingOption?.is_system}
              className="ui-input"
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                background: editingOption?.is_system ? "#f1f5f9" : "#ffffff",
              }}
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
            />
            {editingOption?.is_system && (
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                System core option values cannot be altered to preserve database referential integrity.
              </span>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Display Label *
            </label>
            <input
              type="text"
              required
              className="ui-input"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Sort Order
            </label>
            <input
              type="number"
              className="ui-input"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
              value={formSortOrder}
              onChange={(e) => setFormSortOrder(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
            <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
