import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Label, Modal, Select } from "../components/ui";
import { apiFetch, reportError } from "../lib/api";
import { printViaIframe } from "../lib/printViaIframe";
import type { Notice } from "../types";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
};

type Invoice = {
  id: number;
  invoice_no: string;
  patient_id: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_status: "paid" | "due" | "partial" | string;
  created_at?: string;
};

type InsuranceCase = {
  id: number;
  invoice_id: number;
  patient_id: string;
  insurer_name: string;
  claim_amount: number;
  approved_amount: number;
  claim_status: "draft" | "submitted" | "under_review" | "approved" | "partially_approved" | "rejected" | "closed" | string;
  settlement_status: "unpaid" | "part_paid" | "paid" | "adjusted" | string;
  patient_responsibility: number;
  submitted_at?: string;
};

const CLAIM_STATUSES = ["draft", "submitted", "under_review", "approved", "partially_approved", "rejected", "closed"] as const;

export default function PharmacyBillingInsurancePage({ setNotice }: Props) {
  const [tab, setTab] = useState<"bills" | "collections" | "insurance-cases" | "settlements">("bills");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cases, setCases] = useState<InsuranceCase[]>([]);
  const [loading, setLoading] = useState(false);

  const loadInvoices = async () => {
    try {
      const data = await apiFetch<{ invoices?: Invoice[] }>("/api/pharmacy/invoices");
      setInvoices(data.invoices || []);
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to load pharmacy bills.");
    }
  };
  const loadCases = async () => {
    try {
      const data = await apiFetch<{ cases?: InsuranceCase[] }>("/api/pharmacy/insurance-cases");
      setCases(data.cases || []);
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to load insurance cases.");
    }
  };

  useEffect(() => {
    if (tab === "bills" || tab === "collections") void loadInvoices();
    if (tab === "insurance-cases" || tab === "settlements") void loadCases();
  }, [tab]);

  // ---------- Collections (record a payment against a due invoice) ----------
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", payment_mode: "cash" });
  const openPay = (inv: Invoice) => { setPayInvoice(inv); setPayForm({ amount: String(inv.due_amount || 0), payment_mode: "cash" }); setPayModalOpen(true); };
  const submitPay = async () => {
    if (!payInvoice || !payForm.amount || Number(payForm.amount) <= 0) { setNotice({ type: "warning", message: "Enter a valid amount." }); return; }
    setLoading(true);
    try {
      await apiFetch(`/api/pharmacy/invoices/${payInvoice.id}/payment`, { method: "POST", body: JSON.stringify({ amount: Number(payForm.amount), payment_mode: payForm.payment_mode }) });
      setNotice({ type: "success", message: `Payment recorded on ${payInvoice.invoice_no}. Stock is unaffected -- payment method never changes inventory source.` });
      setPayModalOpen(false);
      await loadInvoices();
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to record payment.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Insurance case status update ----------
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [caseEditing, setCaseEditing] = useState<InsuranceCase | null>(null);
  const [caseForm, setCaseForm] = useState({ claim_status: "draft", approved_amount: "0", external_ref: "" });
  const openCase = (c: InsuranceCase) => { setCaseEditing(c); setCaseForm({ claim_status: c.claim_status, approved_amount: String(c.approved_amount || 0), external_ref: "" }); setCaseModalOpen(true); };
  const saveCase = async () => {
    if (!caseEditing) return;
    setLoading(true);
    try {
      await apiFetch(`/api/pharmacy/insurance-cases/${caseEditing.id}`, {
        method: "PUT",
        body: JSON.stringify({ claim_status: caseForm.claim_status, approved_amount: Number(caseForm.approved_amount) || 0, external_ref: caseForm.external_ref || undefined }),
      });
      setNotice({ type: "success", message: `Case #${caseEditing.id} updated. Never affects stock.` });
      setCaseModalOpen(false);
      await loadCases();
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to update insurance case.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Settlement ----------
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settleCase, setSettleCase] = useState<InsuranceCase | null>(null);
  const [settleForm, setSettleForm] = useState({ amount: "", payment_mode: "bank_transfer", reference: "" });
  const openSettle = (c: InsuranceCase) => { setSettleCase(c); setSettleForm({ amount: String(Math.max((c.claim_amount || 0) - 0, 0)), payment_mode: "bank_transfer", reference: "" }); setSettleModalOpen(true); };
  const submitSettle = async () => {
    if (!settleCase || !settleForm.amount || Number(settleForm.amount) <= 0) { setNotice({ type: "warning", message: "Enter a valid settlement amount." }); return; }
    setLoading(true);
    try {
      const result = await apiFetch<{ settlement_status: string }>(`/api/pharmacy/insurance-cases/${settleCase.id}/settle`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(settleForm.amount), payment_mode: settleForm.payment_mode, reference: settleForm.reference || undefined }),
      });
      setNotice({ type: "success", message: `Case #${settleCase.id} settlement recorded — now ${result.settlement_status}. Stock pools are never touched by settlement.` });
      setSettleModalOpen(false);
      await loadCases();
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to record settlement.");
    } finally {
      setLoading(false);
    }
  };

  const dueInvoices = invoices.filter((i) => i.payment_status !== "paid" && (i.due_amount || 0) > 0);

  const printInvoice = async (inv: Invoice) => {
    try {
      const data = await apiFetch<{ sales?: { medicine_name: string; quantity: number; unit_price: number; amount: number; stock_source?: string }[] }>(`/api/pharmacy/sales?invoice_id=${inv.id}`);
      const lines = data.sales || [];
      const statusLabel = inv.payment_status === "paid" ? "PAID" : Number(inv.paid_amount) > 0 ? "PART-PAID" : "UNPAID / OUTSTANDING";
      const rows = lines.map((l) => `<tr><td>${l.medicine_name}</td><td>${l.stock_source === "CASH" ? "Cash Stock" : l.stock_source === "INSURANCE" ? "Insurance Stock" : (l.stock_source || "-")}</td><td>${l.quantity}</td><td>${Number(l.unit_price).toFixed(2)}</td><td>${Number(l.amount).toFixed(2)}</td></tr>`).join("");
      printViaIframe(`
        <html><head><title>Pharmacy Invoice ${inv.invoice_no}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; color: #142B45; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #DDE5E7; padding: 6px 8px; text-align: left; }
          th { background: #F5F8F7; }
          .status { font-weight: 700; font-size: 14px; margin-top: 10px; }
          .status.outstanding { color: #a15b04; }
          .status.paid { color: #157a3d; }
        </style>
        </head><body>
          <h2>Pharmacy Invoice — ${inv.invoice_no}</h2>
          <p>Patient: ${inv.patient_id}</p>
          <table><thead><tr><th>Medicine</th><th>Source</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
          <p>Total: ₹${Number(inv.total_amount).toFixed(2)} &nbsp; Paid: ₹${Number(inv.paid_amount).toFixed(2)} &nbsp; Due: ₹${Number(inv.due_amount).toFixed(2)}</p>
          <p class="status ${inv.payment_status === "paid" ? "paid" : "outstanding"}">Status: ${statusLabel}</p>
        </body></html>
      `);
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to prepare invoice for printing.");
    }
  };

  const tabBar = (
    <div className="pharmacy-tabs">
      {(["bills", "collections", "insurance-cases", "settlements"] as const).map((t) => (
        <button key={t} type="button" className={`pharmacy-tab-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
          {t === "bills" ? "Bills" : t === "collections" ? "Collections" : t === "insurance-cases" ? "Insurance Cases" : "Settlements"}
        </button>
      ))}
    </div>
  );

  return (
    <section className="module-page pharmacy-scope">
      {tabBar}

      {tab === "bills" && (
        <div className="panel">
          <p className="muted">All pharmacy bills. An insurance bill stays visibly outstanding until fully settled — it is never marked Paid just because it was dispensed.</p>
          <div className="pharmacy-table-wrap">
            <table className="pharmacy-table">
              <thead><tr><th>Invoice No.</th><th>Patient</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {invoices.length === 0 && <tr className="pharmacy-empty-row"><td colSpan={7}>No pharmacy bills yet.</td></tr>}
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td><strong>{inv.invoice_no}</strong></td>
                    <td>{inv.patient_id}</td>
                    <td>₹{Number(inv.total_amount).toFixed(2)}</td>
                    <td>₹{Number(inv.paid_amount).toFixed(2)}</td>
                    <td>₹{Number(inv.due_amount).toFixed(2)}</td>
                    <td>
                      {inv.payment_status === "paid" && <span className="pharmacy-pill pharmacy-pill-ok">Paid</span>}
                      {inv.payment_status !== "paid" && (Number(inv.paid_amount) > 0 ? <span className="pharmacy-pill pharmacy-pill-warn">Part-paid</span> : <span className="pharmacy-pill pharmacy-pill-danger">Unpaid</span>)}
                    </td>
                    <td><Button variant="ghost" onClick={() => printInvoice(inv)}>Print</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "collections" && (
        <div className="panel">
          <p className="muted">Outstanding balances to collect (patient co-pays and any unpaid cash balance). Recording a payment here never changes stock.</p>
          <div className="pharmacy-table-wrap">
            <table className="pharmacy-table">
              <thead><tr><th>Invoice No.</th><th>Patient</th><th>Due</th><th></th></tr></thead>
              <tbody>
                {dueInvoices.length === 0 && <tr className="pharmacy-empty-row"><td colSpan={4}>Nothing outstanding to collect.</td></tr>}
                {dueInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td><strong>{inv.invoice_no}</strong></td>
                    <td>{inv.patient_id}</td>
                    <td>₹{Number(inv.due_amount).toFixed(2)}</td>
                    <td><Button variant="primary" onClick={() => openPay(inv)}>Record Payment</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "insurance-cases" && (
        <div className="panel">
          <p className="muted">Claim-processing lifecycle — distinct from whether money has actually been collected (see Settlements).</p>
          <div className="pharmacy-table-wrap">
            <table className="pharmacy-table">
              <thead><tr><th>Case</th><th>Patient</th><th>Insurer</th><th>Claim Amount</th><th>Approved</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {cases.length === 0 && <tr className="pharmacy-empty-row"><td colSpan={7}>No insurance cases yet.</td></tr>}
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td>#{c.id}</td>
                    <td>{c.patient_id}</td>
                    <td>{c.insurer_name}</td>
                    <td>₹{Number(c.claim_amount).toFixed(2)}</td>
                    <td>₹{Number(c.approved_amount || 0).toFixed(2)}</td>
                    <td><span className="pharmacy-pill pharmacy-pill-muted">{c.claim_status}</span></td>
                    <td><Button variant="ghost" onClick={() => openCase(c)}>Update</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "settlements" && (
        <div className="panel">
          <p className="muted">Money actually received from the insurer or patient. Settlement never changes Cash Stock or Insurance Stock.</p>
          <div className="pharmacy-table-wrap">
            <table className="pharmacy-table">
              <thead><tr><th>Case</th><th>Patient</th><th>Claim Amount</th><th>Co-pay</th><th>Settlement</th><th></th></tr></thead>
              <tbody>
                {cases.length === 0 && <tr className="pharmacy-empty-row"><td colSpan={6}>No insurance cases yet.</td></tr>}
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td>#{c.id}</td>
                    <td>{c.patient_id}</td>
                    <td>₹{Number(c.claim_amount).toFixed(2)}</td>
                    <td>₹{Number(c.patient_responsibility || 0).toFixed(2)}</td>
                    <td>
                      {c.settlement_status === "paid" && <span className="pharmacy-pill pharmacy-pill-ok">Paid</span>}
                      {c.settlement_status === "part_paid" && <span className="pharmacy-pill pharmacy-pill-warn">Part-paid</span>}
                      {c.settlement_status === "unpaid" && <span className="pharmacy-pill pharmacy-pill-danger">Unpaid</span>}
                      {c.settlement_status === "adjusted" && <span className="pharmacy-pill pharmacy-pill-muted">Adjusted</span>}
                    </td>
                    <td>{c.settlement_status !== "paid" && <Button variant="primary" onClick={() => openSettle(c)}>Record Settlement</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={payModalOpen} onClose={() => setPayModalOpen(false)} title={`Record Payment${payInvoice ? ` — ${payInvoice.invoice_no}` : ""}`}>
        <div className="pharmacy-form-grid">
          <Label>Amount (₹)<Input type="number" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} /></Label>
          <Label>Payment Mode
            <Select value={payForm.payment_mode} onChange={(e) => setPayForm((p) => ({ ...p, payment_mode: e.target.value }))}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
            </Select>
          </Label>
        </div>
        <Button variant="primary" disabled={loading} onClick={submitPay} style={{ marginTop: "0.75rem" }}>Record Payment</Button>
      </Modal>

      <Modal open={caseModalOpen} onClose={() => setCaseModalOpen(false)} title={`Update Insurance Case${caseEditing ? ` #${caseEditing.id}` : ""}`}>
        <div className="pharmacy-form-grid">
          <Label>Claim Status
            <Select value={caseForm.claim_status} onChange={(e) => setCaseForm((p) => ({ ...p, claim_status: e.target.value }))}>
              {CLAIM_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </Select>
          </Label>
          <Label>Approved Amount (₹)<Input type="number" value={caseForm.approved_amount} onChange={(e) => setCaseForm((p) => ({ ...p, approved_amount: e.target.value }))} /></Label>
          <Label>External Reference<Input value={caseForm.external_ref} onChange={(e) => setCaseForm((p) => ({ ...p, external_ref: e.target.value }))} /></Label>
        </div>
        <Button variant="primary" disabled={loading} onClick={saveCase} style={{ marginTop: "0.75rem" }}>Save</Button>
      </Modal>

      <Modal open={settleModalOpen} onClose={() => setSettleModalOpen(false)} title={`Record Settlement${settleCase ? ` — Case #${settleCase.id}` : ""}`} description="Full or partial. This determines whether the bill can be marked Paid; it never touches stock.">
        <div className="pharmacy-form-grid">
          <Label>Amount Received (₹)<Input type="number" value={settleForm.amount} onChange={(e) => setSettleForm((p) => ({ ...p, amount: e.target.value }))} /></Label>
          <Label>Payment Mode
            <Select value={settleForm.payment_mode} onChange={(e) => setSettleForm((p) => ({ ...p, payment_mode: e.target.value }))}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
            </Select>
          </Label>
          <Label>Reference<Input value={settleForm.reference} onChange={(e) => setSettleForm((p) => ({ ...p, reference: e.target.value }))} /></Label>
        </div>
        <Button variant="primary" disabled={loading} onClick={submitSettle} style={{ marginTop: "0.75rem" }}>Record Settlement</Button>
      </Modal>
    </section>
  );
}
