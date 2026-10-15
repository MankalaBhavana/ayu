import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PharmacySettings from "./PharmacySettings";
import { apiFetch } from "../../lib/api";

const medicines = [
  { id: 1, name: "Dolo 650", generic_name: "Paracetamol", category: "Tablet", gst_rate: 0, reorder_level: 30, active: 1 },
  { id: 2, name: "Old Syrup", generic_name: "Retired", category: "Syrup / Suspension", gst_rate: 12, reorder_level: 10, active: 0 },
];
const dropdowns: Record<string, any[]> = {
  dosage_forms: [{ id: 11, category: "dosage_forms", value: "Tablet", label: "Tablet", is_active: true, sort_order: 1, is_system: true }],
  storage_locations: [{ id: 21, category: "storage_locations", value: "Emergency Rack A", label: "Emergency Rack A", is_active: true, sort_order: 1, is_system: true }],
};

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  reportError: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith("/api/pharmacy/medicines")) return Promise.resolve({ medicines });
    if (url === "/api/pharmacy/settings" && init?.method === "PUT") return Promise.resolve(JSON.parse(String(init.body)));
    if (url === "/api/pharmacy/settings") {
      return Promise.resolve({ pharmacy_name: "Ayu Pharmacy", address_line: "", dl_number: "20B/TS/1", gstin: "" });
    }
    if (url.startsWith("/api/config/dropdowns?category=")) {
      const category = new URL(url, "http://x").searchParams.get("category") || "";
      return Promise.resolve(dropdowns[category] || []);
    }
    if (url.startsWith("/api/config/dropdowns")) return Promise.resolve(dropdowns);
    return Promise.resolve({});
  });
});

describe("Pharmacy Settings", () => {
  it("shows real master status and GST, hiding inactive medicines until asked", async () => {
    render(<PharmacySettings setNotice={vi.fn()} onNavigate={vi.fn()} />);
    expect(await screen.findByText("Dolo 650")).toBeTruthy();
    expect(screen.queryByText("Old Syrup")).toBeNull();
    expect(screen.getByText("0%")).toBeTruthy(); // exempt GST is not shown as 12%

    fireEvent.click(screen.getByLabelText(/Show inactive/));
    expect(await screen.findByText("Old Syrup")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
  });

  it("lists store & rack locations from the shared configuration", async () => {
    render(<PharmacySettings setNotice={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText("Store & Rack Locations"));
    expect(await screen.findByText(/Emergency Rack A/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /\+ Add Location/ })).toBeTruthy();
  });

  it("loads saved print settings and saves them to the server", async () => {
    const setNotice = vi.fn();
    render(<PharmacySettings setNotice={setNotice} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText("Print & Label Settings"));
    const name = await screen.findByDisplayValue("Ayu Pharmacy");
    fireEvent.change(name, { target: { value: "Ayu Pharmacy & Stores" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Print Settings" }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/api/pharmacy/settings",
        expect.objectContaining({ method: "PUT", body: expect.stringContaining("Ayu Pharmacy & Stores") })
      )
    );
    await waitFor(() => expect(setNotice).toHaveBeenCalledWith(expect.objectContaining({ type: "success" })));
  });
});
