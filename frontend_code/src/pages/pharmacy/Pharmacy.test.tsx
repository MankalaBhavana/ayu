import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PharmacyOverview from "./PharmacyOverview";
import PharmacyOpDispense from "./PharmacyOpDispense";
import PharmacyIpDispense from "./PharmacyIpDispense";

// Mock apiFetch
vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn().mockImplementation((url: string) => {
    if (url.includes("/summary")) {
      return Promise.resolve({
        sales_today: 12500,
        sales_total: 850000,
        low_stock_count: 3,
        out_of_stock_count: 1,
        cash_stock_value: 450000,
        insurance_stock_value: 120000,
        expired_count: 2,
        expiring_1m: 4,
        expiring_1_3m: 8,
        expiring_3_6m: 15,
        top_medicines: [
          { medicine_name: "Paracetamol 500mg", total_qty: 450 },
          { medicine_name: "Amoxicillin 500mg", total_qty: 210 },
        ],
      });
    }
    if (url.includes("/sales")) {
      return Promise.resolve({ sales: [] });
    }
    if (url.includes("/stock")) {
      return Promise.resolve({
        batches: [
          {
            id: 1,
            medicine_name: "Paracetamol 500mg Tab",
            batch_no: "BTH-001",
            expiry_date: "2027-01-01",
            qty_available: 50,
            unit_price: 2.5,
            mrp: 3.0,
            stock_source: "CASH",
          },
        ],
      });
    }
    if (url.includes("/ward-indents")) {
      return Promise.resolve({ indents: [] });
    }
    if (url.includes("/admissions")) {
      return Promise.resolve({ admissions: [] });
    }
    return Promise.resolve({});
  }),
  reportError: vi.fn(),
  getHospitalCode: vi.fn().mockReturnValue("SRI_RAKSHA"),
}));

describe("Pharmacy Module Architecture", () => {
  it("renders PharmacyOverview with 6 KPI cards, quick actions, and no Prescription Queue", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacyOverview setNotice={setNotice} onNavigate={onNavigate} />);

    expect(screen.getByText("Pharmacy Overview")).toBeDefined();
    expect(screen.getByText("Safe Medicines. Better Care.")).toBeDefined();
    expect(screen.getByText("Today's Sales")).toBeDefined();
    expect(screen.getByText("OP Sales")).toBeDefined();
    expect(screen.getByText("IPD Pharmacy Charges")).toBeDefined();
    expect(screen.getByText("Emergency Sales")).toBeDefined();
    expect(screen.getByText("Stock Value")).toBeDefined();
    expect(screen.getByText("Near Expiry")).toBeDefined();

    // Verify there is NO Prescription Queue anywhere in the overview
    expect(screen.queryByText(/Prescription Queue/i)).toBeNull();
    expect(screen.queryByText(/Prescription Inbox/i)).toBeNull();
  });

  it("renders PharmacyOpDispense with patient verification, FEFO medicines, cart, and returns tab", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacyOpDispense setNotice={setNotice} onNavigate={onNavigate} />);

    expect(screen.getAllByText("OP Dispense").length).toBeGreaterThan(0);
    expect(screen.getByText("1. Patient Verification")).toBeDefined();
    expect(screen.getByText(/2. Select Medicines/i)).toBeDefined();
    expect(screen.getByText(/3. Prescription Cart/i)).toBeDefined();
    expect(screen.getByText(/4. Billing & Dispense Confirmation/i)).toBeDefined();

    // Verify no queue
    expect(screen.queryByText(/Prescription Queue/i)).toBeNull();
  });

  it("renders PharmacyIpDispense with Ward Indents, hospital billing note, and IPD returns", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacyIpDispense setNotice={setNotice} onNavigate={onNavigate} />);

    expect(screen.getAllByText("IP Dispense").length).toBeGreaterThan(0);
    expect(screen.getByText("Ward Indents & Orders")).toBeDefined();
    expect(screen.getByText("IPD Returns")).toBeDefined();
    expect(screen.getByText(/Main Hospital Billing Integration:/i)).toBeDefined();

    // Verify no queue
    expect(screen.queryByText(/Prescription Queue/i)).toBeNull();
  });

  it("handles tab switching and renders Direct Dispense, Ward Indents, and IPD Returns", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacyIpDispense setNotice={setNotice} onNavigate={onNavigate} />);

    // Direct tab should show step 1 search
    expect(screen.getByText(/Step 1: Search & Select Admitted Inpatient/i)).toBeDefined();

    // Switch to Ward Indents
    const indentsBtn = screen.getByRole("button", { name: /Ward Indents & Orders/i });
    fireEvent.click(indentsBtn);
    expect(screen.getByText("+ New Medication Order")).toBeDefined();
    expect(screen.getByText("PARTIALLY ISSUED")).toBeDefined();

    // Switch to IPD Returns
    const returnsBtn = screen.getByRole("button", { name: /IPD Returns/i });
    fireEvent.click(returnsBtn);
    expect(screen.getByText(/Inpatient Medication Returns & Bill Reversals/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/Enter Patient UHID/i)).toBeDefined();
  });
});

