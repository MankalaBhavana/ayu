import { act } from "react";
import { createRoot } from "react-dom/client";
import LabPage from "./LabPage";
import LabDiagnosticsOrdersPage from "./LabDiagnosticsOrdersPage";
import LabDiagnosticsLabPage from "./LabDiagnosticsLabPage";
import LabDiagnosticsImagingPage from "./LabDiagnosticsImagingPage";
import LabDiagnosticsReportsPage from "./LabDiagnosticsReportsPage";
import LabDiagnosticsCataloguePage from "./LabDiagnosticsCataloguePage";
import LabDiagnosticsQualityPage from "./LabDiagnosticsQualityPage";

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

function mockLocalStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
  });
}

describe("LabPage", () => {
  test("renders lab billing, print, and existing diagnostic records", async () => {
    mockLocalStorage();
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/lab/diagnostics")) {
        return jsonResponse({
          diagnostics: [
            {
              id: 1,
              invoice_no: "LAB-1001",
              patient_id: "PAT-20260617-7001",
              test_name: "Blood Test",
              order_status: "sample_collected",
              sample_barcode: "SMP-1",
              doctor_name: "Dr. Prime",
              amount: 500,
              paid_amount: 100,
              due_amount: 400,
            },
          ],
        });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LabPage setNotice={vi.fn()} />);
      await flush();
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("Patient & Visit Information");
    expect(container.textContent).toContain("Generate Bill");
    expect(container.textContent).toContain("Save & Print");
    expect(container.textContent).toContain("Existing Lab and Diagnostic Records");
    expect(container.textContent).toContain("UHID");
    expect(container.textContent).toContain("PAT-20260617-7001");
    expect(container.textContent).toContain("Blood Test");
    expect(container.querySelector('input[aria-label="Patient UHID"]')).toBeTruthy();
    expect(container.querySelector('input[aria-label="Patient name"]')).toBeTruthy();
    expect(container.querySelector('input[aria-label="Paid Amount"]')).toBeTruthy();
    expect(container.querySelector('select[aria-label="Lab category"]')).toBeTruthy();
    expect(container.querySelector('select[aria-label="Delete Category"]')).toBeTruthy();
    expect(container.querySelector('input[aria-label="Total Services Amount"]')).toBeTruthy();
    expect(container.textContent).toContain("Total Lab Tests Amount (₹)");
    expect(container.textContent).toContain("Total Diagnostic Amount (₹)");

    const amountInputs = container.querySelectorAll('input[aria-label="lab rate"]');
    const quantityInputs = container.querySelectorAll('input[aria-label="lab quantity"]');
    amountInputs.forEach((input) => expect((input as HTMLInputElement).value).toBe(""));
    quantityInputs.forEach((input) => expect((input as HTMLInputElement).value).toBe(""));

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("renders separate status tabs and allows collect payment", async () => {
    mockLocalStorage();
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/lab/diagnostics") && init?.method === "POST") {
        return jsonResponse({
          status: "ok",
          record: {
            id: 1,
            paid_amount: 500,
            due_amount: 0,
            status: "paid",
            payment_mode: "upi",
            transaction_id: "TXN123",
            operator_name: "Admin"
          }
        });
      }
      if (requestUrl.includes("/api/lab/diagnostics")) {
        return jsonResponse({
          diagnostics: [
            {
              id: 1,
              invoice_no: "LAB-1001",
              patient_id: "PAT-20260617-7001",
              test_name: "Blood Test",
              order_status: "sample_collected",
              sample_barcode: "SMP-1",
              doctor_name: "Dr. Prime",
              amount: 500,
              paid_amount: 100,
              due_amount: 400,
              status: "partial"
            },
          ],
        });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LabPage setNotice={vi.fn()} />);
      await flush();
      await flush();
    });

    // Check separate tab counts
    expect(container.textContent).toContain("All Records (1)");
    expect(container.textContent).toContain("Due Payments (0)");
    expect(container.textContent).toContain("Partial Payments (1)");
    expect(container.textContent).toContain("Paid Payments (0)");
    
    // Check collect payment button
    expect(container.textContent).toContain("Collect");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("renders LabDiagnosticsOrdersPage without crashing", async () => {
    mockLocalStorage();
    global.fetch = vi.fn((url: string) => {
      const u = String(url);
      if (u.includes("/api/diag/services")) return jsonResponse({ services: [{ id: 1, code: "CBC", name: "Complete Blood Count", rate: 300 }] });
      if (u.includes("/api/diag/orders")) return jsonResponse({ orders: [] });
      if (u.includes("/api/diag/invoices")) return jsonResponse({ invoices: [] });
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LabDiagnosticsOrdersPage setNotice={vi.fn()} />);
      await flush();
    });

    expect(container.textContent).toContain("New order");

    act(() => { root.unmount(); });
    container.remove();
  });

  test("renders LabDiagnosticsLabPage without crashing", async () => {
    mockLocalStorage();
    global.fetch = vi.fn((url: string) => {
      const u = String(url);
      if (u.includes("/api/diag/lab/worklist")) return jsonResponse({ items: [] });
      if (u.includes("/api/lab/vendors-list")) return jsonResponse({ vendors: [] });
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LabDiagnosticsLabPage setNotice={vi.fn()} />);
      await flush();
    });

    expect(container.textContent).toContain("Laboratory worklist");

    act(() => { root.unmount(); });
    container.remove();
  });

  test("renders LabDiagnosticsImagingPage without crashing", async () => {
    mockLocalStorage();
    global.fetch = vi.fn((url: string) => {
      const u = String(url);
      if (u.includes("/api/diag/imaging/worklist")) return jsonResponse({ items: [] });
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LabDiagnosticsImagingPage setNotice={vi.fn()} />);
      await flush();
    });

    expect(container.textContent).toContain("Imaging worklist");

    act(() => { root.unmount(); });
    container.remove();
  });

  test("renders LabDiagnosticsReportsPage without crashing", async () => {
    mockLocalStorage();
    global.fetch = vi.fn((url: string) => {
      const u = String(url);
      if (u.includes("/api/diag/reports")) return jsonResponse({ reports: [] });
      if (u.includes("/api/diag/critical-alerts")) return jsonResponse({ alerts: [] });
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LabDiagnosticsReportsPage setNotice={vi.fn()} />);
      await flush();
    });

    expect(container.textContent).toContain("Report worklist");

    act(() => { root.unmount(); });
    container.remove();
  });

  test("renders LabDiagnosticsCataloguePage without crashing", async () => {
    mockLocalStorage();
    global.fetch = vi.fn((url: string) => {
      const u = String(url);
      if (u.includes("/api/diag/services")) return jsonResponse({ services: [] });
      if (u.includes("/api/diag/packages")) return jsonResponse({ packages: [] });
      if (u.includes("/api/diag/report-templates")) return jsonResponse({ templates: [] });
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LabDiagnosticsCataloguePage setNotice={vi.fn()} />);
      await flush();
    });

    expect(container.textContent).toContain("Catalogue settings");

    act(() => { root.unmount(); });
    container.remove();
  });

  test("renders LabDiagnosticsQualityPage without crashing", async () => {
    mockLocalStorage();
    global.fetch = vi.fn((url: string) => {
      const u = String(url);
      if (u.includes("/api/diag/quality/overview")) return jsonResponse({ open_qc_reviews: 0, equipment_ready: 5, equipment_total: 5, maintenance_due_soon: 0, expiring_lots: 0, open_release_holds: 0 });
      if (u.includes("/api/diag/equipment")) return jsonResponse({ equipment: [] });
      if (u.includes("/api/diag/qc/runs")) return jsonResponse({ runs: [] });
      if (u.includes("/api/diag/qc/holds")) return jsonResponse({ holds: [] });
      if (u.includes("/api/diag/reagent-lots")) return jsonResponse({ lots: [] });
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LabDiagnosticsQualityPage setNotice={vi.fn()} />);
      await flush();
    });

    expect(container.textContent).toContain("Quality control");

    act(() => { root.unmount(); });
    container.remove();
  });
});

