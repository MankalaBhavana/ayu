import sys

with open(r'e:\ayu\backend\export_utils.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update draw_pdf_brand_header to take is_prescription and use new styling for others
old_header = """def draw_pdf_brand_header(pdf, left_margin: float, top_y: float, title_width: float = 120):
    \"\"\"Draw the approved Ayu Polyclinic logo/address header used by every PDF export.\"\"\"
    logo_path = _frontend_logo_path()
    if logo_path:
        try:
            from PIL import Image
            with Image.open(logo_path) as img:
                img_w, img_h = img.size
            max_w = 82
            max_h = 28
            ratio = min(max_w / img_w, max_h / img_h)
            final_w = img_w * ratio
            final_h = img_h * ratio
            pdf.image(logo_path, x=left_margin, y=top_y, w=final_w, h=final_h)
        except Exception:
            logo_path = None
    if not logo_path:
        pdf.set_xy(left_margin, top_y + 3)
        pdf.set_font("Helvetica", "B", 15)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(82, 12, BRAND_NAME)

    address_x = 130
    pdf.set_xy(address_x, top_y)
    pdf.set_font("Helvetica", "B", 8.1)
    pdf.set_text_color(0, 0, 0)
    for line in (
        "H.NO.1-2-288/23/2",
        "SBH COLONY, DOMALGUDA",
        "HYDERABAD, TELANGANA 500029",
        "Ph: 9949237676, 7032774699",
    ):
        pdf.cell(65, 4.5, line, ln=True)
        pdf.set_x(address_x)

    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.65)
    pdf.line(left_margin, top_y + 33, 195, top_y + 33)
    pdf.set_text_color(0, 0, 0)"""

new_header = """def draw_pdf_brand_header(pdf, left_margin: float, top_y: float, title_width: float = 120, is_prescription: bool = False):
    \"\"\"Draw the approved Ayu Polyclinic logo/address header used by every PDF export.\"\"\"
    logo_path = _frontend_logo_path()
    max_h = 28
    if logo_path:
        try:
            from PIL import Image
            with Image.open(logo_path) as img:
                img_w, img_h = img.size
            if is_prescription:
                max_w = 82
                max_h = 28
            else:
                max_w = 110
                max_h = 32
            ratio = min(max_w / img_w, max_h / img_h)
            final_w = img_w * ratio
            final_h = img_h * ratio
            pdf.image(logo_path, x=left_margin, y=top_y, w=final_w, h=final_h)
            max_h = final_h
        except Exception:
            logo_path = None
    if not logo_path:
        pdf.set_xy(left_margin, top_y + 3)
        pdf.set_font("Helvetica", "B", 15)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(82, 12, BRAND_NAME)

    if is_prescription:
        address_x = 130
        pdf.set_xy(address_x, top_y)
        pdf.set_font("Helvetica", "B", 8.1)
        pdf.set_text_color(0, 0, 0)
        for line in (
            "H.NO.1-2-288/23/2",
            "SBH COLONY, DOMALGUDA",
            "HYDERABAD, TELANGANA 500029",
            "Ph: 9949237676, 7032774699",
        ):
            pdf.cell(65, 4.5, line, ln=True)
            pdf.set_x(address_x)

        pdf.set_draw_color(0, 0, 0)
        pdf.set_line_width(0.65)
        pdf.line(left_margin, top_y + 33, 195, top_y + 33)
        pdf.set_text_color(0, 0, 0)
    else:
        pdf.set_draw_color(30, 86, 122)
        pdf.set_line_width(1.5)
        line_y = top_y + max_h + 3
        pdf.line(left_margin, line_y, 210 - left_margin, line_y)
        pdf.set_text_color(0, 0, 0)
        # Advance Y for non-prescriptions
        pdf.set_y(line_y + 2)"""

content = content.replace(old_header, new_header)


# 2. Update generate_pdf header call
old_call1 = "draw_pdf_brand_header(pdf, left_margin, 8, title_width=92)"
new_call1 = "draw_pdf_brand_header(pdf, left_margin, 8, title_width=92, is_prescription=is_prescription)"
content = content.replace(old_call1, new_call1)

# 3. Update generate_pdf Report Title color
old_title_pdf = """        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(105, 6, _pdf_clean(document_title), ln=True)"""
new_title_pdf = """        pdf.set_font("Helvetica", "B", 15)
        if not is_prescription:
            pdf.set_text_color(30, 86, 122)
        else:
            pdf.set_text_color(0, 0, 0)
        pdf.cell(105, 6, _pdf_clean(document_title), ln=True)
        pdf.set_text_color(0, 0, 0)"""
content = content.replace(old_title_pdf, new_title_pdf)


# 4. Update generate_pdf _section function
old_section1 = """    def _section(title: str):
        _ensure_space(15)
        pdf.ln(2)
        pdf.set_fill_color(231, 247, 250)
        pdf.set_draw_color(190, 222, 233)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(11, 95, 118)
        pdf.cell(effective_width, 8, _pdf_clean(title), border=1, fill=True, ln=True)
        pdf.set_text_color(0, 0, 0)"""

new_section1 = """    def _section(title: str):
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
        pdf.set_text_color(0, 0, 0)"""
content = content.replace(old_section1, new_section1)

# 5. Update generate_pdf Footer
old_footer1 = """        def footer(self):
            # Unified approved Ayu Polyclinic footer used by dashboard and exported reports.
            self.set_draw_color(0, 0, 0)
            self.set_line_width(0.45)
            self.line(15, 280.2, 95.5, 280.2)
            self.line(114.5, 280.2, 195.0, 280.2)
            symbol_path = _footer_symbol_path()
            if symbol_path:
                try:
                    self.image(symbol_path, x=98.5, y=274.0, w=13.0)
                except Exception:
                    pass
            self.set_y(-13.8)
            self.set_font("Helvetica", "I", 7.5)
            self.set_text_color(0, 0, 0)
            self.set_x(15)
            self.cell(82, 5, _pdf_clean("Thank you for choosing Ayu Polyclinic."), align="L")
            self.set_x(113)
            # "Valid for 7 days or 2 times" is prescription/report-refill language --
            # meaningless on an administrative export like the dashboard, so it's
            # skipped there rather than shown on every document regardless of type.
            if is_patient_document:
                self.cell(82, 5, _pdf_clean("Valid for 7 days or 2 times."), align="R")"""

new_footer1 = """        def footer(self):
            if is_prescription:
                self.set_draw_color(0, 0, 0)
            else:
                self.set_draw_color(30, 86, 122)
            self.set_line_width(0.45)
            self.line(15, 280.2, 95.5, 280.2)
            self.line(114.5, 280.2, 195.0, 280.2)
            symbol_path = _footer_symbol_path()
            if symbol_path:
                try:
                    self.image(symbol_path, x=98.5, y=274.0, w=13.0)
                except Exception:
                    pass
            self.set_y(-13.8)
            self.set_font("Helvetica", "I", 8.5 if not is_prescription else 7.5)
            if not is_prescription:
                self.set_text_color(30, 86, 122)
            else:
                self.set_text_color(0, 0, 0)
            self.set_x(15)
            self.cell(82, 5, _pdf_clean("Thank you for choosing AYU POLYCLINIC."), align="L")
            self.set_x(113)
            if not is_prescription:
                self.cell(82, 5, _pdf_clean(f"Page {self.page_no()} of {{nb}}"), align="R")
            elif is_patient_document:
                self.cell(82, 5, _pdf_clean("Valid for 7 days or 2 times."), align="R")"""
content = content.replace(old_footer1, new_footer1)

# Now for generate_standard_report_pdf (which is never a prescription)
old_footer2 = """        def footer(self):
            self.set_draw_color(0, 0, 0)
            self.set_line_width(0.45)
            self.line(15, 280.2, 95.5, 280.2)
            self.line(114.5, 280.2, 195.0, 280.2)
            symbol_path = _footer_symbol_path()
            if symbol_path:
                try:
                    self.image(symbol_path, x=98.5, y=274.0, w=13.0)
                except Exception:
                    pass
            self.set_y(-13.8)
            self.set_font("Helvetica", "I", 7.5)
            self.set_text_color(0, 0, 0)
            self.set_x(15)
            self.cell(82, 5, _clean("Thank you for choosing Ayu Polyclinic."), align="L")
            self.set_x(113)
            self.cell(82, 5, _clean(f"Page {self.page_no()} of {{nb}}"), align="R")"""
new_footer2 = """        def footer(self):
            self.set_draw_color(30, 86, 122)
            self.set_line_width(0.45)
            self.line(15, 280.2, 95.5, 280.2)
            self.line(114.5, 280.2, 195.0, 280.2)
            symbol_path = _footer_symbol_path()
            if symbol_path:
                try:
                    self.image(symbol_path, x=98.5, y=274.0, w=13.0)
                except Exception:
                    pass
            self.set_y(-13.8)
            self.set_font("Helvetica", "I", 8.5)
            self.set_text_color(30, 86, 122)
            self.set_x(15)
            self.cell(82, 5, _clean("Thank you for choosing AYU POLYCLINIC."), align="L")
            self.set_x(113)
            self.cell(82, 5, _clean(f"Page {self.page_no()} of {{nb}}"), align="R")"""
content = content.replace(old_footer2, new_footer2)


old_section2 = """    def _section(title: str):
        _ensure_space(15)
        pdf.ln(2)
        pdf.set_fill_color(231, 247, 250)
        pdf.set_draw_color(190, 222, 233)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(11, 95, 118)
        pdf.cell(effective_width, 8, _clean(title), border=1, fill=True, ln=True)
        pdf.set_text_color(0, 0, 0)"""
new_section2 = """    def _section(title: str):
        _ensure_space(15)
        pdf.ln(2)
        pdf.set_fill_color(30, 86, 122)
        pdf.set_draw_color(30, 86, 122)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(effective_width, 8, "  " + _clean(title), border=1, fill=True, ln=True)
        pdf.set_text_color(0, 0, 0)"""
content = content.replace(old_section2, new_section2)


old_title_report = """    draw_pdf_brand_header(pdf, left_margin, 8, title_width=92)
    pdf.set_xy(left_margin, 45)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(effective_width, 6, _clean(payload.get("title") or "Hospital Report"), ln=True)"""
new_title_report = """    draw_pdf_brand_header(pdf, left_margin, 8, title_width=92, is_prescription=False)
    pdf.set_xy(left_margin, pdf.get_y() + 4)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(30, 86, 122)
    pdf.cell(effective_width, 6, _clean(payload.get("title") or "Hospital Report"), ln=True)
    pdf.set_text_color(0, 0, 0)"""
content = content.replace(old_title_report, new_title_report)

# Table headers color update in generate_standard_report_pdf
old_table = """        pdf.set_fill_color(241, 248, 252)
        pdf.set_draw_color(215, 226, 236)
        for h, w in zip(headers, col_widths):
            pdf.cell(w, 7, _clean(h)[:30], border=1, fill=True)"""
new_table = """        pdf.set_fill_color(226, 238, 246)
        pdf.set_draw_color(180, 210, 230)
        pdf.set_text_color(30, 86, 122)
        for h, w in zip(headers, col_widths):
            pdf.cell(w, 7, _clean(h)[:30], border=1, fill=True)
        pdf.set_text_color(0, 0, 0)"""
content = content.replace(old_table, new_table)

with open(r'e:\ayu\backend\export_utils.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Modifications done!")
