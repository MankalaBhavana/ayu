from rembg import remove
from PIL import Image

def process_logo(img_path):
    input_image = Image.open(img_path)
    # remove background, this automatically handles alpha matting and blending
    output_image = remove(input_image)
    
    # We will just save the transparent image, FPDF2 handles transparent PNGs perfectly.
    output_image.save(img_path, "PNG")
    print(f"Processed {img_path} with rembg")

paths = [
    r'e:\ayu\backend\assets\hospai_print_logo.png',
    r'e:\ayu\frontend\dist\hospai_print_logo.png',
    r'e:\ayu\frontend\public\hospai_print_logo.png'
]

for p in paths:
    try:
        process_logo(p)
    except Exception as e:
        print(f"Failed {p}: {e}")
