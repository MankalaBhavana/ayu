import sys
import re

with open(r'e:\ayu\backend\export_utils.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the section block inside generate_standard_report_pdf
old_section = """    def _section(title: str):
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

new_section = """    def _draw_icon(pdf, icon_type, x, y, size=4):
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
        _ensure_space(15)
        pdf.ln(3)
        pdf.set_fill_color(30, 86, 122)
        pdf.set_draw_color(30, 86, 122)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(255, 255, 255)
        
        y_before = pdf.get_y()
        pdf.cell(effective_width, 8, "        " + _clean(title), border=1, fill=True, ln=True)
        
        # draw icon manually
        _draw_icon(pdf, title, left_margin + 3.5, y_before + 2.0, size=4)
        
        pdf.set_text_color(0, 0, 0)"""

content = content.replace(old_section, new_section)

# We also need to fix footer in ReportPDF to match exactly!
# The footer in the screenshot has:
# Left: "Thank you for choosing AYU POLYCLINIC." in blue italics.
# Center: Medical cross symbol bridging the line gap.
# Right: "Page 1 of 1" in blue.
# The lines are EXACTLY matching what I already programmed!
# The only thing is I should make sure my Medical Cross path `hospai_medical_symbol.png` is working.

with open(r'e:\ayu\backend\export_utils.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Icons logic added!")
