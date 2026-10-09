from PIL import Image

def make_transparent(img_path):
    img = Image.open(img_path).convert("RGBA")
    data = img.getdata()
    
    # Get the background color from the top-left pixel
    bg_color = data[0]
    
    new_data = []
    # threshold for color closeness
    threshold = 40
    
    for item in data:
        # Check if the color is close to the background color
        if (abs(item[0] - bg_color[0]) < threshold and 
            abs(item[1] - bg_color[1]) < threshold and 
            abs(item[2] - bg_color[2]) < threshold):
            # Change the background pixel to transparent
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
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
        make_transparent(p)
    except Exception as e:
        print(f"Failed to process {p}: {e}")
