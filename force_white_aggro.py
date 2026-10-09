from PIL import Image
import numpy as np

paths = [
    r'e:\ayu\backend\assets\hospai_print_logo.png',
    r'e:\ayu\frontend\dist\hospai_print_logo.png',
    r'e:\ayu\frontend\public\hospai_print_logo.png',
]

def clean_logo_aggro(img_path):
    try:
        img = Image.open(img_path).convert("RGB")
        arr = np.array(img)
        
        # Aggressive cleaning: Any pixel that is relatively light
        # i.e., R > 150 and G > 150 and B > 150 gets turned perfectly white.
        # The cross is dark blue (approx 30, 86, 122) and dark grey (approx 120, 120, 120).
        # We will make anything above 160 white!
        
        mask = (arr[:, :, 0] > 160) & (arr[:, :, 1] > 160) & (arr[:, :, 2] > 160)
        arr[mask] = [255, 255, 255]
        
        out = Image.fromarray(arr, 'RGB')
        out.save(img_path, "PNG")
        print(f"Aggressively cleaned {img_path}")
    except Exception as e:
        print(f"Failed {img_path}: {e}")

for p in paths:
    clean_logo_aggro(p)
