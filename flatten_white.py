from PIL import Image

paths = [
    r'e:\ayu\backend\assets\hospai_print_logo.png',
    r'e:\ayu\frontend\dist\hospai_print_logo.png',
    r'e:\ayu\frontend\public\hospai_print_logo.png',
    r'e:\ayu\backend\assets\hospai_medical_symbol.png',
]

def flatten_to_white(img_path):
    try:
        img = Image.open(img_path).convert("RGBA")
        
        # Create a pure white background image
        background = Image.new("RGBA", img.size, (255, 255, 255, 255))
        
        # Paste the image on top of the background, using its alpha channel as the mask
        background.paste(img, mask=img)
        
        # Convert to RGB to ensure no alpha channel issues in FPDF
        final_img = background.convert("RGB")
        
        final_img.save(img_path, "PNG")
        print(f"Successfully flattened {img_path}")
    except Exception as e:
        print(f"Failed {img_path}: {e}")

for p in paths:
    flatten_to_white(p)
