import { renderAyuPdfHeaderHtml, renderAyuPdfFooterHtml } from "./pdfTemplate";

/**
 * printViaIframe – shared print utility
 *
 * Uses a Blob URL loaded into a hidden <iframe> so that:
 *  - No popup blocker can interfere (no window.open)
 *  - Large base64 images (logo) are preserved in full (doc.write truncates them)
 *  - The browser's native print dialog is triggered reliably via iframe.contentWindow.print()
 */
function escapeSharedPrintText(value: string): string {
  return String(value || "Medical Document")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractSharedPrintTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) return titleMatch[1].replace(/<[^>]+>/g, "").trim();
  const headingMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return headingMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "Medical Document";
}

type SharedPrintOptions = {
  suppressBrowserHeadersAndFooters?: boolean;
  preserveDocumentHeader?: boolean;
  footerAtBottom?: boolean;
  includeFooter?: boolean;
  includeSignature?: boolean;
};

function applySharedHospaiPrintFrame(html: string, options: SharedPrintOptions): string {
  if (!html || html.includes("data-hospai-shared-print-shell")) {
    return html;
  }

  const preserveDocumentHeader = options.preserveDocumentHeader ?? false;
  const footerAtBottom = options.footerAtBottom ?? true;
  const includeFooter = options.includeFooter ?? true;
  const includeSignature = options.includeSignature ?? true;
  const suppressBrowserHeadersAndFooters = options.suppressBrowserHeadersAndFooters ?? false;
  const rawTitle = extractSharedPrintTitle(html);
  const title = escapeSharedPrintText(rawTitle);
  const now = new Date();
  const printDate = now.toLocaleDateString("en-GB");
  const printTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const pageMargin = suppressBrowserHeadersAndFooters ? "0" : "10mm 18mm 14mm";
  const bodyPadding = suppressBrowserHeadersAndFooters ? "10mm 18mm 14mm" : "0";

  // A physical specimen/medicine/wristband label declares its own narrow
  // body width (it's sized for a small sticker, not an A4 page). The full
  // letterhead below needs ~75mm just for its meta-info column, so forcing
  // it into a ~74mm-wide label collapses the grid and overlaps every line.
  // Those get a compact, single-line mark instead of the full letterhead.
  const bodyWidthMatch = html.match(/<body[^>]*style="[^"]*width:\s*(\d+)px/i);
  const isNarrowLabel = !!bodyWidthMatch && Number(bodyWidthMatch[1]) < 400;

  if (isNarrowLabel) {
    const compactCss = `
      <style data-hospai-shared-print-style>
        @page { margin: 4mm; }
        .hospai-shared-label-mark { font-family: Arial, Helvetica, sans-serif; margin-bottom: 2mm; }
        .hospai-shared-label-mark .brand { font-size: 8.5pt; font-weight: 800; color: #062f56; }
        .hospai-shared-label-mark .meta { font-size: 6.5pt; color: #475569; margin-top: 0.5mm; }
        .hospai-shared-label-mark .rule { border-top: 0.4mm solid #000; margin-top: 1.5mm; }
      </style>`;
    const compactHeader = `
      <div class="hospai-shared-label-mark" data-hospai-shared-print-shell>
        <div class="brand">Ayu Polyclinic</div>
        <div class="meta">${title} &middot; ${printDate} ${printTime}</div>
        <div class="rule"></div>
      </div>`;

    let compactOutput = html;
    compactOutput = compactOutput.includes("</head>") ? compactOutput.replace("</head>", `${compactCss}</head>`) : `${compactCss}${compactOutput}`;
    compactOutput = compactOutput.includes("<body")
      ? compactOutput.replace(/<body([^>]*)>/i, `<body$1>${compactHeader}`)
      : `${compactHeader}${compactOutput}`;
    return compactOutput;
  }

  const documentHeaderVisibility = preserveDocumentHeader ? "" : `
      body > .print-header,
      main > .print-header,
      .journey-print-header,
      .journey-print-topline,
      .report-header,
      .pdf > .print-header { display: none !important; }`;
  const footerAlignment = footerAtBottom && includeFooter ? `
      html { height: 100% !important; }
      body {
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        min-height: 100% !important;
        box-sizing: border-box !important;
      }
      .content,
      .hospai-print-content,
      .label-grid,
      body > section,
      body > main,
      body > div:not(.hospai-shared-print-shell):not(.hospai-shared-print-footer):not(.hospai-shared-watermark) {
        flex: 1 0 auto !important;
      }
      .hospai-shared-print-footer,
      .ayu-shared-footer-shell {
        flex: 0 0 auto !important;
        margin-top: auto !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }` : "";

  const sharedCss = `
    <style data-hospai-shared-print-style>
      @page { size: A4 portrait; margin: ${pageMargin}; }
      * { box-sizing: border-box; }
      html { background: #fff !important; }
      body { margin: 0 !important; padding: ${bodyPadding} !important; color: #000 !important; background: transparent !important; position: relative; z-index: 0; }
      .hospai-shared-watermark {
        display: none !important;
      }
      .hospai-shared-print-shell {
        width: 100%;
        margin: 0 0 7mm;
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
        break-inside: avoid;
      }
      .hospai-shared-brand-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        min-height: 32mm;
      }
      .hospai-shared-brand-logo {
        width: 86mm;
        max-width: 100%;
        height: 27mm;
        object-fit: contain;
        object-position: left top;
        display: block;
      }
      .hospai-shared-address {
        margin: 0;
        font-size: 9.2pt;
        line-height: 1.34;
        font-weight: bold;
        text-align: right;
        white-space: nowrap;
      }
      .hospai-shared-header-divider {
        width: 100%;
        margin: 1.5mm 0 4mm;
        border-top: 0.65mm solid #000;
      }
      .hospai-shared-report-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 67mm;
        align-items: start;
        gap: 8mm;
      }
      .hospai-shared-report-title h1 {
        margin: 0 0 1.3mm;
        font-size: 15pt;
        line-height: 1.15;
        font-weight: 800;
        color: #000;
        text-decoration: none;
      }
      .hospai-shared-report-title p {
        margin: 0;
        font-size: 9.8pt;
        line-height: 1.3;
        color: #333;
      }
      .hospai-shared-report-meta {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5pt;
      }
      .hospai-shared-report-meta td { padding: 0 0 1.5mm; border: 0 !important; background: transparent !important; vertical-align: top; }
      .hospai-shared-report-meta td:first-child { width: 30mm; white-space: nowrap; }
      .hospai-shared-report-meta td:nth-child(2) { width: 5mm; text-align: center; padding: 0 1mm; }
      .hospai-shared-report-meta td:last-child { font-weight: 600; text-align: right; }
      ${documentHeaderVisibility}
      .hospai-shared-print-footer {
        position: relative;
        min-height: 30mm;
        height: auto;
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #000;
        background: #fff;
      }
      .hospai-shared-footer-rule {
        position: absolute;
        top: 5.4mm;
        height: 0;
        border-top: 0.45mm solid #000;
      }
      .hospai-shared-footer-rule.left { left: 0; width: calc(50% - 8.5mm); }
      .hospai-shared-footer-rule.right { right: 0; width: calc(50% - 8.5mm); }
      .hospai-shared-footer-symbol {
        position: absolute;
        left: 50%;
        top: -0.2mm;
        width: 13mm;
        height: 15mm;
        transform: translateX(-50%);
        object-fit: contain;
        object-position: center center;
        background: #fff;
        padding: 0 0.8mm;
      }
      .hospai-shared-footer-copy {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0.3mm;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 14mm;
        font-size: 8pt;
        line-height: 1;
        font-style: italic;
        font-weight: 700;
      }
      .hospai-shared-footer-copy span:last-child { text-align: right; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      @media screen { .hospai-shared-print-footer { display: none; } }
      @media print {
        .hospai-shared-print-footer { display: block; }
        .hospai-shared-print-shell { display: block; }
      }
      ${footerAlignment}
    </style>`;

  const header = preserveDocumentHeader ? "" : `
    <header class="hospai-shared-print-shell" data-hospai-shared-print-shell>
      ${renderAyuPdfHeaderHtml({ title: rawTitle, printDate, printTime, generatedBy: "Ayu Polyclinic System" })}
    </header>`;

  const footer = includeFooter ? `
    <footer class="hospai-shared-print-footer" data-hospai-shared-print-footer>
      ${renderAyuPdfFooterHtml("Page 1 of 1", includeSignature)}
    </footer>` : "";

  let output = html;
  output = output.includes("</head>") ? output.replace("</head>", `${sharedCss}</head>`) : `${sharedCss}${output}`;
  output = output.includes("<body")
    ? output.replace(/<body([^>]*)>/i, `<body$1>${header}`)
    : `${header}${output}`;
  output = output.includes("</body>") ? output.replace("</body>", `${footer}</body>`) : `${output}${footer}`;
  return output;
}

export function printViaIframe(
  html: string,
  frameId = "__hospai_print_frame__",
  options: SharedPrintOptions = {},
): void {
  const existing = document.getElementById(frameId);
  if (existing) existing.remove();

  const iframe = document.createElement("iframe");
  iframe.id = frameId;
  iframe.setAttribute(
    "style",
    "position:fixed;right:100%;bottom:100%;width:1000px;height:1000px;border:none;opacity:0;pointer-events:none;"
  );
  document.body.appendChild(iframe);

  const standardizedHtml = applySharedHospaiPrintFrame(html, options);
  const blob = new Blob([standardizedHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  iframe.onload = () => {
    // Small delay lets fonts/images inside the blob document fully paint
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        // Clean up after the user closes/submits the print dialog
        setTimeout(() => {
          try {
            iframe.remove();
            URL.revokeObjectURL(url);
          } catch {
            /* already removed */
          }
        }, 4000);
      }
    }, 400);
  };

  iframe.src = url;
}
