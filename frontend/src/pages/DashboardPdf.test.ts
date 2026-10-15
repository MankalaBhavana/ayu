import { describe, it, expect } from "vitest";
import type { StandardPdfPayload } from "../lib/exportService";

describe("Dashboard Display Cards PDF Export", () => {
  it("formats Today's Revenue display card popup payload with standard Ayu Polyclinic branding", () => {
    const payload: StandardPdfPayload = {
      title: "Today's Revenue Details",
      subtitle: "Hospital Revenue Summary for 15 Oct 2026",
      filename: "Today_Revenue_2026-10-15",
      brand_logo: "ayu",
      include_signature: false,
      include_doctor_details: false,
      operator_name: "Ayu Polyclinic System",
      sections: [
        {
          title: "Revenue Overview",
          headers: ["Metric", "Amount"],
          rows: [
            ["Total Revenue", "₹12,500"],
            ["Collected Amount", "₹10,000"],
            ["Outstanding Amount", "₹2,500"],
          ],
        },
        {
          title: "Module Breakdown",
          headers: ["Module / Head", "Amount"],
          rows: [
            ["OP / General Billing", "₹5,000"],
            ["Pharmacy Sales", "₹4,000"],
            ["Lab & Diagnostics", "₹3,500"],
          ],
        },
      ],
      totals: {
        grand_total: "₹12,500",
        amount_received: "₹10,000",
        balance: "₹2,500",
      },
    };

    expect(payload.brand_logo).toBe("ayu");
    expect(payload.include_signature).toBe(false);
    expect(payload.include_doctor_details).toBe(false);
    expect(payload.sections).toHaveLength(2);
    expect(payload.sections[0].title).toBe("Revenue Overview");
    expect(payload.sections[1].title).toBe("Module Breakdown");
    expect(payload.totals?.grand_total).toBe("₹12,500");
  });

  it("formats Patient Registrations display card popup payload with standard Ayu Polyclinic branding", () => {
    const payload: StandardPdfPayload = {
      title: "Today's Registrations",
      subtitle: "Patient Registration Summary for 15 Oct 2026",
      filename: "Patient_Registrations_2026-10-15",
      brand_logo: "ayu",
      include_signature: false,
      include_doctor_details: false,
      operator_name: "Ayu Polyclinic System",
      sections: [
        {
          title: "Registration Metrics",
          headers: ["Category", "Count"],
          rows: [
            ["New Registrations", "8"],
            ["Revisited Patients", "3"],
            ["Total Active Registrations", "11"],
          ],
        },
        {
          title: "Registered Patients List",
          headers: ["UHID / Patient ID", "Patient Name", "Visit Type", "Age / Gender", "Phone"],
          rows: [
            ["PAT-20261015-001", "John Doe", "New Registration", "32 Y / Male", "9876543210"],
          ],
        },
      ],
      totals: {
        grand_total: "11 Patients",
      },
    };

    expect(payload.brand_logo).toBe("ayu");
    expect(payload.sections[0].rows).toHaveLength(3);
    expect(payload.sections[1].rows[0][0]).toBe("PAT-20261015-001");
  });
});
