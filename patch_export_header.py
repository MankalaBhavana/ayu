import sys

with open(r'e:\ayu\backend\export_utils.py', 'r', encoding='utf-8') as f:
    content = f.read()

old_header = """def draw_pdf_brand_header(pdf, left_margin: float, top_y: float, title_width: float = 120, is_prescription: bool = False):
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

new_header = """def draw_pdf_brand_header(pdf, left_margin: float, top_y: float, title_width: float = 120, is_prescription: bool = False):
    \"\"\"Draw the approved Ayu Polyclinic logo/address header used by every PDF export.\"\"\"
    logo_path = _frontend_logo_path()
    
    if is_prescription:
        max_h = 28
        if logo_path:
            try:
                from PIL import Image
                with Image.open(logo_path) as img:
                    img_w, img_h = img.size
                max_w = 82
                ratio = min(max_w / img_w, max_h / img_h)
                final_w = img_w * ratio
                final_h = img_h * ratio
                pdf.image(logo_path, x=left_margin, y=top_y, w=final_w, h=final_h)
            except Exception:
                pass
        
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
        max_h = 24
        # For standard reports, we draw the logo icon, then text AYU POLYCLINIC next to it
        if logo_path:
            try:
                from PIL import Image
                with Image.open(logo_path) as img:
                    img_w, img_h = img.size
                ratio = max_h / img_h
                final_w = img_w * ratio
                pdf.image(logo_path, x=left_margin, y=top_y, w=final_w, h=max_h)
            except Exception:
                final_w = 0
        else:
            final_w = 0
            
        text_x = left_margin + final_w + 3
        # AYU Text
        pdf.set_xy(text_x, top_y + 3)
        pdf.set_font("Helvetica", "B", 34)
        pdf.set_text_color(30, 86, 122)
        pdf.cell(100, 12, "AYU", ln=True)
        
        # POLYCLINIC Text
        pdf.set_xy(text_x + 1, top_y + 14)
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(128, 128, 128)
        pdf.cell(100, 8, "POLYCLINIC", ln=True)

        pdf.set_draw_color(30, 86, 122)
        pdf.set_line_width(1.5)
        line_y = top_y + max_h + 3
        pdf.line(left_margin, line_y, 210 - left_margin, line_y)
        pdf.set_text_color(0, 0, 0)
        pdf.set_y(line_y + 2)"""

content = content.replace(old_header, new_header)

with open(r'e:\ayu\backend\export_utils.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Header logic updated!")
