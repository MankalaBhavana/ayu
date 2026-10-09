from PIL import Image, ImageDraw

paths = [
    r'e:\ayu\backend\assets\hospai_print_logo.png',
    r'e:\ayu\frontend\dist\hospai_print_logo.png',
    r'e:\ayu\frontend\public\hospai_print_logo.png',
]

def remove_borders(img_path):
    try:
        img = Image.open(img_path).convert("RGB")
        draw = ImageDraw.Draw(img)
        w, h = img.size
        
        # We will draw a white rectangle over the leftmost 10 pixels, rightmost 10 pixels,
        # topmost 10 pixels, and bottommost 10 pixels. This will completely remove any
        # dark artifact lines that survived the thresholding on the edges.
        
        border_width = 10
        # Top
        draw.rectangle([0, 0, w, border_width], fill=(255, 255, 255))
        # Bottom
        draw.rectangle([0, h - border_width, w, h], fill=(255, 255, 255))
        # Left
        draw.rectangle([0, 0, border_width, h], fill=(255, 255, 255))
        # Right
        draw.rectangle([w - border_width, 0, w, h], fill=(255, 255, 255))
        
        img.save(img_path, "PNG")
        print(f"Removed borders from {img_path}")
    except Exception as e:
        print(f"Failed {img_path}: {e}")

for p in paths:
    remove_borders(p)
