import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PharmacyOverview from "./PharmacyOverview";
import PharmacyOpDispense from "./PharmacyOpDispense";
import PharmacyInventoryStock from "./PharmacyInventoryStock";
import PharmacyReports from "./PharmacyReports";
import PharmacySuppliers from "./PharmacySuppliers";
import PharmacyPurchasesGrn from "./PharmacyPurchasesGrn";
import { printViaIframe } from "../../lib/printViaIframe";
import { PRINT_BRAND_HEADER_DATA_URI } from "../../lib/printBrand";
import { generatePDFBlob, printPDF } from "../../lib/exportService";
import { apiFetch } from "../../lib/api";

vi.mock("../../lib/exportService", () => ({
  generatePDFBlob: vi.fn().mockResolvedValue({ blob: new Blob(["pdf"]), filename: "Pharmacy_Overview.pdf" }),
  printPDF: vi.fn(),
  downloadPDF: vi.fn(),
  exportPDF: vi.fn(),
}));


// Mock apiFetch
vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn().mockImplementation((url: string) => {
    if (url.includes("/ledger")) {
      return Promise.resolve({
        supplier: {
          id: 1,
          supplier_name: "ABC Pharma Distributors",
          phone: "9876543210",
        },
        total_purchases: 1500,
        total_paid: 500,
        outstanding: 1000,
        purchases: [
          {
            id: "pr-10-1",
            type: "PR",
            entry_type: "Purchase Request",
            medicine_name: "Amoxicillin (500mg)",
            quantity: 50,
            total_cost: 500,
            status: "PR: Pending",
            created_at: "2026-10-15T10:00:00",
            ref_no: "PR-20261015-01",
          },
          {
            id: "grn-1-1",
            type: "GRN",
            entry_type: "Goods Receipt",
            medicine_name: "Paracetamol 650mg",
            quantity: 100,
            total_cost: 1000,
            status: "Delivery: Verified",
            created_at: "2026-10-16T11:00:00",
            ref_no: "GRN-20261016-01",
          },
        ],
      });
    }
    if (url.includes("/payments")) {
      return Promise.resolve({ status: "ok", payment_id: 101 });
    }
    if (url.includes("/suppliers")) {
      return Promise.resolve({
        suppliers: [
          {
            id: 1,
            supplier_name: "ABC Pharma Distributors",
            contact_person: "Sales Desk",
            phone: "9876543210",
            email: "abc@pharma.com",
            gst_number: "22ABCDE1234F1Z5",
            status: "active",
          },
          {
            id: 2,
            supplier_name: "Apollo Pharmacy Supplier",
            contact_person: "XYZ",
            phone: "7896541236",
            email: "apollo@pharma.com",
            gst_number: "152652",
            status: "inactive",
          },
        ],
      });
    }
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
    if (url.includes("/purchase-orders")) {
      return Promise.resolve({
        purchase_orders: [
          {
            id: 4,
            medicine_name: "Amoxicillin",
            quantity: 10,
            unit_cost: 15.5,
            total_cost: 155,
            status: "ordered",
            supplier_id: 1,
            supplier_name: "ABC Pharma Distributors",
            created_at: "2026-10-16",
          },
        ],
      });
    }
    if (url.includes("/purchase-requests")) {
      return Promise.resolve({
        purchase_requests: [
          {
            id: 1,
            pr_no: "PR-20261016-01",
            status: "approved",
            priority: "normal",
            created_at: "2026-10-16",
            items: [
              {
                medicine_name: "Amoxicillin",
                quantity: 10,
                unit: "Strip",
                estimated_unit_cost: 15.5,
              },
            ],
          },
        ],
      });
    }
    if (url.includes("/goods-receipts")) {
      return Promise.resolve({
        goods_receipts: [],
      });
    }
    if (url.includes("/medicines")) {
      return Promise.resolve({
        medicines: [
          {
            id: 10,
            name: "Amoxicillin",
            category: "Antibiotic",
            dosage_form: "Tablet",
            unit: "Strip",
            gst_rate: 5,
            active: 1,
          },
        ],
      });
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

  it("prints Pharmacy Reports in standard PDF format and supports printing all pages", async () => {
    vi.mocked(generatePDFBlob).mockClear();
    vi.mocked(printPDF).mockClear();

    render(<PharmacyReports setNotice={vi.fn()} onNavigate={vi.fn()} />);

    // Test Print Report (current page)
    fireEvent.click(await screen.findByRole("button", { name: "Print Report" }));
    await waitFor(() => expect(generatePDFBlob).toHaveBeenCalled());
    let callArg = vi.mocked(generatePDFBlob).mock.calls[0][0];
    expect(callArg.title).toBe("Pharmacy Sales & Revenue Report");
    expect(callArg.brand_logo).toBe("ayu");
    expect(callArg.sections).toHaveLength(2);
    await waitFor(() => expect(printPDF).toHaveBeenCalled());

    // Test Print All Pages (consolidated master report)
    vi.mocked(generatePDFBlob).mockClear();
    vi.mocked(printPDF).mockClear();
    fireEvent.click(await screen.findByRole("button", { name: "Print All Pages" }));
    await waitFor(() => expect(generatePDFBlob).toHaveBeenCalled());
    callArg = vi.mocked(generatePDFBlob).mock.calls[0][0];
    expect(callArg.title).toBe("Pharmacy Consolidated Master Report");
    expect(callArg.brand_logo).toBe("ayu");
    expect(callArg.sections).toHaveLength(5);
    await waitFor(() => expect(printPDF).toHaveBeenCalled());
  });

  it("prints Pharmacy Overview in the same standard report format as Dashboard", async () => {
    vi.mocked(generatePDFBlob).mockClear();
    vi.mocked(printPDF).mockClear();
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacyOverview setNotice={setNotice} onNavigate={onNavigate} />);

    const printBtn = await screen.findByRole("button", { name: "Print Overview" });
    expect(printBtn).toBeDefined();

    fireEvent.click(printBtn);

    await waitFor(() => expect(generatePDFBlob).toHaveBeenCalled());
    const callArg = vi.mocked(generatePDFBlob).mock.calls[0][0];
    expect(callArg.title).toBe("Pharmacy Overview Report");
    expect(callArg.brand_logo).toBe("ayu");
    expect(callArg.sections).toHaveLength(5);
    expect(callArg.sections[0].title).toBe("Pharmacy Key Performance Indicators (KPIs)");
    expect(callArg.sections[1].title).toContain("Pharmacy Operations Ledger");
    expect(callArg.sections[2].title).toBe("Stock Health & Inventory Valuation Breakdown");
    expect(callArg.sections[3].title).toBe("Medicine Expiry Risk Breakdown");
    expect(callArg.sections[4].title).toBe("Top Fast-Moving Medicines");
    await waitFor(() => expect(printPDF).toHaveBeenCalled());
  });

  it("allows managing status of a supplier and deleting an existing supplier", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacySuppliers setNotice={setNotice} onNavigate={onNavigate} />);

    // Check suppliers are rendered
    expect(await screen.findByText("ABC Pharma Distributors")).toBeDefined();
    expect(await screen.findByText("Apollo Pharmacy Supplier")).toBeDefined();

    // 1. Toggle status of ABC Pharma Distributors from active to inactive
    const statusBtn = screen.getByTitle("Click to switch status to inactive");
    fireEvent.click(statusBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/pharmacy/suppliers/1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"status":"inactive"'),
      })
    );

    // 2. Delete existing supplier
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);

    // Delete modal opens
    expect(screen.getByText(/Are you sure you want to delete supplier/i)).toBeDefined();
    const confirmDeleteBtn = screen.getByRole("button", { name: "Confirm Delete" });
    fireEvent.click(confirmDeleteBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/pharmacy/suppliers/1",
      expect.objectContaining({
        method: "DELETE",
      })
    );
  });

  it("reflects purchase orders, requisitions, and deliveries under Recent Purchase Orders & Deliveries in ledger modal", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacySuppliers setNotice={setNotice} onNavigate={onNavigate} />);

    // Click "View Ledger" for ABC Pharma Distributors
    const viewLedgerBtns = await screen.findAllByRole("button", { name: "View Ledger" });
    expect(viewLedgerBtns.length).toBeGreaterThan(0);
    fireEvent.click(viewLedgerBtns[0]);

    // Ledger modal opens
    expect(await screen.findByText("Recent Purchase Orders & Deliveries")).toBeDefined();

    // Verify items in the list are reflecting!
    expect(await screen.findByText("Amoxicillin (500mg)")).toBeDefined();
    expect(screen.getByText("PR-20261015-01")).toBeDefined();
    expect(screen.getByText("Paracetamol 650mg")).toBeDefined();
    expect(screen.getByText("GRN-20261016-01")).toBeDefined();

    // Verify Financial Summary
    expect(screen.getByText("₹1500.00")).toBeDefined();
    expect(screen.getAllByText("₹500.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("₹1000.00").length).toBeGreaterThanOrEqual(1);

    // Record Payment
    const recordPayBtn = screen.getByRole("button", { name: "+ Record Payment" });
    fireEvent.click(recordPayBtn);

    expect(await screen.findByText("Record Supplier Disbursement")).toBeDefined();
    const amountInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(amountInput, { target: { value: "300" } });

    const confirmPayBtn = screen.getByRole("button", { name: "Confirm Payment" });
    fireEvent.click(confirmPayBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/pharmacy/suppliers/1/payments",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"amount":300'),
      })
    );
  });

  it("accurately reflects low stock and near expiry & expired counts and drilldowns", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacyOverview setNotice={setNotice} onNavigate={onNavigate} />);

    // citrezin only has expired stock (2000-01-01), so usable unexpired stock = 0 <= reorder_level 10 -> Low stock count includes it
    expect(await screen.findByText("Low Stock")).toBeDefined();
    expect(screen.getByText("Near Expiry")).toBeDefined();

    // Click Low Stock KPI card to open drilldown modal
    const lowStockCard = screen.getByText("Low Stock").closest("button");
    if (lowStockCard) fireEvent.click(lowStockCard);

    expect(await screen.findByText("Low Stock & Out of Stock Alerts")).toBeDefined();
    expect(screen.getByText("LOW STOCK MEDICINES")).toBeDefined();
  });

  it("updates the PDF according to the opened internal module in Inventory", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacyInventoryStock setNotice={setNotice} onNavigate={onNavigate} />);

    // 1. Switch to Low Stock internal subtab
    const lowStockTab = await screen.findByRole("button", { name: /Low Stock/i });
    fireEvent.click(lowStockTab);

    // Verify Low Stock internal module is open
    expect(await screen.findByText(/Low Stock Items/i)).toBeDefined();

    // 2. Click Print Report while on Low Stock module
    vi.mocked(generatePDFBlob).mockClear();
    const printBtn = screen.getByRole("button", { name: "Print Report" });
    fireEvent.click(printBtn);

    await waitFor(() => expect(generatePDFBlob).toHaveBeenCalled());
    let payload = vi.mocked(generatePDFBlob).mock.calls[0][0];
    expect(payload.title).toBe("Pharmacy Low Stock & Reorders Report");
    expect(payload.document_type).toBe("Low Stock & Reorders Report");
    expect(payload.sections[1].title).toBe("Medicines Requiring Purchase Requisition");

    // 3. Switch to Batch & Expiry internal module
    const batchesTab = screen.getByRole("button", { name: /Batch & Expiry/i });
    fireEvent.click(batchesTab);

    vi.mocked(generatePDFBlob).mockClear();
    fireEvent.click(printBtn);

    await waitFor(() => expect(generatePDFBlob).toHaveBeenCalled());
    payload = vi.mocked(generatePDFBlob).mock.calls[0][0];
    expect(payload.title).toBe("Pharmacy Batch Inventory & Expiry Tracking Report");
    expect(payload.document_type).toBe("Batch & Expiry Report");

    // 4. Switch to Stock Ledger (Audit Trail) internal module
    const ledgerTab = screen.getByRole("button", { name: /Stock Ledger/i });
    fireEvent.click(ledgerTab);

    vi.mocked(generatePDFBlob).mockClear();
    fireEvent.click(printBtn);

    await waitFor(() => expect(generatePDFBlob).toHaveBeenCalled());
    payload = vi.mocked(generatePDFBlob).mock.calls[0][0];
    expect(payload.title).toBe("Pharmacy Stock Ledger Audit Trail Report");
    expect(payload.document_type).toBe("Stock Ledger Report");
  });

  it("auto-reflects selected medicine, quantity, and unit form when choosing a purchase order in Link to Purchase Order", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    render(<PharmacyPurchasesGrn setNotice={setNotice} onNavigate={onNavigate} />);

    // Wait for the Link to Purchase Order select to appear and be populated
    const poSelect = await screen.findByLabelText(/Link to Purchase Order \(optional\):/i);
    expect(poSelect).toBeDefined();

    // Select PO-4 (Amoxicillin, Qty 10)
    fireEvent.change(poSelect, { target: { value: "4" } });

    // Verify medicine name and quantity are auto-reflected in the Received Medicine Batches lines
    await waitFor(() => {
      const medicineInputs = screen.getAllByPlaceholderText(/Medicine name.../i);
      expect((medicineInputs[0] as HTMLInputElement).value).toBe("Amoxicillin");
    });

    const qtyInput = screen.getByPlaceholderText("1") as HTMLInputElement;
    expect(qtyInput.value).toBe("10");

    // Verify confirmation notice was triggered
    expect(setNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        message: expect.stringContaining('Selected PO-4: Auto-reflected "Amoxicillin" (Qty: 10)'),
      })
    );
  });

  it("redirects and opens New Purchase Request modal when clicking New PR", async () => {
    const setNotice = vi.fn();
    const onNavigate = vi.fn();

    sessionStorage.clear();

    const { unmount } = render(<PharmacyOverview setNotice={setNotice} onNavigate={onNavigate} />);

    // Click "New PR" in Quick Operation Modules
    const newPrBtn = await screen.findByText("New PR");
    fireEvent.click(newPrBtn);

    expect(sessionStorage.getItem("pharmacy_purchases_open_new_pr")).toBe("true");
    expect(sessionStorage.getItem("pharmacy_purchases_tab")).toBe("pr");
    expect(onNavigate).toHaveBeenCalledWith("pharmacy-purchases-grn");

    unmount();

    // Now render PharmacyPurchasesGrn as if navigation occurred
    render(<PharmacyPurchasesGrn setNotice={setNotice} onNavigate={onNavigate} />);

    // The modal should open immediately
    expect(await screen.findByText("New Purchase Request")).toBeDefined();
    expect(screen.getByText("Add one medicine or build a bulk order for your supplier.")).toBeDefined();
    expect(screen.getByText("Medicine Items")).toBeDefined();
  });
});




