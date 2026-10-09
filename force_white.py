from PIL import Image
import numpy as np

paths = [
    r'e:\ayu\backend\assets\hospai_print_logo.png',
    r'e:\ayu\frontend\dist\hospai_print_logo.png',
    r'e:\ayu\frontend\public\hospai_print_logo.png',
]

def clean_logo(img_path):
    try:
        # Open and convert to RGB (drop alpha)
        img = Image.open(img_path).convert("RGB")
        arr = np.array(img)
        
        # We want to keep the dark blue and dark grey of the logo.
        # The background is currently a light beige/grey box.
        # Any pixel where all RGB components are > 200 is probably background.
        # Actually, let's just find the exact color of the top-left pixel
        bg_color = arr[0, 0]
        print(f"Top-left color is: {bg_color}")
        
        # Calculate distance to background color for all pixels
        dist = np.sum(np.abs(arr - bg_color), axis=2)
        
        # Threshold: if distance is small, it's the background patch
        # or if the pixel is very light (sum > 600)
        mask = (dist < 50) | (np.sum(arr, axis=2) > 600)
        
        arr[mask] = [255, 255, 255]
        
        out = Image.fromarray(arr, 'RGB')
        out.save(img_path, "PNG")
        print(f"Successfully cleaned {img_path}")
    except Exception as e:
        print(f"Failed {img_path}: {e}")

for p in paths:
    clean_logo(p)
