const fmtAmount = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Text a details row can be searched by: every value the row displays (cashier is not shown, and
 * would make "cash" match every "Main Cashier" row). */
function searchableText(r: any): string {
  const amount = Number(r.amount ?? r.total_amount ?? 0);
  return [
    r.reference_no, r.invoice_no, r.patient_name, r.patient_id, r.mode, r.module,
    r.status, r.notes, r.time, r.created_at,
    r.type, r.type === "advance" ? "Advance Deposit" : r.type ? "Bill Settlement" : "",
    amount.toFixed(2), fmtAmount(amount),
    r.paid_amount != null ? fmtAmount(r.paid_amount) : "",
    r.due_amount != null ? fmtAmount(r.due_amount) : "",
  ]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => String(v).toLowerCase())
    .join(" | ");
}

/** Filters Billing Overview detail rows; every word in the query must match somewhere in the row. */
export function filterDetailRecords<T>(records: T[], query: string): T[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map((t) => t.replace(/[₹,]/g, "")).filter(Boolean);
  if (tokens.length === 0) return records;
  return records.filter((r) => {
    const text = searchableText(r);
    const plain = text.replace(/,/g, "");
    return tokens.every((token) => text.includes(token) || plain.includes(token));
  });
}
