"""Export utilities for generating PDF and Word documents from OCR text"""
import io
import os
import re
from datetime import datetime
from functools import lru_cache
from fpdf import FPDF
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

BRAND_NAME = "AYU POLYCLINIC & EMERGENCY CLINIC"
BRAND_TAGLINE = "POLYCLINIC & DIAGNOSTICS"


@lru_cache(maxsize=1)
def _frontend_logo_path():
    """Return the approved black Ayu Polyclinic & Emergency Clinic print logo for offline/PyInstaller builds."""
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    meipass = getattr(__import__("sys"), "_MEIPASS", "")
    candidates = [
        os.path.join(root, "backend", "assets", "hospai_print_logo.png"),
        os.path.join(root, "assets", "hospai_print_logo.png"),
        os.path.join(meipass, "assets", "hospai_print_logo.png") if meipass else "",
        os.path.join(root, "frontend", "public", "hospai_print_logo.png"),
        os.path.join(root, "frontend", "dist", "hospai_print_logo.png"),
    ]
    return next((path for path in candidates if path and os.path.exists(path)), None)


@lru_cache(maxsize=1)
def _footer_symbol_path():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    candidates = [
        os.path.join(root, "backend", "assets", "hospai_medical_symbol.png"),
        os.path.join(root, "assets", "hospai_medical_symbol.png"),
        os.path.join(getattr(__import__("sys"), "_MEIPASS", ""), "assets", "hospai_medical_symbol.png"),
    ]
    return next((path for path in candidates if path and os.path.exists(path)), None)


@lru_cache(maxsize=2)
def _clinic_pdf_asset_path(filename: str):
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    meipass = getattr(__import__("sys"), "_MEIPASS", "")
    candidates = [
        os.path.join(root, "backend", "assets", filename),
        os.path.join(root, "assets", filename),
        os.path.join(meipass, "assets", filename) if meipass else "",
        os.path.join(root, "frontend", "public", filename),
    ]
    return next((path for path in candidates if path and os.path.exists(path)), None)


def draw_pdf_brand_header(pdf, left_margin: float, top_y: float, title_width: float = 120, is_prescription: bool = False, use_ayu_logo: bool = False, include_doctor_details: bool = True):
    """Draw the approved Ayu Polyclinic & Emergency Clinic logo/address header used by every PDF export."""
    logo_path = _frontend_logo_path()
    
    if is_prescription:
        # Top Left Header
        pdf.set_xy(left_margin, top_y)
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(30, 86, 122) # Same blue
        pdf.cell(pdf.get_string_width(BRAND_NAME) + 1, 7, BRAND_NAME, ln=True)
        
        pdf.set_x(left_margin)
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(100, 6, "Dr. Sushanth. B", ln=True)
        
        pdf.set_x(left_margin)
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(100, 4.5, "MBBS (Gandhi), (FCCM)", ln=True)
        
        pdf.set_x(left_margin)
        pdf.cell(100, 4.5, "TSMC/FM/27444", ln=True)
        
        symbol_path = _footer_symbol_path()
        if symbol_path:
            try:
                pdf.image(symbol_path, x=160, y=top_y, w=30)
            except Exception:
                pass
        
        pdf.set_text_color(0, 0, 0)
        # No bottom line under the header for prescription

    else:
        pdf.set_text_color(29, 66, 137)
        pdf.set_xy(left_margin, top_y)
        pdf.set_font("Helvetica", "B", 17)
        brand_w = pdf.get_string_width(BRAND_NAME)
        pdf.cell(brand_w + 1, 8, BRAND_NAME, ln=True)
        pdf.set_draw_color(29, 66, 137)
        pdf.set_line_width(0.45)
        # Underline spans the clinic name (fpdf cells pad text by c_margin on the left)
        pdf.line(left_margin, top_y + 9, left_margin + pdf.c_margin + brand_w, top_y + 9)

        if include_doctor_details:
            pdf.set_xy(left_margin, top_y + 11)
            pdf.set_font("Helvetica", "B", 12.5)
            pdf.cell(125, 6, "Dr. Sushanth. B", ln=True)
            pdf.set_x(left_margin)
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(125, 4.5, "MBBS (Gandhi), (FCCM)", ln=True)
            pdf.set_x(left_margin)
            pdf.cell(125, 4.5, "TSMC/FM/27444", ln=True)

        logo_path = _frontend_logo_path() if use_ayu_logo else _clinic_pdf_asset_path("ayu_caduceus.png")
        if logo_path:
            try:
                pdf.image(logo_path, x=170, y=top_y, w=22)
            except Exception:
                pass
        pdf.set_text_color(0, 0, 0)
        pdf.set_y(top_y + (34 if include_doctor_details else 16))


def draw_pdf_brand_footer(pdf, is_prescription: bool = False, left_margin: float = 15, right_margin: float = 15, include_signature: bool = True):
    """Draw the standardized, pixel-perfect Ayu Polyclinic & Emergency Clinic footer across all modules and pages."""
    def _clean(val) -> str:
        text = "" if val is None else str(val)
        text = text.replace("₹", "Rs.").replace("•", "-").replace("–", "-").replace("—", "-")
        return text.encode("latin-1", errors="replace").decode("latin-1")

    page_w = getattr(pdf, "w", 210.0)
    page_h = getattr(pdf, "h", 297.0)
    footer_y = page_h - 21.5

    # Optional signature area above footer (for reports/bills with signature)
    if include_signature and not is_prescription:
        sig_w = 54.0
        sig_x = page_w - right_margin - sig_w
        sig_y = footer_y - 7.5
        pdf.set_draw_color(29, 66, 137)
        pdf.set_line_width(0.35)
        pdf.line(sig_x, sig_y, sig_x + sig_w, sig_y)
        pdf.set_xy(sig_x, sig_y + 1.0)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(29, 66, 137)
        pdf.cell(sig_w, 3.5, _clean("SIGNATURE"), align="C")

    # Standard top divider rule
    pdf.set_draw_color(29, 66, 137)
    pdf.set_line_width(0.35)
    pdf.line(left_margin, footer_y - 1.5, page_w - right_margin, footer_y - 1.5)

    # 1. Left Column: Emergency & Home Care Services
    left_x = left_margin
    pdf.set_font("Helvetica", "", 8.0)
    pdf.set_text_color(30, 86, 122)
    pdf.set_xy(left_x, footer_y)
    pdf.cell(48, 3.8, _clean("• 24/7 Emergency"), ln=False)
    pdf.set_xy(left_x, footer_y + 3.8)
    pdf.cell(48, 3.8, _clean("• Ambulance Service"), ln=False)
    pdf.set_xy(left_x, footer_y + 7.6)
    pdf.cell(48, 3.8, _clean("• Home Care Service Available"), ln=False)

    # Ambulance Icon: Vertically centered next to emergency bullets
    amb_x = left_x + 50.0
    amb_y = footer_y + 2.5
    pdf.set_fill_color(30, 86, 122)
    pdf.rect(amb_x, amb_y, 8.5, 6.0, "F")
    pdf.rect(amb_x + 8.5, amb_y + 2.5, 3.2, 3.5, "F")
    pdf.set_fill_color(0, 0, 0)
    pdf.ellipse(amb_x + 1.6, amb_y + 5.0, 2.2, 2.2, "F")
    pdf.ellipse(amb_x + 8.2, amb_y + 5.0, 2.2, 2.2, "F")
    pdf.set_fill_color(255, 255, 255)
    pdf.rect(amb_x + 3.4, amb_y + 1.2, 1.4, 3.6, "F")
    pdf.rect(amb_x + 2.3, amb_y + 2.3, 3.6, 1.4, "F")

    # 2. Vertical Divider Rule
    pdf.set_draw_color(30, 86, 122)
    pdf.set_line_width(0.4)
    pdf.line(78.0, footer_y, 78.0, footer_y + 12.5)

    # 3. Right Column: Address, Phone & Email
    right_x = 86.0
    pdf.set_font("Helvetica", "", 7.8)
    pdf.set_text_color(30, 86, 122)

    # Location Pin Icon
    px, py = right_x - 3.8, footer_y + 0.3
    pdf.set_fill_color(30, 86, 122)
    pdf.ellipse(px, py, 2.6, 2.6, "F")
    pdf.polygon(((px, py + 1.3), (px + 2.6, py + 1.3), (px + 1.3, py + 3.6)), "F")
    pdf.set_fill_color(255, 255, 255)
    pdf.ellipse(px + 0.8, py + 0.8, 1.0, 1.0, "F")

    # Address Text
    pdf.set_xy(right_x, footer_y)
    pdf.cell(105, 3.4, _clean("GGF2+2F8, Old Alwal Road, Jonnabanda,"), ln=False)
    pdf.set_xy(right_x, footer_y + 3.4)
    pdf.cell(105, 3.4, _clean("Chetana Housing Colony, Brundavan Colony,"), ln=False)
    pdf.set_xy(right_x, footer_y + 6.8)
    pdf.cell(105, 3.4, _clean("Bollaram - 500010, Hyderabad."), ln=False)

    # Phone Icon
    ph_x, ph_y = right_x - 3.8, footer_y + 10.3
    pdf.set_fill_color(30, 86, 122)
    pdf.rect(ph_x, ph_y, 2.2, 3.2, "F")
    pdf.set_fill_color(255, 255, 255)
    pdf.rect(ph_x + 0.3, ph_y + 0.3, 1.6, 2.0, "F")

    # Phone Text
    pdf.set_xy(right_x, footer_y + 10.2)
    pdf.cell(28, 3.4, _clean("+91 6303346810"), ln=False)

    # Email Icon
    em_x, em_y = right_x + 30.0, footer_y + 10.6
    pdf.set_draw_color(30, 86, 122)
    pdf.set_fill_color(255, 255, 255)
    pdf.set_line_width(0.3)
    pdf.rect(em_x, em_y, 3.6, 2.6, "D")
    pdf.line(em_x, em_y, em_x + 1.8, em_y + 1.3)
    pdf.line(em_x + 3.6, em_y, em_x + 1.8, em_y + 1.3)

    # Email Text
    pdf.set_xy(em_x + 4.8, footer_y + 10.2)
    pdf.cell(60, 3.4, _clean("dr.sushanth108@gmail.com"), ln=False)

    # Standard bottom divider rule matching reference Screenshot 3
    pdf.set_draw_color(29, 66, 137)
    pdf.set_line_width(0.35)
    pdf.line(left_margin, footer_y + 13.8, page_w - right_margin, footer_y + 13.8)

    # Centered "Powered by HospAI" text directly below footer rule
    pdf.set_xy(0, footer_y + 14.8)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(30, 86, 122)
    pdf.cell(page_w, 4.0, _clean("Powered by HospAI"), align="C")

    pdf.set_text_color(0, 0, 0)


def parse_markdown_line(line):
    """Parse a line and return (type, content, is_bold_segments)
    Types: header, bullet, table_row, text
    """
    line = line.strip()
    if not line:
        return ("empty", "", [])

    header_match = re.match(r"^(#{1,6})\s+(.+)$", line)
    if header_match:
        return ("header", header_match.group(2).replace("**", ""), [])

    bullet_match = re.match(r"^[\•\-\*]\s+(.+)$", line)
    if bullet_match:
        content = bullet_match.group(1)
        return ("bullet", content, parse_bold_segments(content))

    if line.startswith("|") and line.endswith("|"):
        if re.match(r"^\|[\s\-\|:]+\|$", line):
            return ("table_sep", "", [])
        cells = [c.strip().replace("**", "") for c in line.strip("|").split("|")]
        return ("table_row", cells, [])

    return ("text", line, parse_bold_segments(line))


def parse_bold_segments(text):
    """Parse text and return list of (text, is_bold) tuples"""
    segments = []
    pattern = r"\*\*([^*]+)\*\*"
    last_end = 0

    for match in re.finditer(pattern, text):
        if match.start() > last_end:
            segments.append((text[last_end:match.start()], False))
        segments.append((match.group(1), True))
        last_end = match.end()

    if last_end < len(text):
        segments.append((text[last_end:], False))

    if not segments:
        segments = [(text, False)]

    return segments


_NON_PATIENT_DOC_TYPES = {"executive_dashboard", "reports_overview"}


def generate_pdf(patient_name: str, doc_type: str, ocr_text: str, date_str: str = None) -> bytes:
    """Generate a hospital-standard A4 PDF with client hospital branding."""
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    is_patient_document = (doc_type or "").strip().lower() not in _NON_PATIENT_DOC_TYPES
    is_prescription = "prescription" in (doc_type or "").lower()

    class HospitalDocumentPDF(FPDF):
        def footer(self):
            draw_pdf_brand_footer(self, is_prescription=is_prescription, left_margin=15, right_margin=15)

    def _title_for_doc(value: str) -> str:
        normalized = (value or "").replace("-", "_").lower()
        if "prescription" in normalized:
            return "Doctor Prescription"
        if "discharge" in normalized:
            return "Discharge Summary"
        if "patient_journey" in normalized or "journey" in normalized:
            return "Patient Journey Report"
        return (value or "Medical Document").replace("_", " ").title()

    def _pdf_clean(value) -> str:
        text = "" if value is None else str(value)
        text = text.replace("₹", "Rs.").replace("•", "-").replace("–", "-").replace("—", "-")
        return text.encode("latin-1", errors="replace").decode("latin-1")

    def _ensure_space(height: float):
        footer_limit = 276 if is_prescription else 238
        if pdf.get_y() + height > footer_limit:
            pdf.add_page()
            _draw_document_header()

    def _cell_label_value(label: str, value: str, x: float, y: float, w: float, h: float = 12):
        pdf.set_xy(x, y)
        pdf.set_fill_color(248, 252, 255)
        pdf.set_draw_color(210, 226, 236)
        pdf.rect(x, y, w, h, style="DF")
        pdf.set_xy(x + 2.5, y + 2)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(59, 89, 111)
        pdf.cell(w - 5, 3.5, _pdf_clean(label.upper()), ln=True)
        pdf.set_x(x + 2.5)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(15, 23, 42)
        pdf.multi_cell(w - 5, 4, _pdf_clean(value or "-"))
        pdf.set_text_color(0, 0, 0)

    def _draw_document_header():
        draw_pdf_brand_header(pdf, left_margin, 8, title_width=92, is_prescription=is_prescription)
        
        if is_prescription:
            pdf.set_xy(left_margin, 40)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(30, 86, 122)
            
            pdf.cell(135, 6, "")
            pdf.cell(10, 6, "Date:")
            pdf.line(pdf.get_x(), pdf.get_y()+4.5, 195, pdf.get_y()+4.5)
            pdf.set_text_color(0, 0, 0)
            try:
                gdt = datetime.strptime(date_str, "%Y-%m-%d %H:%M") if date_str else datetime.now()
                pdf.cell(30, 6, _pdf_clean(gdt.strftime("%d/%m/%Y")))
            except:
                pdf.cell(30, 6, _pdf_clean(date_str or ""))
            pdf.ln(8)
            
            pdf.set_x(left_margin)
            pdf.set_text_color(30, 86, 122)
            pdf.cell(22, 6, "Patient Name:")
            pdf.line(pdf.get_x(), pdf.get_y()+4.5, 195, pdf.get_y()+4.5)
            pdf.set_text_color(0, 0, 0)
            pdf.cell(100, 6, _pdf_clean(patient_name or ""))
            pdf.ln(8)
            
            pdf.set_x(left_margin)
            pdf.set_text_color(30, 86, 122)
            pdf.cell(16, 6, "Address:")
            pdf.line(pdf.get_x(), pdf.get_y()+4.5, 140, pdf.get_y()+4.5)
            pdf.cell(110, 6, "")
            
            pdf.set_xy(150, pdf.get_y())
            pdf.cell(8, 6, "Age:")
            pdf.line(pdf.get_x(), pdf.get_y()+4.5, 195, pdf.get_y()+4.5)
            pdf.ln(8)
            
            pdf.set_x(left_margin)
            pdf.set_text_color(30, 86, 122)
            pdf.cell(18, 6, "Diagnosis:")
            pdf.line(pdf.get_x(), pdf.get_y()+4.5, 195, pdf.get_y()+4.5)
            pdf.ln(12)
            
            pdf.set_x(left_margin)
            pdf.set_font("Helvetica", "B", 26)
            pdf.set_text_color(30, 86, 122)
            pdf.cell(20, 10, "Rx", ln=False)
            
            # Draw cross on Rx leg
            pdf.set_draw_color(30, 86, 122)
            pdf.set_line_width(0.7)
            cx, cy = pdf.get_x() - 10, pdf.get_y() + 7
            pdf.line(cx - 1.5, cy - 1.5, cx + 1.5, cy + 1.5)
            
            pdf.ln(10)
            pdf.set_text_color(0, 0, 0)
            
            pdf.set_y(pdf.get_y() + 5)
        else:
            pdf.set_xy(left_margin, 45)
            pdf.set_font("Helvetica", "B", 15)
            pdf.set_text_color(30, 86, 122)
            pdf.cell(105, 6, _pdf_clean(document_title), ln=True)
            pdf.set_text_color(0, 0, 0)
            pdf.set_x(left_margin)
            pdf.set_font("Helvetica", "", 8.5)
            pdf.cell(105, 5, _pdf_clean("Ayu Polyclinic & Emergency Clinic | Pharmacy | Diagnostic"))

            try:
                generated_dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M")
            except Exception:
                generated_dt = datetime.now()
            meta = (
                ("Print Date", generated_dt.strftime("%d/%m/%Y")),
                ("Generated By", "HospAI System"),
                ("Generated Time", generated_dt.strftime("%I:%M:%S %p")),
            )
            y = 45
            for label, value in meta:
                pdf.set_xy(130, y)
                pdf.set_font("Helvetica", "", 7.8)
                pdf.cell(27, 5, _pdf_clean(label))
                pdf.cell(5, 5, ":", align="C")
                pdf.cell(38, 5, _pdf_clean(value))
                y += 5
            pdf.set_text_color(0, 0, 0)
            pdf.set_y(64)

    def _section(title: str):
        _ensure_space(15)
        pdf.ln(2)
        if is_prescription:
            pdf.set_fill_color(231, 247, 250)
            pdf.set_draw_color(190, 222, 233)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(11, 95, 118)
            pdf.cell(effective_width, 8, _pdf_clean(title), border=1, fill=True, ln=True)
        else:
            pdf.set_fill_color(30, 86, 122)
            pdf.set_draw_color(30, 86, 122)
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(255, 255, 255)
            # Add some padding manually for non-prescription
            pdf.cell(effective_width, 8, "  " + _pdf_clean(title), border=1, fill=True, ln=True)
        pdf.set_text_color(0, 0, 0)

    def _paragraph(text: str):
        for raw in (text or "-").splitlines() or ["-"]:
            _ensure_space(8)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(30, 41, 59)
            pdf.multi_cell(effective_width, 5, _pdf_clean(raw.strip() or " "))
        pdf.set_text_color(0, 0, 0)

    def _two_column_details(rows):
        y = pdf.get_y()
        col_w = (effective_width - 4) / 2
        for index, (label, value) in enumerate(rows):
            if index % 2 == 0:
                _ensure_space(14)
                y = pdf.get_y()
            x = left_margin + (col_w + 4) * (index % 2)
            _cell_label_value(label, value, x, y, col_w, 13)
            if index % 2 == 1:
                pdf.set_y(y + 15)
        if len(rows) % 2 == 1:
            pdf.set_y(y + 15)

    def _markdown_table(cells):
        col_count = max(len(cells), 1)
        col_w = effective_width / col_count
        _ensure_space(8)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(241, 248, 252)
        pdf.set_draw_color(215, 226, 236)
        for cell in cells:
            pdf.cell(col_w, 7, _pdf_clean(cell)[:24], border=1, fill=True)
        pdf.ln(7)

    pdf = HospitalDocumentPDF(format="A4")
    left_margin = 15
    right_margin = 15
    document_title = _title_for_doc(doc_type)
    pdf.set_left_margin(left_margin)
    pdf.set_right_margin(right_margin)
    pdf.set_auto_page_break(auto=True, margin=20 if is_prescription else 58)
    pdf.alias_nb_pages()
    pdf.add_page()

    page_width = pdf.w
    effective_width = page_width - left_margin - right_margin

    _draw_document_header()
    if is_patient_document:
        if not is_prescription:
            _section("Patient Information")
            _two_column_details([
                ("Patient Name", patient_name or "-"),
                ("Document Type", document_title),
                ("Generated On", date_str),
                ("Hospital System", BRAND_NAME),
            ])
            _section("Clinical Document Details")
    else:
        if not is_prescription:
            _section("Document Information")
            _two_column_details([
                ("Report Title", patient_name or document_title),
                ("Document Type", document_title),
                ("Generated On", date_str),
                ("Hospital System", BRAND_NAME),
            ])
            _section("Clinical Document Details")

    lines = ocr_text.split("\n")
    current_table_header = None

    for line in lines:
        line_type, content, segments = parse_markdown_line(line)

        if line_type == "empty":
            pdf.ln(2)
            continue

        if line_type == "header":
            current_table_header = None
            _section(content)
            continue

        if line_type == "bullet":
            _ensure_space(8)
            pdf.set_x(left_margin + 3)
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(5, 5, "-")
            for text, is_bold in segments:
                text = text.replace("**", "")
                pdf.set_font("Helvetica", "B" if is_bold else "", 10)
                pdf.write(5, _pdf_clean(text))
            pdf.ln(5)
            continue

        if line_type == "table_row":
            if current_table_header is None:
                current_table_header = content
                _markdown_table(content)
            else:
                col_count = max(len(current_table_header), len(content), 1)
                col_w = effective_width / col_count
                row_h = 7
                _ensure_space(row_h)
                pdf.set_font("Helvetica", "", 8)
                pdf.set_draw_color(225, 233, 240)
                for index in range(col_count):
                    value = content[index] if index < len(content) else ""
                    pdf.cell(col_w, row_h, _pdf_clean(value)[:28], border=1)
                pdf.ln(row_h)
            continue

        if line_type == "table_sep":
            continue

        if line_type == "text":
            current_table_header = None
            _ensure_space(8)
            for text, is_bold in segments:
                text = text.replace("**", "")
                pdf.set_font("Helvetica", "B" if is_bold else "", 10)
                pdf.write(5.3, _pdf_clean(text))
            pdf.ln(5.5)

    if "prescription" in (doc_type or "").lower():
        pdf.ln(18)
        pdf.set_draw_color(0, 0, 0)
        pdf.line(132, pdf.get_y(), 190, pdf.get_y())
        pdf.set_xy(132, pdf.get_y() + 2)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(58, 5, _pdf_clean("SIGNATURE"), align="C")
    elif "discharge" in (doc_type or "").lower():
        _section("Doctor Certification")
        _paragraph("The above discharge summary has been prepared from available hospital records and clinical notes.")
        pdf.ln(10)
        pdf.set_draw_color(120, 140, 160)
        pdf.line(132, pdf.get_y(), 190, pdf.get_y())
        pdf.set_xy(132, pdf.get_y() + 2)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(58, 5, _pdf_clean("Consultant Signature / Seal"), align="C")

    return bytes(pdf.output())


def generate_standard_report_pdf(payload: dict) -> bytes:
    """Renders the frontend's StandardPdfPayload (title/subtitle/patient_info/
    sections-of-real-table-rows/totals/payment_details) into a real branded
    PDF. Used by every module's generic 'Download PDF' button (Dashboard,
    Billing, Lab, Patients, Patient Journey) -- previously this endpoint
    silently ignored the payload and always returned the reports-overview
    PDF instead, so every one of those buttons downloaded the wrong report."""

    def _clean(value) -> str:
        text = "" if value is None else str(value)
        text = text.replace("₹", "Rs.").replace("•", "-").replace("–", "-").replace("—", "-")
        return text.encode("latin-1", errors="replace").decode("latin-1")

    use_ayu_logo = payload.get("brand_logo") == "ayu"
    include_signature = payload.get("include_signature", True)
    include_doctor_details = payload.get("include_doctor_details", True)

    class ReportPDF(FPDF):
        def header(self):
            draw_pdf_brand_header(self, left_margin, 8, title_width=92, is_prescription=False, use_ayu_logo=use_ayu_logo, include_doctor_details=include_doctor_details)

        def footer(self):
            draw_pdf_brand_footer(self, is_prescription=False, left_margin=left_margin, right_margin=right_margin, include_signature=include_signature)

    page1_top_y = 22 if not include_doctor_details else 38
    subsequent_top_y = 28 if not include_doctor_details else 42
    content_top_min = subsequent_top_y
    pdf = ReportPDF(format="A4")
    left_margin = 15
    right_margin = 15
    pdf.set_left_margin(left_margin)
    pdf.set_right_margin(right_margin)
    pdf.set_top_margin(content_top_min)
    pdf.set_auto_page_break(auto=True, margin=26)
    pdf.alias_nb_pages()
    pdf.add_page()
    pdf.set_y(page1_top_y)

    page_width = pdf.w
    effective_width = page_width - left_margin - right_margin

    def _ensure_space(height: float):
        if pdf.get_y() + height > 270:
            pdf.add_page()
            pdf.set_y(subsequent_top_y)

    def _draw_icon(pdf, icon_type, x, y, size=4):
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(255, 255, 255)
        pdf.set_line_width(0.3)
        if "dashboard" in icon_type.lower():
            # bar chart
            pdf.rect(x, y + size*0.4, size*0.25, size*0.6, style="F")
            pdf.rect(x + size*0.4, y + size*0.1, size*0.25, size*0.9, style="F")
            pdf.rect(x + size*0.8, y - size*0.2, size*0.25, size*1.2, style="F")
        elif "operation" in icon_type.lower():
            # cog / gear
            try:
                pdf.ellipse(x, y, size, size, style="F")
                pdf.set_fill_color(30, 86, 122)
                pdf.ellipse(x + size*0.25, y + size*0.25, size*0.5, size*0.5, style="F")
                pdf.set_fill_color(255, 255, 255)
                # gear teeth approximation
                pdf.rect(x + size*0.35, y - size*0.15, size*0.3, size*1.3, style="F")
                pdf.rect(x - size*0.15, y + size*0.35, size*1.3, size*0.3, style="F")
                pdf.set_fill_color(30, 86, 122)
                pdf.ellipse(x + size*0.25, y + size*0.25, size*0.5, size*0.5, style="F")
            except:
                pdf.ellipse(x, y, size, size, style="F")
        elif "revenue" in icon_type.lower():
            # circle with rupee symbol approximation (R)
            try:
                pdf.ellipse(x, y, size, size, style="D")
                pdf.set_font("Helvetica", "B", size * 1.5)
                pdf.set_text_color(255, 255, 255)
                pdf.set_xy(x + size*0.05, y)
                pdf.cell(size, size*0.8, "R", align="C")
            except:
                pdf.ellipse(x, y, size, size, style="F")
        elif "payment" in icon_type.lower():
            # credit card
            pdf.rect(x, y + size*0.1, size*1.2, size*0.8, style="F")
            pdf.set_draw_color(30, 86, 122)
            pdf.set_line_width(0.5)
            pdf.line(x, y + size*0.35, x + size*1.2, y + size*0.35)
        else:
            # default circle
            try:
                pdf.ellipse(x + size*0.25, y + size*0.25, size*0.5, size*0.5, style="F")
            except:
                pdf.rect(x, y, size, size, style="F")

    def _section(title: str):
        _ensure_space(14)
        pdf.ln(1.5)
        pdf.set_fill_color(30, 86, 122)
        pdf.set_draw_color(30, 86, 122)
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_text_color(255, 255, 255)
        
        y_before = pdf.get_y()
        pdf.cell(effective_width, 7.5, "        " + _clean(title), border=1, fill=True, ln=True)
        y_after = pdf.get_y()
        
        # draw icon manually
        _draw_icon(pdf, title, left_margin + 3.5, y_before + 1.8, size=3.8)
        
        pdf.set_xy(left_margin, y_after)
        pdf.set_text_color(0, 0, 0)

    def _cell_label_value(label: str, value: str, x: float, y: float, w: float, h: float = 12):
        pdf.set_xy(x, y)
        pdf.set_fill_color(248, 252, 255)
        pdf.set_draw_color(210, 226, 236)
        pdf.rect(x, y, w, h, style="DF")
        pdf.set_xy(x + 2.5, y + 2)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(59, 89, 111)
        pdf.cell(w - 5, 3.5, _clean(label.upper()), ln=True)
        pdf.set_x(x + 2.5)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(15, 23, 42)
        pdf.multi_cell(w - 5, 4, _clean(value or "-"))
        pdf.set_text_color(0, 0, 0)

    def _two_column_details(rows):
        y = pdf.get_y()
        col_w = (effective_width - 4) / 2
        for index, (label, value) in enumerate(rows):
            if index % 2 == 0:
                _ensure_space(14)
                y = pdf.get_y()
            x = left_margin + (col_w + 4) * (index % 2)
            _cell_label_value(label, value, x, y, col_w, 13)
            if index % 2 == 1:
                pdf.set_y(y + 15)
        if len(rows) % 2 == 1:
            pdf.set_y(y + 15)

    _NARROW_TABLE_HEADERS = {
        "time", "date", "charge", "received", "qty", "quantity", "status",
        "unit price", "amount", "rate", "discount",
    }

    def _table(headers, rows):
        col_count = max(len(headers), 1)
        narrow = [h.strip().lower() in _NARROW_TABLE_HEADERS for h in headers]
        narrow_w = min(24.0, effective_width / col_count)
        wide_count = max(sum(1 for n in narrow if not n), 1)
        remaining = effective_width - narrow_w * sum(1 for n in narrow if n)
        wide_w = remaining / wide_count
        col_widths = [narrow_w if n else wide_w for n in narrow]

        _ensure_space(8)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(229, 239, 245)
        pdf.set_draw_color(215, 230, 240)
        pdf.set_text_color(30, 86, 122)
        for h, w in zip(headers, col_widths):
            pdf.cell(w, 6.5, _clean(h)[:30], border=1, fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(6.5)
        pdf.set_font("Helvetica", "", 8.5)
        for row in rows:
            cell_texts = [_clean(row[i] if i < len(row) else "") for i in range(col_count)]
            line_counts = [max(1, len(pdf.multi_cell(col_widths[i], 3.8, text, border=0, dry_run=True, output="LINES"))) for i, text in enumerate(cell_texts)]
            row_h = max(line_counts) * 3.8 + 1.8
            if pdf.get_y() + row_h > 268:
                pdf.add_page()
                pdf.set_y(subsequent_top_y)
                pdf.set_font("Helvetica", "B", 9)
                pdf.set_fill_color(229, 239, 245)
                pdf.set_draw_color(215, 230, 240)
                pdf.set_text_color(30, 86, 122)
                for h, w in zip(headers, col_widths):
                    pdf.cell(w, 6.5, _clean(h)[:30], border=1, fill=True)
                pdf.set_text_color(0, 0, 0)
                pdf.ln(6.5)
                pdf.set_font("Helvetica", "", 8.5)
            y = pdf.get_y()
            x = pdf.get_x()
            for i, text in enumerate(cell_texts):
                pdf.set_xy(x, y)
                pdf.multi_cell(col_widths[i], 3.8, text, border=1)
                x += col_widths[i]
            pdf.set_xy(left_margin, y + row_h)

    pdf.set_xy(left_margin, page1_top_y)
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_text_color(30, 86, 122)
    pdf.cell(effective_width, 6.5, _clean(payload.get("title") or "Hospital Report"), ln=True)
    
    pdf.set_x(left_margin)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(50, 50, 50)
    pdf.cell(effective_width, 4.5, _clean(payload.get("subtitle") or ""), ln=True)
    
    generated = datetime.now().strftime("%d/%m/%Y %I:%M %p")
    pdf.set_x(left_margin)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_text_color(50, 50, 50)
    pdf.cell(effective_width, 4.5, _clean(f"Generated: {generated}" + (f"  |  By: {payload.get('operator_name')}" if payload.get("operator_name") else "")), ln=True)
    pdf.set_text_color(0, 0, 0)
    content_start_min = page1_top_y + 16
    pdf.set_y(max(pdf.get_y() + 1.5, content_start_min))

    invoice_meta = payload.get("invoice_meta") or {}
    if invoice_meta.get("invoice_number") or invoice_meta.get("invoice_date"):
        _section("Invoice Details")
        _two_column_details([
            ("Invoice Number", invoice_meta.get("invoice_number") or "-"),
            ("Invoice Date", invoice_meta.get("invoice_date") or "-"),
        ])

    patient_info = payload.get("patient_info") or {}
    if patient_info:
        _section("Patient Information")
        rows = [
            ("Patient Name", patient_info.get("patient_name") or "-"),
            ("Patient ID", patient_info.get("patient_id") or "-"),
            ("Age / Gender", f"{patient_info.get('age') or '-'} / {patient_info.get('gender') or '-'}"),
            ("Mobile", patient_info.get("mobile") or "-"),
        ]
        if patient_info.get("consulting_doctor"):
            rows.append(("Consulting Doctor", patient_info.get("consulting_doctor")))
        if patient_info.get("address"):
            rows.append(("Address", patient_info.get("address")))
        _two_column_details(rows)

    for section in payload.get("sections") or []:
        _section(section.get("title") or "Details")
        headers = section.get("headers") or []
        rows = section.get("rows") or []
        if headers and rows:
            _table(headers, rows)
        elif not rows:
            _ensure_space(8)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(100, 116, 139)
            pdf.cell(effective_width, 7, _clean("No data recorded for this section."), ln=True)
            pdf.set_text_color(0, 0, 0)

    totals = payload.get("totals") or {}
    if totals:
        _section("Summary")
        tile_labels = [
            ("Subtotal", totals.get("subtotal")),
            ("Grand Total", totals.get("grand_total")),
            ("Amount Received", totals.get("amount_received")),
            ("Balance", totals.get("balance")),
        ]
        tile_labels = [(label, value) for label, value in tile_labels if value not in (None, "")]
        if tile_labels:
            tile_w = effective_width / len(tile_labels)
            y = pdf.get_y()
            for label, value in tile_labels:
                x = pdf.get_x()
                pdf.set_fill_color(248, 250, 252)
                pdf.set_draw_color(226, 232, 240)
                pdf.rect(x, y, tile_w - 3, 18, style="DF")
                pdf.set_xy(x + 3, y + 3)
                pdf.set_font("Helvetica", "B", 7)
                pdf.set_text_color(100, 116, 139)
                pdf.cell(tile_w - 6, 4, _clean(str(label).upper()))
                pdf.set_xy(x + 3, y + 9)
                pdf.set_font("Helvetica", "B", 12)
                pdf.set_text_color(15, 23, 42)
                pdf.cell(tile_w - 6, 6, _clean(str(value)))
                pdf.set_xy(x + tile_w, y)
            pdf.set_y(y + 22)
            pdf.set_text_color(0, 0, 0)

    payment_details = payload.get("payment_details") or {}
    if payment_details:
        _section("Payment Details")
        _two_column_details([
            ("Receipt Number", payment_details.get("receipt_number") or "-"),
            ("Payment Date", payment_details.get("payment_date") or "-"),
            ("Payment Mode", payment_details.get("payment_mode") or "-"),
            ("Amount Paid", str(payment_details.get("amount_paid") or "-")),
        ])

    return bytes(pdf.output())


def generate_word(patient_name: str, doc_type: str, ocr_text: str, date_str: str = None) -> bytes:
    """Generate Word document with OCR extracted text - properly formatted"""
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    doc = Document()

    brand = doc.add_paragraph()
    brand.alignment = WD_ALIGN_PARAGRAPH.CENTER
    brand_run = brand.add_run(BRAND_NAME)
    brand_run.bold = True
    brand_run.font.size = Pt(24)
    brand_run.font.color.rgb = RGBColor(20, 61, 94)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_run = subtitle.add_run(BRAND_TAGLINE)
    sub_run.font.size = Pt(10)
    sub_run.font.color.rgb = RGBColor(100, 100, 100)

    title = doc.add_heading("Medical Document Report", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()

    table = doc.add_table(rows=3, cols=2)
    table.style = "Table Grid"

    cells = table.rows[0].cells
    cells[0].text = "Patient Name"
    cells[1].text = patient_name

    cells = table.rows[1].cells
    cells[0].text = "Document Type"
    cells[1].text = doc_type.replace("_", " ").title()

    cells = table.rows[2].cells
    cells[0].text = "Date"
    cells[1].text = date_str

    for row in table.rows:
        row.cells[0].paragraphs[0].runs[0].bold = True

    doc.add_paragraph()

    lines = ocr_text.split("\n")

    for line in lines:
        line_type, content, segments = parse_markdown_line(line)

        if line_type == "empty":
            doc.add_paragraph()
            continue

        if line_type == "header":
            doc.add_heading(content, level=2)
            continue

        if line_type == "bullet":
            para = doc.add_paragraph(style="List Bullet")
            for text, is_bold in segments:
                text = text.replace("**", "")
                run = para.add_run(text)
                run.bold = is_bold
            continue

        if line_type == "table_row":
            para = doc.add_paragraph()
            para.add_run("    ".join(content))
            continue

        if line_type == "table_sep":
            continue

        if line_type == "text":
            para = doc.add_paragraph()
            for text, is_bold in segments:
                text = text.replace("**", "")
                run = para.add_run(text)
                run.bold = is_bold

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()
