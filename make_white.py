from PIL import Image

def process_image(img_path):
    img = Image.open(img_path).convert("RGBA")
    data = img.getdata()
    
    new_data = []
    
    for item in data:
        # If the pixel is transparent or mostly transparent, make it pure white
        if item[3] < 255:
            new_data.append((255, 255, 255, 255))
        else:
            # For non-transparent pixels, if they are close to off-white, make them white too
            r, g, b = item[0], item[1], item[2]
            if r > 230 and g > 230 and b > 230:
                new_data.append((255, 255, 255, 255))
            else:
                new_data.append((r, g, b, 255))
            
    img.putdata(new_data)
    img.save(img_path, "PNG")
    print(f"Processed {img_path}")

paths = [
    r'e:\ayu\backend\assets\hospai_print_logo.png',
    r'e:\ayu\frontend\dist\hospai_print_logo.png',
    r'e:\ayu\frontend\public\hospai_print_logo.png'
]

for p in paths:
    try:
        process_image(p)
    except Exception as e:
        print(f"Error {p}: {e}")
