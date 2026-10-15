import { PRINT_CADUCEUS_DATA_URI } from "./printBrand";
import { AYU_PDF_COLORS, renderAyuPdfFooterHtml, renderAyuPdfHeaderHtml } from "./pdfTemplate";

describe("shared Ayu PDF branding", () => {
  test("renders the reference clinic header and preserves report metadata", () => {
    const html = renderAyuPdfHeaderHtml({
      title: "Billing Summary",
      subtitle: "Daily collections",
      printDate: "12/10/2026",
      printTime: "10:30:00 AM",
      generatedBy: "Ayu Polyclinic & Emergency Clinic System",
    });

    expect(AYU_PDF_COLORS.primary).toBe("#1d4289");
    expect(html).toContain("AYU POLYCLINIC & EMERGENCY CLINIC");
    expect(html).toContain("Dr. Sushanth. B");
    expect(html).toContain("MBBS (Gandhi), (FCCM)");
    expect(html).toContain("TSMC/FM/27444");
    expect(html).toContain("Billing Summary");
    expect(html).toContain("Daily collections");
  });

  test("renders the clinic services and contact footer matching the backend PDF footer", () => {
    const html = renderAyuPdfFooterHtml();

    expect(html).toContain("SIGNATURE");
    expect(html).toContain("ayu-shared-footer-band");
    expect(html).toContain("- 24/7 Emergency");
    expect(html).toContain("- Ambulance Service");
    expect(html).toContain("- Home Care Service Available");
    expect(html).toContain("GGF2+2F8, Old Alwal Road, Jonnabanda,");
    expect(html).toContain("Chetana Housing Colony, Brundavan Colony,");
    expect(html).toContain("Bollaram - 500010, Hyderabad.");
    expect(html).toContain("+91 6303346810");
    expect(html).toContain("dr.sushanth108@gmail.com");
    expect(html).not.toContain("<img");
    // Middle divider is vector (SVG) so it prints even with "Background graphics" off.
    expect(html).toContain(`<rect x="0" y="0" width="0.4" height="12.5" fill="#1e567a"/>`);
    expect(html).toContain("print-color-adjust:exact");
    expect(html).toContain("Powered by HospAI");
  });

  test("omits the signature area while retaining footer artwork and Powered by HospAI when disabled", () => {
    const html = renderAyuPdfFooterHtml("Page 1 of 1", false);

    expect(html).not.toContain("SIGNATURE");
    expect(html).toContain("ayu-shared-footer-band");
    expect(html).toContain("margin:0;padding-top:0;");
    expect(html).toContain("Powered by HospAI");
  });

  test("escapes ampersands once in report titles", () => {
    const html = renderAyuPdfHeaderHtml({ title: "Pharmacy Sales & Revenue Report" });

    expect(html).toContain("Pharmacy Sales &amp; Revenue Report");
    expect(html).not.toContain("Pharmacy Sales &amp;amp; Revenue Report");
  });
});