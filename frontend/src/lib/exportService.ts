import { API_BASE } from "./constants";
import { getHospitalCode } from "./api";
import { filenameFromContentDisposition } from "./exportShare";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { renderAyuPdfHeaderHtml, renderAyuPdfFooterHtml } from "./pdfTemplate";
import { PRINT_BRAND_HEADER_DATA_URI, PRINT_MEDICAL_SYMBOL_DATA_URI, PRINT_WATERMARK_DATA_URI } from "./printBrand";

import { formatDateOnlyIST, formatTimeIST, todayIST } from "./format";
export type StandardPdfSection = {
  title: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
};

export type StandardPdfPayload = {
  title: string;
  subtitle: string;
  filename: string;
  brand_logo?: "ayu";
  include_signature?: boolean;
  include_doctor_details?: boolean;
  operator_name?: string;
  invoice_meta?: {
    invoice_number?: string;
    invoice_date?: string;
  };
  patient_info?: {
    patient_name?: string;
    patient_id?: string;
    age?: string | number;
    gender?: string;
    mobile?: string;
    email?: string;
    address?: string;
    consulting_doctor?: string;
  };
  totals?: {
    subtotal?: string | number;
    grand_total?: string | number;
    amount_received?: string | number;
    balance?: string | number;
  };
  payment_details?: {
    receipt_number?: string;
    payment_date?: string;
    payment_mode?: string;
    amount_paid?: string | number;
  };
  sections: StandardPdfSection[];
};

function datedFilename(base: string): string {
  const date = todayIST();
  const normalized = String(base || "Hospital_Report")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${normalized || "Hospital_Report"}_${date}.pdf`;
}

// 1. Generate PDF Blob from standard report endpoint (POST)
export async function generatePDFBlob(payload: Omit<StandardPdfPayload, "filename"> & { filename?: string }): Promise<{ blob: Blob; filename: string }> {
  const filename = datedFilename(payload.filename || payload.title);
  const response = await fetch(`${API_BASE}/api/reports/export/pdf`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Hospital-Code": getHospitalCode() },
    body: JSON.stringify({ ...payload, filename }),
  });

  if (!response.ok) {
    let message = "Unable to generate PDF report.";
    try {
      const data = await response.json();
      message = data?.error || data?.details || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error("The generated PDF is empty.");
  const resolvedFilename = filenameFromContentDisposition(response.headers.get("Content-Disposition"), filename) || filename;
  return { blob, filename: resolvedFilename };
}

// 2. Download PDF
export function downloadPDF(blob: Blob, filename: string): void {
  const mimeType = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : (blob.type || "application/octet-stream");
  const pdfBlob = new Blob([blob], { type: mimeType });
  const url = window.URL.createObjectURL(pdfBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  
  // Revoke Object URL to prevent memory leaks
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 15000);
}

// 3. Print PDF
export function printPDF(blob: Blob): void {
  const mimeType = blob.type || "application/pdf";
  const pdfBlob = new Blob([blob], { type: mimeType });
  const url = window.URL.createObjectURL(pdfBlob);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "100%";
  iframe.style.bottom = "100%";
  iframe.style.width = "1024px";
  iframe.style.height = "768px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn("Iframe print preview blocked, opening PDF window:", e);
      const printWindow = window.open(url, "_blank");
      if (printWindow) {
        printWindow.focus();
      }
    }
    window.setTimeout(() => {
      iframe.remove();
      window.URL.revokeObjectURL(url);
    }, 60000);
  };
  document.body.appendChild(iframe);
}

// 4. Share PDF (handles Web Share API if supported)
export async function sharePDF(blob: Blob, filename: string, title: string, text?: string): Promise<boolean> {
  const mimeType = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : (blob.type || "application/octet-stream");
  const file = new File([blob], filename, { type: mimeType });
  
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };

  const hasNativeShare = typeof nav.share === "function";
  let canShareFile = false;

  if (hasNativeShare && typeof nav.canShare === "function") {
    try {
      canShareFile = nav.canShare({ files: [file] });
    } catch (err) {
      console.error("navigator.canShare check failed:", err);
    }
  }

  if (canShareFile && nav.share) {
    try {
      await nav.share({
        title,
        text: text || title,
        files: [file]
      });
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err; // Propagate abort so we don't trigger fallback
      }
      console.error("Native share failed:", err);
    }
  }
  return false;
}

// 5. Centralized Export PDF Flow (with native share check, fallback to global window handler)
export async function exportPDF(
  blob: Blob,
  filename: string,
  title: string,
  text?: string,
  setNotice?: (notice: { type: "success" | "error" | "info"; message: string } | null) => void
): Promise<void> {
  try {
    const shared = await sharePDF(blob, filename, title, text);
    if (shared) {
      if (setNotice) setNotice({ type: "success", message: `${title} shared successfully.` });
      return;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // User aborted native sharing, so do not fallback or alert.
      return;
    }
  }

  // Fallback to desktop/browser-specific share options dialog
  if (window.__hospai_export_share__) {
    window.__hospai_export_share__({ blob, filename, title, text });
  } else {
    // Ultimate fallback if no UI listener is registered
    downloadPDF(blob, filename);
    if (setNotice) {
      setNotice({
        type: "info",
        message: "Sharing is not supported on this browser. The report has been downloaded instead."
      });
    }
  }
}

declare global {
  interface Window {
    __hospai_export_share__?: (options: {
      blob: Blob;
      filename: string;
      title: string;
      text?: string;
      shareUrl?: string;
    }) => void;
  }
}

// --- PDF Header Configuration Constants ---
const PDF_LOGO_WIDTH = "380px";
const PDF_LOGO_HEIGHT = "120px";
const PDF_HEADER_SPACING = "20px";
const PDF_IMAGE_PADDING = "20px";

// 6. Client-Side PDF Generation (Dashboard, custom layouts)
export async function generateClientPdf(
  elementIdOrClass: string,
  baseFilename: string,
  title: string
): Promise<{ blob: Blob; filename: string }> {
  // Wait for React to finish rendering any pending states
  await new Promise((resolve) => setTimeout(resolve, 600));

  const element = document.querySelector(elementIdOrClass) as HTMLElement;
  if (!element) {
    console.error(`[PDF Export] Container ${elementIdOrClass} not found`);
    throw new Error(`Container ${elementIdOrClass} not found`);
  }

  try {
    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.left = "-9999px";
    wrapper.style.top = "0";
    wrapper.style.width = "1200px"; 
    wrapper.style.backgroundColor = "#ffffff";
    wrapper.style.padding = "40px";
    wrapper.style.fontFamily = "Arial, sans-serif";
    
    const printDate = formatDateOnlyIST(new Date(), undefined, "en-GB");
    const printTime = formatTimeIST(new Date(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }, "en-US");

    wrapper.innerHTML = `
      <div style="position: relative; z-index: 1;">
        ${renderAyuPdfHeaderHtml({ title, printDate, printTime, generatedBy: "Ayu Polyclinic & Emergency Clinic System" })}
        <div id="hospai-client-pdf-clone"></div>
        ${renderAyuPdfFooterHtml("Page 1 of 1")}
      </div>
    `;

    document.body.appendChild(wrapper);

    // Clone and sanitize dashboard content
    const clone = element.cloneNode(true) as HTMLElement;
    
    // Remove interactive elements like headers or buttons
    const removeSelectors = ['.hosp-dashboard-top', '.hosp-view-all', 'button', '.no-print'];
    removeSelectors.forEach(sel => {
      const els = clone.querySelectorAll(sel);
      els.forEach(el => el.remove());
    });
    
    const cloneContainer = wrapper.querySelector("#hospai-client-pdf-clone");
    if (cloneContainer) cloneContainer.appendChild(clone);

    const canvas = await html2canvas(wrapper, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: 1200,
    });

    document.body.removeChild(wrapper);

    const imgData = canvas.toDataURL("image/png", 1.0);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    const imgProps = pdf.getImageProperties(imgData);
    const margin = 0; 
    const availableWidth = pdfWidth - margin * 2;
    const imgWidth = availableWidth;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    let finalWidth = imgWidth;
    let finalHeight = imgHeight;
    const availableHeight = pdfHeight - margin * 2;

    if (imgHeight > availableHeight) {
      finalHeight = availableHeight;
      finalWidth = (imgProps.width * finalHeight) / imgProps.height;
    }

    const xOffset = margin + (availableWidth - finalWidth) / 2;
    pdf.addImage(imgData, "PNG", xOffset, margin, finalWidth, finalHeight, undefined, "FAST");

    const blob = pdf.output("blob");
    if (!blob.size) {
      console.error("[PDF Export] Blob generation failed (empty output).");
      throw new Error("PDF blob is empty");
    }
    
    return { blob, filename: datedFilename(baseFilename) };
  } catch (err) {
    console.error("[PDF Export] html2canvas or jsPDF failed:", err);
    throw new Error("Unable to generate PDF.");
  }
}
