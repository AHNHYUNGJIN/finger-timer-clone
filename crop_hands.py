from PIL import Image

def crop_hands():
    try:
        # Load the thumbnail image
        img = Image.open("thumbnail.jpg")
        w, h = img.size
        print(f"Original image size: {w}x{h}")
        
        # Crop parameters
        # Left Hand: Left 30%, bottom 55%
        left_box = (0, int(h * 0.45), int(w * 0.30), h)
        left_hand = img.crop(left_box)
        left_hand.save("left_hand_bg.jpg")
        print("Cropped left hand successfully saved.")
        
        # Right Hand: Right 30%, bottom 55%
        right_box = (int(w * 0.70), int(h * 0.45), w, h)
        right_hand = img.crop(right_box)
        right_hand.save("right_hand_bg.jpg")
        print("Cropped right hand successfully saved.")
        
    except Exception as e:
        print(f"Error during cropping: {e}")

if __name__ == "__main__":
    crop_hands()
