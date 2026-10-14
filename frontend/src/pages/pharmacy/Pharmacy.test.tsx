import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PharmacyOverview from "./PharmacyOverview";
import PharmacyOpDispense from "./PharmacyOpDispense";
import PharmacyInventoryStock from "./PharmacyInventoryStock";
import PharmacyReports from "./PharmacyReports";
import { printViaIframe } from "../../lib/printViaIframe";
import { PRINT_BRAND_HEADER_DATA_URI } from "../../lib/printBrand";


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
          {
            id: 2,
            medicine_name: "citrezin",
            batch_no: "EXPIRED-01",
            expiry_date: "2000-01-01",
            qty_available: 15,
            unit_price: 25,
            mrp: 30,
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

vi.mock("../../lib/printViaIframe", () => ({ printViaIframe: vi.fn() }));

describe("Pharmacy Module Architecture", () => {
  it("renders PharmacyOverview with 5 KPI cards, quick actions, and no Prescription Queue", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacyOverview setNotice={setNotice} onNavigate={onNavigate} />);

    expect(screen.getByText("Pharmacy Overview")).toBeDefined();
    expect(screen.getByText("Safe Medicines. Better Care.")).toBeDefined();
    expect(screen.getByText("Today's Sales")).toBeDefined();
    expect(screen.getByText("OP Sales")).toBeDefined();
    expect(screen.queryByText("IPD Pharmacy Charges")).toBeNull();
    expect(screen.queryByText("Emergency Sales")).toBeNull();
    expect(screen.getByText("Stock Value")).toBeDefined();
    expect(screen.getByText("Near Expiry")).toBeDefined();

    // Verify there is NO Prescription Queue anywhere in the overview
    expect(screen.queryByText(/Prescription Queue/i)).toBeNull();
    expect(screen.queryByText(/Prescription Inbox/i)).toBeNull();
  });

  it("marks expired-only medicine stock as Expired in Inventory", async () => {
    render(<PharmacyInventoryStock setNotice={vi.fn()} onNavigate={vi.fn()} />);

    const medicineCell = await screen.findByText("citrezin");
    expect(medicineCell.closest("tr")?.textContent).toContain("Expired");
    expect(medicineCell.closest("tr")?.textContent).not.toContain("In Stock");
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

  it("shows expired stock in OP Dispense as unavailable instead of silently hiding it", async () => {
    render(<PharmacyOpDispense setNotice={vi.fn()} onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search by Brand Name, Generic Name, Code, or scan Barcode..."), {
      target: { value: "citrezin" },
    });

    const expiredOption = await screen.findByRole("option", { name: /citrezin.*Expired.*Not available for dispensing/i });
    expect(expiredOption.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("citrezin is expired and unavailable for dispensing");
    expect(screen.queryByText(/FEFO Pick/)).toBeNull();
  });

  it("prints Pharmacy Reports with the Ayu logo and bottom-aligned clinic footer", async () => {
    render(<PharmacyReports setNotice={vi.fn()} onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Print Report" }));

    const [html, frameId, options] = vi.mocked(printViaIframe).mock.calls[0];
    expect(html).toContain(`src="${PRINT_BRAND_HEADER_DATA_URI}"`);
    expect(html).toContain('class="custom-report-header"');
    expect(html).toContain('class="custom-report-brand-name">AYU CLINIC</strong>');
    expect(html).toContain("gap: 8px");
    expect(html).toContain("width: 24mm; height: 22mm");
    expect(frameId).toBe("__hospai_pharmacy_reports_print_frame__");
    expect(options).toEqual(expect.objectContaining({
      preserveDocumentHeader: true,
      footerAtBottom: true,
      suppressBrowserHeadersAndFooters: true,
      includeSignature: false,
    }));
  });

});

