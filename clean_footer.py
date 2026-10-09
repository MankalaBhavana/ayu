from PIL import Image, ImageDraw
import numpy as np
import os

paths = [
    r'e:\ayu\backend\assets\hospai_medical_symbol.png',
    r'e:\ayu\frontend\dist\hospai_medical_symbol.png',
    r'e:\ayu\frontend\public\hospai_medical_symbol.png',
    r'e:\ayu\backend\assets\hospai_medical_symbol_full.png',
]

def full_clean(img_path):
    if not os.path.exists(img_path):
        return
        
    try:
        # 1. Aggressive threshold
        img = Image.open(img_path).convert("RGB")
        arr = np.array(img)
        
        mask = (arr[:, :, 0] > 160) & (arr[:, :, 1] > 160) & (arr[:, :, 2] > 160)
        arr[mask] = [255, 255, 255]
        
        # 2. Draw border
        out = Image.fromarray(arr, 'RGB')
        draw = ImageDraw.Draw(out)
        w, h = out.size
        
        border_width = 15
        # Top
        draw.rectangle([0, 0, w, border_width], fill=(255, 255, 255))
        # Bottom
        draw.rectangle([0, h - border_width, w, h], fill=(255, 255, 255))
        # Left
        draw.rectangle([0, 0, border_width, h], fill=(255, 255, 255))
        # Right
        draw.rectangle([w - border_width, 0, w, h], fill=(255, 255, 255))
        
        out.save(img_path, "PNG")
        print(f"Successfully cleaned footer logo: {img_path}")
    except Exception as e:
        print(f"Failed {img_path}: {e}")

for p in paths:
    full_clean(p)
