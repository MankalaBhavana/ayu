import numpy as np
from PIL import Image
from skimage.segmentation import flood_fill
from skimage.color import rgb2gray
from skimage import filters

def process_image(img_path):
    img = Image.open(img_path).convert("RGBA")
    arr = np.array(img)
    
    # We will use flood fill on the top-left corner
    # to find the background mask.
    
    # A simple way to do this with skimage is to use flood fill on a grayscale version
    # but we can also just use a simple Python BFS to have full control over the tolerance.
    
    # Simple BFS flood fill
    h, w = arr.shape[:2]
    mask = np.zeros((h, w), dtype=bool)
    
    # Starting points (four corners)
    queue = [(0, 0), (0, w-1), (h-1, 0), (h-1, w-1)]
    
    bg_color = arr[0, 0].astype(int)
    
    # Tolerance for background
    tol = 60
    
    for start_node in queue:
        if mask[start_node]: continue
        q = [start_node]
        mask[start_node] = True
        
        while q:
            r, c = q.pop(0)
            
            # Check neighbors
            for dr, dc in [(-1,0), (1,0), (0,-1), (0,1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < h and 0 <= nc < w and not mask[nr, nc]:
                    color = arr[nr, nc].astype(int)
                    dist = np.sum(np.abs(color[:3] - bg_color[:3]))
                    if dist < tol:
                        mask[nr, nc] = True
                        q.append((nr, nc))
    
    # Now that we have the mask of the background, we can apply an anti-aliasing fade
    # or just set it to transparent.
    # To avoid jagged edges, we can dilate the mask slightly or just apply a Gaussian blur to the alpha channel.
    
    # Let's set the mask area to transparent
    arr[mask] = [255, 255, 255, 0]
    
    # Smooth the alpha channel to avoid jagged edges
    from scipy.ndimage import gaussian_filter
    alpha = arr[:, :, 3].astype(float)
    alpha = gaussian_filter(alpha, sigma=0.5)
    arr[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    
    out = Image.fromarray(arr, 'RGBA')
    out.save(img_path, "PNG")
    print(f"Processed {img_path} with BFS flood fill")

paths = [
    r'e:\ayu\backend\assets\hospai_print_logo.png',
    r'e:\ayu\frontend\dist\hospai_print_logo.png',
    r'e:\ayu\frontend\public\hospai_print_logo.png'
]

for p in paths:
    try:
        process_image(p)
    except Exception as e:
        print(f"Failed {p}: {e}")
