import { useEffect, useState, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Modal } from "../../components/ui";
import { apiFetch, reportError } from "../../lib/api";
import { downloadCsv } from "../../lib/csvExport";
import type { Notice } from "../../types";
import { generatePDFBlob, printPDF } from "../../lib/exportService";

import { formatDateOnlyIST, formatIST, toISTDateKey } from "../../lib/format";
type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate: (pageId: string) => void;
};

type Supplier = {
  id: number;
  supplier_name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  gst_number?: string;
  drug_license_no?: string;
  address?: string;
  status: "active" | "inactive";
  credit_limit?: number;
  payment_terms?: string;
};

type SupplierLedger = {
  supplier: Supplier;
  total_purchases: number;
  total_paid: number;
  outstanding?: number;
  outstanding_balance?: number;
  purchases: Array<{
    id: string | number;
    order_id?: number;
    entry_type?: string;
    type?: string;
    ref_no?: string;
    medicine_name: string;
    quantity: number;
    unit_cost?: number;
    total_cost: number;
    status: string;
    created_at: string;
  }>;
  recent_receipts?: any[];
};

export default function PharmacySuppliers({ setNotice, onNavigate }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Add / Edit Supplier Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formGst, setFormGst] = useState("");
  const [formDrugLic, setFormDrugLic] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [submittingForm, setSubmittingForm] = useState(false);

  // Status & Delete management
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Selected Supplier Ledger Modal / View
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [selectedLedger, setSelectedLedger] = useState<SupplierLedger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Record Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMode, setPayMode] = useState("bank_transfer");
  const [payRef, setPayRef] = useState("");
  const [payRemarks, setPayRemarks] = useState("");

  // Load suppliers
  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ suppliers: Supplier[] }>("/api/pharmacy/suppliers");
      if (res?.suppliers) {
        setSuppliers(res.suppliers);
      }
    } catch (err) {
      reportError(setNotice, err as any, "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  // Filter suppliers
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      s.supplier_name.toLowerCase().includes(q) ||
      (s.contact_person || "").toLowerCase().includes(q) ||
      (s.phone || "").toLowerCase().includes(q) ||
      (s.gst_number || "").toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  const handleExportSuppliersCsv = () => {
    downloadCsv(
      "pharmacy_suppliers.csv",
      ["Supplier Name", "Contact Person", "Phone", "Email", "GST Number", "Drug License No", "Status", "Credit Limit", "Payment Terms"],
      filteredSuppliers.map((s) => [
        s.supplier_name, s.contact_person || "", s.phone || "", s.email || "",
        s.gst_number || "", s.drug_license_no || "", s.status, s.credit_limit ?? "", s.payment_terms || "",
      ])
    );
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormName("");
    setFormContact("");
    setFormPhone("");
    setFormEmail("");
    setFormGst("");
    setFormDrugLic("");
    setFormAddress("");
    setFormStatus("active");
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setFormName(s.supplier_name);
    setFormContact(s.contact_person || "");
    setFormPhone(s.phone || "");
    setFormEmail(s.email || "");
    setFormGst(s.gst_number || "");
    setFormDrugLic(s.drug_license_no || "");
    setFormAddress(s.address || "");
    setFormStatus(s.status || "active");
    setModalOpen(true);
  };

  // Toggle Supplier Status (active <-> inactive)
  const handleToggleStatus = async (s: Supplier) => {
    const nextStatus: "active" | "inactive" = s.status === "active" ? "inactive" : "active";
    setUpdatingStatusId(s.id);
    try {
      await apiFetch(`/api/pharmacy/suppliers/${s.id}`, {
        method: "PUT",
        body: JSON.stringify({
          supplier_name: s.supplier_name,
          contact_person: s.contact_person,
          phone: s.phone,
          email: s.email,
          gst_number: s.gst_number,
          drug_license_no: s.drug_license_no,
          address: s.address,
          status: nextStatus,
        }),
      });
      setSuppliers((prev) =>
        prev.map((item) => (item.id === s.id ? { ...item, status: nextStatus } : item))
      );
      setNotice({
        type: "success",
        message: `Supplier "${s.supplier_name}" status set to ${nextStatus}.`,
      });
    } catch (err) {
      reportError(setNotice, err as any, "Failed to update supplier status");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Delete Supplier
  const handleConfirmDelete = async () => {
    if (!supplierToDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/pharmacy/suppliers/${supplierToDelete.id}`, {
        method: "DELETE",
      });
      setSuppliers((prev) => prev.filter((s) => s.id !== supplierToDelete.id));
      setNotice({
        type: "success",
        message: `Supplier "${supplierToDelete.supplier_name}" deleted successfully.`,
      });
      setSupplierToDelete(null);
    } catch (err) {
      reportError(setNotice, err as any, "Failed to delete supplier");
    } finally {
      setDeleting(false);
    }
  };

  // Save Supplier (Create or Update)
  const handleSaveSupplier = async () => {
    if (!formName.trim()) {
      setNotice({ type: "warning", message: "Supplier Name is required." });
      return;
    }
    const cleanPhone = formPhone.replace(/\D/g, "");
    if (formPhone.trim() && cleanPhone.length !== 10) {
      setNotice({ type: "warning", message: "Mobile number must be exactly 10 digits." });
      return;
    }

    setSubmittingForm(true);
    try {
      const payload = {
        supplier_name: formName,
        contact_person: formContact,
        phone: formPhone,
        email: formEmail,
        gst_number: formGst,
        drug_license_no: formDrugLic,
        address: formAddress,
        status: formStatus,
      };

      if (editingSupplier) {
        await apiFetch(`/api/pharmacy/suppliers/${editingSupplier.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice({ type: "success", message: `Supplier ${formName} updated.` });
      } else {
        await apiFetch("/api/pharmacy/suppliers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice({ type: "success", message: `Supplier ${formName} added.` });
      }

      setModalOpen(false);
      void loadSuppliers();
    } catch (err) {
      reportError(setNotice, err as any, "Failed to save supplier");
    } finally {
      setSubmittingForm(false);
    }
  };

  // Open Supplier Ledger
  const handleOpenLedger = async (supplierId: number) => {
    setLedgerLoading(true);
    setLedgerModalOpen(true);
    try {
      const res = await apiFetch<SupplierLedger>(`/api/pharmacy/suppliers/${supplierId}/ledger`);
      setSelectedLedger(res);
      setPayAmount(res.outstanding && res.outstanding > 0 ? String(res.outstanding) : "");
    } catch (err) {
      reportError(setNotice, err as any, "Failed to load supplier ledger");
    } finally {
      setLedgerLoading(false);
    }
  };

  // Record Payment
  const handleRecordPayment = async () => {
    const amountNum = parseFloat(payAmount) || 0;
    if (amountNum <= 0) {
      setNotice({ type: "warning", message: "Payment amount must be greater than 0" });
      return;
    }
    if (!selectedLedger) return;

    try {
      await apiFetch(`/api/pharmacy/suppliers/${selectedLedger.supplier.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: amountNum,
          payment_mode: payMode,
          reference_no: payRef,
        }),
      });
      setNotice({
        type: "success",
        message: `Disbursement of ₹${amountNum.toFixed(2)} recorded via ${payMode}. Ref #${payRef || "N/A"}.`,
      });
      setPaymentModalOpen(false);
      // Reload updated ledger from server to refresh live totals
      await handleOpenLedger(selectedLedger.supplier.id);
    } catch (err) {
      reportError(setNotice, err as any, "Failed to record payment");
    }
  };

  const [printingSuppliers, setPrintingSuppliers] = useState(false);
  const [printingLedger, setPrintingLedger] = useState(false);

  const handlePrintSuppliersReport = async () => {
    if (printingSuppliers) return;
    setPrintingSuppliers(true);
    try {
      const now = new Date();
      const dateStr = formatIST(now, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const payload = {
        title: "Pharmacy Registered Suppliers Directory",
        subtitle: `Total Registered Suppliers: ${suppliers.length} · Active: ${suppliers.filter((s) => s.status === "active").length} · Generated on ${dateStr}`,
        brand_logo: "ayu" as const,
        document_type: "Suppliers Directory Report",
        filename: `Pharmacy_Suppliers_${toISTDateKey(now)}`,
        sections: [
          {
            title: "Registered Pharmacy Suppliers",
            headers: ["Supplier Name", "Contact Person", "Phone", "GST Number", "Drug License", "Status"],
            rows: filteredSuppliers.map((s) => [
              s.supplier_name,
              s.contact_person || "-",
              s.phone || "-",
              s.gst_number || "-",
              s.drug_license_no || "-",
              s.status.toUpperCase(),
            ]),
          },
        ],
      };

      const { blob } = await generatePDFBlob(payload);
      printPDF(blob);
      setNotice({ type: "success", message: "Generated Suppliers Directory report for printing." });
    } catch (error) {
      console.error("Print suppliers failed:", error);
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to generate and print suppliers report.",
      });
    } finally {
      setPrintingSuppliers(false);
    }
  };

  const handlePrintSupplierLedger = async () => {
    if (!selectedLedger || printingLedger) return;
    setPrintingLedger(true);
    try {
      const now = new Date();
      const dateStr = formatIST(now, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const outstanding = (selectedLedger.outstanding ?? selectedLedger.outstanding_balance) || 0;

      const payload = {
        title: `Supplier Account Ledger — ${selectedLedger.supplier.supplier_name}`,
        subtitle: `Supplier ID: #${selectedLedger.supplier.id} · Contact: ${selectedLedger.supplier.phone || "-"} · GST: ${selectedLedger.supplier.gst_number || "-"} · Generated on ${dateStr}`,
        brand_logo: "ayu" as const,
        document_type: "Supplier Statement of Account",
        filename: `Supplier_Ledger_${selectedLedger.supplier.supplier_name.replace(/\s+/g, "_")}`,
        sections: [
          {
            title: "Financial Statement Summary",
            headers: ["Metric", "Amount", "Description"],
            rows: [
              ["Total Inward Purchases", `₹${(selectedLedger.total_purchases || 0).toFixed(2)}`, "Cumulative verified delivered orders"],
              ["Total Payments Made", `₹${(selectedLedger.total_paid || 0).toFixed(2)}`, "Cumulative disbursements to supplier"],
              ["Outstanding Balance Payable", `₹${outstanding.toFixed(2)}`, "Net balance payable"],
            ],
          },
          {
            title: "Recent Orders, Deliveries & Requisitions",
            headers: ["Date", "Type / Ref", "Medicine / Product", "Qty", "Total Cost", "Status"],
            rows:
              selectedLedger.purchases && selectedLedger.purchases.length > 0
                ? selectedLedger.purchases.map((p) => [
                    p.created_at ? formatDateOnlyIST(p.created_at) : "-",
                    p.entry_type || p.ref_no || p.type || "Order",
                    p.medicine_name,
                    p.quantity,
                    `₹${Number(p.total_cost || 0).toFixed(2)}`,
                    p.status,
                  ])
                : [["-", "-", "No transaction history recorded", "-", "-", "-"]],
          },
        ],
        totals: {
          subtotal: `₹${(selectedLedger.total_purchases || 0).toFixed(2)}`,
          amount_received: `₹${(selectedLedger.total_paid || 0).toFixed(2)}`,
          grand_total: `₹${outstanding.toFixed(2)}`,
        },
      };

      const { blob } = await generatePDFBlob(payload);
      printPDF(blob);
      setNotice({ type: "success", message: `Generated Ledger for ${selectedLedger.supplier.supplier_name} for printing.` });
    } catch (error) {
      console.error("Print ledger failed:", error);
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to generate and print supplier ledger.",
      });
    } finally {
      setPrintingLedger(false);
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
          <span style={{ color: "#0f172a", fontWeight: 700 }}>Suppliers</span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            type="button"
            className="primary"
            style={{ background: "#00828a", borderColor: "#00828a" }}
            onClick={handleOpenAdd}
          >
            + Add Supplier
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handlePrintSuppliersReport()}
            disabled={printingSuppliers || filteredSuppliers.length === 0}
            title="Generate and print suppliers directory PDF"
          >
            {printingSuppliers ? "Generating..." : "Print Directory"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void loadSuppliers()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Table Card */}
      <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.25rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ width: "320px" }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search suppliers by name, phone, or GST..."
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Showing {filteredSuppliers.length} suppliers
            </span>
            <Button type="button" variant="secondary" onClick={handleExportSuppliersCsv} disabled={filteredSuppliers.length === 0}>
              Export CSV
            </Button>
          </div>
        </div>

        {filteredSuppliers.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Supplier Name</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Contact Person</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Phone / Mobile</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>GST Number</th>
                  <th style={{ padding: "0.6rem 0.75rem" }}>Status</th>
                  <th style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.6rem 0.75rem", fontWeight: 700, color: "#0f172a" }}>
                      {s.supplier_name}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>
                      {s.contact_person || "-"}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>
                      {s.phone || "-"}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "#64748b", fontFamily: "monospace" }}>
                      {s.gst_number || "-"}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <button
                        type="button"
                        disabled={updatingStatusId === s.id}
                        onClick={() => void handleToggleStatus(s)}
                        title={`Click to switch status to ${s.status === "active" ? "inactive" : "active"}`}
                        style={{
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: updatingStatusId === s.id ? "wait" : "pointer",
                          border: s.status === "active" ? "1px solid #86efac" : "1px solid #cbd5e1",
                          background: s.status === "active" ? "#dcfce7" : "#f1f5f9",
                          color: s.status === "active" ? "#166534" : "#64748b",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          textTransform: "capitalize",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            background: s.status === "active" ? "#22c55e" : "#94a3b8",
                          }}
                        />
                        {updatingStatusId === s.id ? "Updating..." : s.status}
                      </button>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        <Button
                          type="button"
                          variant="secondary"
                          style={{ padding: "2px 10px", fontSize: "0.78rem" }}
                          onClick={() => void handleOpenLedger(s.id)}
                        >
                          View Ledger
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          style={{ padding: "2px 10px", fontSize: "0.78rem" }}
                          onClick={() => handleOpenEdit(s)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          style={{
                            padding: "2px 10px",
                            fontSize: "0.78rem",
                            color: "#dc2626",
                            borderColor: "#fecaca",
                            backgroundColor: "#fff5f5",
                          }}
                          onClick={() => setSupplierToDelete(s)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "2.5rem", color: "#94a3b8" }}>
            <p style={{ margin: 0, fontSize: "0.95rem" }}>No suppliers found.</p>
            <Button
              type="button"
              className="primary"
              style={{ marginTop: "1rem", background: "#00828a", borderColor: "#00828a" }}
              onClick={handleOpenAdd}
            >
              + Add First Supplier
            </Button>
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      {modalOpen && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
          <div style={{ padding: "1.5rem", maxWidth: "550px" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>
              {editingSupplier ? `Edit Supplier: ${editingSupplier.supplier_name}` : "Add New Pharmaceutical Supplier"}
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>
              Compliant GST and drug license details for procurement invoices and GRN inwarding.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Supplier / Agency Name *:
                </label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Apollo Medico Distributors"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Contact Person:
                </label>
                <Input
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  placeholder="Manager / Sales Exec"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Mobile / Phone (10 digits):
                </label>
                <Input
                  value={formPhone}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setFormPhone(clean);
                  }}
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  inputMode="numeric"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Email Address:
                </label>
                <Input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="orders@supplier.com"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Status:
                </label>
                <select
                  className="ui-input"
                  style={{ width: "100%", padding: "0.45rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff", fontSize: "0.85rem" }}
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as "active" | "inactive")}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  GST Number:
                </label>
                <Input
                  value={formGst}
                  onChange={(e) => setFormGst(e.target.value)}
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Drug License No:
                </label>
                <Input
                  value={formDrugLic}
                  onChange={(e) => setFormDrugLic(e.target.value)}
                  placeholder="DL-09876"
                />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Address:
                </label>
                <Input
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Warehouse / Office address"
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="primary"
                style={{ background: "#00828a", borderColor: "#00828a", fontWeight: 700 }}
                disabled={submittingForm}
                onClick={handleSaveSupplier}
              >
                {submittingForm ? "Saving..." : "Save Supplier"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {supplierToDelete && (
        <Modal open={Boolean(supplierToDelete)} onClose={() => !deleting && setSupplierToDelete(null)}>
          <div style={{ padding: "1.5rem", maxWidth: "460px" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#dc2626" }}>Delete Supplier</h3>
            <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.875rem", color: "#475569", lineHeight: "1.5" }}>
              Are you sure you want to delete supplier <strong>{supplierToDelete.supplier_name}</strong>?
              This action will permanently remove the supplier record.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <Button
                type="button"
                variant="secondary"
                disabled={deleting}
                onClick={() => setSupplierToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                style={{
                  background: "#dc2626",
                  borderColor: "#dc2626",
                  color: "#ffffff",
                  fontWeight: 700,
                }}
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Supplier Ledger Modal */}
      {ledgerModalOpen && (
        <Modal open={ledgerModalOpen} onClose={() => setLedgerModalOpen(false)}>
          <div style={{ padding: "1.5rem", maxWidth: "820px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: "0 0 2px 0", color: "#0f172a" }}>
                  Supplier Financial Ledger: {selectedLedger?.supplier?.supplier_name || "Supplier"}
                </h3>
                <span style={{ fontSize: "0.825rem", color: "#64748b" }}>
                  GST: {selectedLedger?.supplier?.gst_number || "N/A"} · Contact: {selectedLedger?.supplier?.phone || "N/A"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button
                  type="button"
                  variant="secondary"
                  style={{ padding: "4px 12px", fontSize: "0.8rem" }}
                  onClick={() => void handlePrintSupplierLedger()}
                  disabled={printingLedger}
                  title="Generate and print supplier account ledger PDF"
                >
                  {printingLedger ? "Generating..." : "Print Ledger"}
                </Button>
                <Button
                  type="button"
                  className="primary"
                  style={{ background: "#00828a", borderColor: "#00828a", padding: "4px 12px", fontSize: "0.8rem" }}
                  onClick={() => {
                    setPayAmount("");
                    setPayRef("");
                    setPaymentModalOpen(true);
                  }}
                >
                  + Record Payment
                </Button>
              </div>
            </div>

            {/* Financial Balance Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <div style={{ background: "#f8fafc", padding: "0.85rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Total Inward Purchases</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a" }}>
                  ₹{(selectedLedger?.total_purchases || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ background: "#f0fdf4", padding: "0.85rem", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                <div style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 600 }}>Total Payments Made</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#16a34a" }}>
                  ₹{(selectedLedger?.total_paid || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ background: "#fef2f2", padding: "0.85rem", borderRadius: "8px", border: "1px solid #fecaca" }}>
                <div style={{ fontSize: "0.75rem", color: "#991b1b", fontWeight: 600 }}>Outstanding Balance</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#dc2626" }}>
                  ₹{((selectedLedger?.outstanding ?? selectedLedger?.outstanding_balance) || 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Recent Orders / GRNs */}
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", color: "#0f172a" }}>
              Recent Purchase Orders & Deliveries
            </h4>
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              <table className="pharmacy-data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "0.45rem" }}>Date</th>
                    <th style={{ padding: "0.45rem" }}>Ref / Type</th>
                    <th style={{ padding: "0.45rem" }}>Medicine</th>
                    <th style={{ padding: "0.45rem", textAlign: "center" }}>Qty</th>
                    <th style={{ padding: "0.45rem", textAlign: "right" }}>Total Cost</th>
                    <th style={{ padding: "0.45rem" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLedger?.purchases && selectedLedger.purchases.length > 0 ? (
                    selectedLedger.purchases.map((p) => {
                      const isGrn = p.type === "GRN" || (p.entry_type && p.entry_type.includes("Delivery"));
                      const isPr = p.type === "PR" || (p.entry_type && p.entry_type.includes("Request"));
                      const badgeColor = isGrn
                        ? { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0", label: "Delivery" }
                        : isPr
                        ? { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe", label: "Requisition" }
                        : { bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4", label: "PO Order" };

                      const statusLower = (p.status || "").toLowerCase();
                      const isPositive = statusLower.includes("verified") || statusLower.includes("approved") || statusLower.includes("ordered");
                      const isNegative = statusLower.includes("rejected") || statusLower.includes("cancelled");

                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "0.45rem", color: "#64748b", whiteSpace: "nowrap" }}>
                            {p.created_at ? formatDateOnlyIST(p.created_at) : "-"}
                          </td>
                          <td style={{ padding: "0.45rem", whiteSpace: "nowrap" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "4px",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                background: badgeColor.bg,
                                color: badgeColor.text,
                                border: `1px solid ${badgeColor.border}`,
                              }}
                            >
                              {p.entry_type || badgeColor.label}
                            </span>
                            {p.ref_no && (
                              <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "2px" }}>
                                {p.ref_no}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "0.45rem", fontWeight: 600 }}>{p.medicine_name}</td>
                          <td style={{ padding: "0.45rem", textAlign: "center" }}>{p.quantity}</td>
                          <td style={{ padding: "0.45rem", textAlign: "right", fontWeight: 700 }}>
                            ₹{Number(p.total_cost || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: "0.45rem" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "4px",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                background: isPositive ? "#f0fdf4" : isNegative ? "#fef2f2" : "#fffbeb",
                                color: isPositive ? "#166534" : isNegative ? "#991b1b" : "#92400e",
                                border: `1px solid ${isPositive ? "#bbf7d0" : isNegative ? "#fecaca" : "#fef08a"}`,
                              }}
                            >
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8" }}>
                        No orders recorded for this supplier.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <Button type="button" variant="secondary" onClick={() => setLedgerModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Record Payment Modal */}
      {paymentModalOpen && (
        <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)}>
          <div style={{ padding: "1.5rem", maxWidth: "450px" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>Record Supplier Disbursement</h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>
              Supplier: <strong>{selectedLedger?.supplier?.supplier_name}</strong>
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Payment Amount (₹) *:
              </label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={payAmount}
                placeholder="0.00"
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Payment Mode:
              </label>
              <select
                className="ui-input"
                style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                value={payMode}
                onChange={(e) => setPayMode(e.target.value)}
              >
                <option value="bank_transfer">Bank Transfer / NEFT / RTGS</option>
                <option value="cheque">Bank Cheque</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                Transaction / UTR / Cheque Ref:
              </label>
              <Input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="e.g. UTR-8829103"
              />
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={() => setPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="primary"
                style={{ background: "#00828a", borderColor: "#00828a" }}
                onClick={handleRecordPayment}
              >
                Confirm Payment
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
