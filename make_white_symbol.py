from PIL import Image

def process_image(img_path):
    img = Image.open(img_path).convert("RGBA")
    data = img.getdata()
    
    bg_color = data[0] # assume top left is bg
    
    new_data = []
    
    for item in data:
        r, g, b, a = item
        
        # If it's transparent, make it white
        if a < 255:
            new_data.append((255, 255, 255, 255))
            continue
            
        # Distance from background color
        r_diff = abs(r - bg_color[0])
        g_diff = abs(g - bg_color[1])
        b_diff = abs(b - bg_color[2])
        
        # If it's close to the background color (including light grays)
        if r_diff < 50 and g_diff < 50 and b_diff < 50:
            new_data.append((255, 255, 255, 255))
        elif r > 220 and g > 220 and b > 220:
            # Also catch generic off-whites
            new_data.append((255, 255, 255, 255))
        else:
            new_data.append((r, g, b, 255))
            
    img.putdata(new_data)
    img.save(img_path, "PNG")
    print(f"Processed {img_path}")

paths = [
    r'e:\ayu\backend\assets\hospai_medical_symbol.png',
    r'e:\ayu\assets\hospai_medical_symbol.png'
]

import os
for p in paths:
    if os.path.exists(p):
        try:
            process_image(p)
        except Exception as e:
            print(f"Error {p}: {e}")
