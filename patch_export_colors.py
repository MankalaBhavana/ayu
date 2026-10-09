import sys

with open(r'e:\ayu\backend\export_utils.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the table rendering in generate_standard_report_pdf to match colors perfectly
old_table = """        _ensure_space(8)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(226, 238, 246)
        pdf.set_draw_color(180, 210, 230)
        pdf.set_text_color(30, 86, 122)
        for h, w in zip(headers, col_widths):
            pdf.cell(w, 7, _clean(h)[:30], border=1, fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(7)
        pdf.set_font("Helvetica", "", 8)"""

new_table = """        _ensure_space(8)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(229, 239, 245)
        pdf.set_draw_color(215, 230, 240)
        pdf.set_text_color(30, 86, 122)
        for h, w in zip(headers, col_widths):
            pdf.cell(w, 7, _clean(h)[:30], border=1, fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(7)
        pdf.set_font("Helvetica", "", 9)"""

content = content.replace(old_table, new_table)

# Replace the title rendering to make subtitle grey and title perfect dark blue
old_title_report = """    draw_pdf_brand_header(pdf, left_margin, 8, title_width=92, is_prescription=False)
    pdf.set_xy(left_margin, pdf.get_y() + 4)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(30, 86, 122)
    pdf.cell(effective_width, 6, _clean(payload.get("title") or "Hospital Report"), ln=True)
    pdf.set_text_color(0, 0, 0)
    pdf.set_x(left_margin)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.cell(effective_width, 5, _clean(payload.get("subtitle") or ""), ln=True)
    generated = datetime.now().strftime("%d/%m/%Y %I:%M %p")
    pdf.set_x(left_margin)
    pdf.set_font("Helvetica", "", 7.8)
    pdf.cell(effective_width, 5, _clean(f"Generated: {generated}" + (f"  |  By: {payload.get('operator_name')}" if payload.get("operator_name") else "")), ln=True)"""

new_title_report = """    draw_pdf_brand_header(pdf, left_margin, 8, title_width=92, is_prescription=False)
    pdf.set_xy(left_margin, pdf.get_y() + 4)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(30, 86, 122)
    pdf.cell(effective_width, 7, _clean(payload.get("title") or "Hospital Report"), ln=True)
    
    pdf.set_x(left_margin)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(50, 50, 50)
    pdf.cell(effective_width, 5, _clean(payload.get("subtitle") or ""), ln=True)
    
    generated = datetime.now().strftime("%d/%m/%Y %I:%M %p")
    pdf.set_x(left_margin)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(50, 50, 50)
    pdf.cell(effective_width, 5, _clean(f"Generated: {generated}" + (f"  |  By: {payload.get('operator_name')}" if payload.get("operator_name") else "")), ln=True)
    pdf.set_text_color(0, 0, 0)"""

content = content.replace(old_title_report, new_title_report)

# Refine section headers for standard reports
old_section2 = """    def _section(title: str):
        _ensure_space(15)
        pdf.ln(2)
        pdf.set_fill_color(30, 86, 122)
        pdf.set_draw_color(30, 86, 122)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(effective_width, 8, "  " + _clean(title), border=1, fill=True, ln=True)
        pdf.set_text_color(0, 0, 0)"""

new_section2 = """    def _section(title: str):
        _ensure_space(15)
        pdf.ln(3)
        pdf.set_fill_color(30, 86, 122)
        pdf.set_draw_color(30, 86, 122)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(255, 255, 255)
        
        # Add a symbol placeholder since we can't render FontAwesome easily.
        # We will render a white circle or small square as a bullet point.
        y_before = pdf.get_y()
        pdf.cell(effective_width, 8, "        " + _clean(title), border=1, fill=True, ln=True)
        
        # Draw a little white square icon representation
        pdf.set_fill_color(255, 255, 255)
        pdf.rect(left_margin + 3, y_before + 2.5, 3, 3, style="F")
        
        pdf.set_text_color(0, 0, 0)"""

content = content.replace(old_section2, new_section2)

# Save the updated file
with open(r'e:\ayu\backend\export_utils.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Color and format updates applied!")
