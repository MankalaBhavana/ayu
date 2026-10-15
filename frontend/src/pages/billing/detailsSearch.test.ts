import { describe, expect, test } from "vitest";
import { filterDetailRecords } from "./detailsSearch";

const records = [
  { id: 54, reference_no: "INV-PHM-20261016000546236802", patient_id: "PAT-20261013-0014", patient_name: "shivani kumari", type: "bill_payment", module: "PHARMACY", mode: "UPI", amount: 255.36, cashier: "Main Cashier", notes: "Settlement for INV-PHM-20261016000546236802", time: "16 Oct 12:05 AM" },
  { id: 52, reference_no: "INV-OP-20261015233140698655", patient_id: "PAT-20261015-0029", patient_name: "kusuma k", type: "bill_payment", module: "OP", mode: "UPI", amount: 800, cashier: "Main Cashier", notes: "Settlement for INV-OP-20261015233140698655", time: "15 Oct 11:31 PM" },
  { id: 48, reference_no: "RCP-ADV-0007", patient_id: "PAT-20261015-0028", patient_name: "veda sahithi", type: "advance", module: "General", mode: "CASH", amount: 1000, cashier: "admin", notes: "-", time: "15 Oct 04:18 PM" },
];
const ids = (q: string) => filterDetailRecords(records, q).map((r) => r.id);

describe("Billing Overview details search", () => {
  test("empty query returns everything", () => {
    expect(ids("  ")).toEqual([54, 52, 48]);
  });

  test("matches bill number, patient id and name case-insensitively", () => {
    expect(ids("inv-op")).toEqual([52]);
    expect(ids("PAT-20261013")).toEqual([54]);
    expect(ids("KUSUMA")).toEqual([52]);
  });

  test("matches module, mode, type label, date and amount as displayed", () => {
    expect(ids("pharmacy")).toEqual([54]);
    expect(ids("cash")).toEqual([48]);
    expect(ids("advance deposit")).toEqual([48]);
    expect(ids("bill settlement")).toEqual([54, 52]);
    expect(ids("16 oct")).toEqual([54]);
    expect(ids("₹1,000.00")).toEqual([48]);
    expect(ids("255.36")).toEqual([54]);
  });

  test("requires every word to match", () => {
    expect(ids("upi kusuma")).toEqual([52]);
    expect(ids("upi veda")).toEqual([]);
  });
});
