import { PRINT_CADUCEUS_DATA_URI, PRINT_FOOTER_IMAGE_DATA_URI } from "./printBrand";
import { AYU_PDF_COLORS, renderAyuPdfFooterHtml, renderAyuPdfHeaderHtml } from "./pdfTemplate";

describe("shared Ayu PDF branding", () => {
  test("renders the reference clinic header and preserves report metadata", () => {
    const html = renderAyuPdfHeaderHtml({
      title: "Billing Summary",
      subtitle: "Daily collections",
      printDate: "12/10/2026",
      printTime: "10:30:00 AM",
      generatedBy: "Ayu Polyclinic System",
    });

    expect(AYU_PDF_COLORS.primary).toBe("#1d4289");
    expect(html).toContain("AYU POLYCLINIC");
    expect(html).toContain("Dr. Sushanth. B");
    expect(html).toContain("MBBS (Gandhi), (FCCM)");
    expect(html).toContain("TSMC/FM/27444");
    expect(html).toContain(`src="${PRINT_CADUCEUS_DATA_URI}"`);
    expect(html).toContain("Billing Summary");
    expect(html).toContain("Daily collections");
  });

  test("renders the exact clinic services and contact footer artwork", () => {
    const html = renderAyuPdfFooterHtml();

    expect(html).toContain(`src="${PRINT_FOOTER_IMAGE_DATA_URI}"`);
    expect(html).toContain("SIGNATURE");
    expect(html).toContain("Ayu Polyclinic services, address, phone and email");
  });
});