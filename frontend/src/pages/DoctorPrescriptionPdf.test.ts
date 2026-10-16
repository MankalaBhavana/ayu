import { describe, test, expect } from "vitest";
import { buildPrescriptionHtml } from "./PatientWorkflowPage";
import { PRINT_CADUCEUS_DATA_URI } from "../lib/printBrand";
import { renderAyuPdfFooterHtml } from "../lib/pdfTemplate";

describe("Doctor Prescription Standardized PDF Footer & Multi-Page Layout", () => {
  test("generates standardized Ayu Polyclinic & Emergency Clinic footer with Powered by HospAI matching Dashboard", () => {
    const html = buildPrescriptionHtml({
      patientName: "Ramesh Kumar",
      patientAddress: "Alwal, Hyderabad",
      ageGender: "45 Y / Male",
      diagnosis: "Type 2 Diabetes Mellitus",
      printDate: "15/10/2026",
      doctorName: "Dr. Sushanth. B",
      medicines: [
        { medicine_name: "Metformin", dosage: "500mg", frequency: "1-0-1", duration: "30 days", instructions: "After food" },
        { medicine_name: "Glimepiride", dosage: "1mg", frequency: "1-0-0", duration: "30 days", instructions: "Before breakfast" },
      ],
      advice: "Dietary restrictions, avoid sugar.\nRegular 30 min morning walk.",
      followUpDate: "15/11/2026",
    });

    // Valid HTML & document structure
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("AYU POLYCLINIC & EMERGENCY CLINIC");
    expect(html).toContain("Dr. Sushanth. B");
    expect(html).toContain("Ramesh Kumar");

    // Standardized footer elements matching Dashboard
    expect(html).toContain("ayu-shared-footer-band");
    expect(html).toContain("dr.sushanth108@gmail.com");
    expect(html).toContain("Powered by HospAI");
    expect(html).toContain("Page 1 of 1");
    expect(html).toContain("rx-page-footer");

    // Caduceus branding
    expect(html).toContain(`src="${PRINT_CADUCEUS_DATA_URI}"`);
  });

  test("generates a single page layout when medicines and advice fit comfortably", () => {
    const html = buildPrescriptionHtml({
      patientName: "Anita Sharma",
      patientAddress: "Kompally, Secunderabad",
      ageGender: "32 Y / Female",
      diagnosis: "Acute Bronchitis",
      printDate: "15/10/2026",
      medicines: [
        { medicine_name: "Azithromycin", dosage: "500mg", frequency: "1-0-0", duration: "5 days", instructions: "After lunch" },
        { medicine_name: "Paracetamol", dosage: "650mg", frequency: "1-0-1", duration: "3 days", instructions: "SOS for fever" },
        { medicine_name: "Levocetirizine", dosage: "5mg", frequency: "0-0-1", duration: "5 days", instructions: "At bedtime" },
      ],
      advice: "Steam inhalation twice daily.\nDrink warm water.",
      followUpDate: "20/10/2026",
    });

    const pageCount = (html.match(/class="rx-page"/g) || []).length;
    expect(pageCount).toBe(1);

    expect(html).toContain("Page 1 of 1");
    expect(html).toContain("SIGNATURE");
    expect(html).toContain("Azithromycin");
    expect(html).toContain("Paracetamol");
    expect(html).toContain("Levocetirizine");
  });

  test("automatically creates a clean multi-page layout when medications exceed single page capacity", () => {
    // 10 medicines: will exceed single page capacity (limit is 6 on page 1)
    const medicines = [
      { medicine_name: "Metformin", dosage: "500mg", frequency: "1-0-1", duration: "30 days", instructions: "After food" },
      { medicine_name: "Glimepiride", dosage: "2mg", frequency: "1-0-0", duration: "30 days", instructions: "Before food" },
      { medicine_name: "Telmisartan", dosage: "40mg", frequency: "0-1-0", duration: "30 days", instructions: "After lunch" },
      { medicine_name: "Atorvastatin", dosage: "10mg", frequency: "0-0-1", duration: "30 days", instructions: "Bedtime" },
      { medicine_name: "Aspirin", dosage: "75mg", frequency: "0-1-0", duration: "30 days", instructions: "After lunch" },
      { medicine_name: "Pantoprazole", dosage: "40mg", frequency: "1-0-0", duration: "15 days", instructions: "Empty stomach" },
      { medicine_name: "Vitamin D3", dosage: "60000 IU", frequency: "Once weekly", duration: "8 weeks", instructions: "With milk" },
      { medicine_name: "Calcium Carbonate", dosage: "500mg", frequency: "0-1-0", duration: "30 days", instructions: "After lunch" },
      { medicine_name: "Methylcobalamin", dosage: "1500mcg", frequency: "0-0-1", duration: "30 days", instructions: "After dinner" },
      { medicine_name: "Paracetamol", dosage: "650mg", frequency: "SOS", duration: "5 days", instructions: "When required" },
    ];

    const html = buildPrescriptionHtml({
      patientName: "Srinivas Rao",
      patientAddress: "Bowenpally, Hyderabad",
      ageGender: "58 Y / Male",
      diagnosis: "T2DM + HTN + Dyslipidemia",
      printDate: "15/10/2026",
      medicines,
      advice: "Strict diabetic diet.\nMonitor blood pressure weekly.\nAvoid salt and fried items.",
      followUpDate: "15/11/2026",
    });

    const pageCount = (html.match(/class="rx-page"/g) || []).length;
    expect(pageCount).toBe(2);

    // Page 1 footer
    expect(html).toContain("Page 1 of 2");
    // Page 2 footer
    expect(html).toContain("Page 2 of 2");

    // Both pages must contain the standardized footer image and HospAI branding
    const footerCount = (html.match(/class="rx-page-footer"/g) || []).length;
    expect(footerCount).toBe(2);

    const hospaiCount = (html.match(/Powered by HospAI/g) || []).length;
    expect(hospaiCount).toBe(2);

    // Page 2 contains continuation header
    expect(html).toContain("rx-header-cont");
    expect(html).toContain("(Prescription Cont.)");

    // Medicines correctly distributed:
    // Page 1 has medicines 1 to 6
    expect(html).toContain("Metformin");
    expect(html).toContain("Pantoprazole");

    // Page 2 has medicines 7 to 10
    expect(html).toContain("Vitamin D3");
    expect(html).toContain("Paracetamol");

    // Signature on the final page
    expect(html).toContain("SIGNATURE");
  });

  test("footer rendering uses exact renderAyuPdfFooterHtml implementation", () => {
    const directFooter = renderAyuPdfFooterHtml("Page 1 of 1", false);
    const rxHtml = buildPrescriptionHtml({
      patientName: "Test Patient",
      patientAddress: "Hyderabad",
      ageGender: "30 Y / M",
      diagnosis: "General Checkup",
      printDate: "15/10/2026",
      medicines: [{ medicine_name: "Paracetamol", dosage: "500mg", frequency: "1-0-1", duration: "3 days", instructions: "SOS" }],
    });

    // The rxHtml must contain the exact HTML generated by renderAyuPdfFooterHtml
    expect(rxHtml).toContain(directFooter.trim());
  });

  test("always displays Dr. Sushanth. B on the prescription letterhead regardless of consulting doctor input", () => {
    const rxHtml = buildPrescriptionHtml({
      patientName: "Sri Hari",
      patientAddress: "Hyderabad",
      ageGender: "26 Y / Male",
      diagnosis: "Fever",
      printDate: "16/10/2026",
      doctorName: "Dr. Monesh", // input doctor name should still produce Dr. Sushanth header
      medicines: [{ medicine_name: "Dolo 650", dosage: "650mg", frequency: "1-0-1", duration: "5 days", instructions: "After food" }],
      advice: "Take rest and drink plenty of fluids.",
      labTests: "CBC, ESR, Dengue NS1 Antigen",
      followUpDate: "20/10/2026",
    });

    expect(rxHtml).toContain("Dr. Sushanth. B");
    expect(rxHtml).toContain("MBBS (Gandhi), (FCCM)");
    expect(rxHtml).toContain("TSMC/FM/27444");
    expect(rxHtml).not.toContain("Dr. Monesh");

    // Tests to be taken for next visit reflected in HTML
    expect(rxHtml).toContain("Tests to be taken for next visit:");
    expect(rxHtml).toContain("CBC, ESR, Dengue NS1 Antigen");

    // Next review date reflected in HTML
    expect(rxHtml).toContain("Next Review:");
    expect(rxHtml).toContain("20/10/2026");
  });
});

