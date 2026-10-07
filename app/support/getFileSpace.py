import pdfplumber
import sys
import json
import warnings
import os

# Suppress warnings that pollute stderr and crash Node.js
warnings.filterwarnings("ignore")
os.environ["FITZ_LOG"] = "0"

def get_last_y_coordinate(pdf_path):
    try:
        with pdfplumber.open(pdf_path) as pdf:
            last_page = pdf.pages[-1]
            max_y = 0
            
            # 1. Check actual text characters
            for char in last_page.chars:
                if char.get('text', '').strip():
                    if char['bottom'] > max_y: max_y = char['bottom']
            
            # 2. Check edges, rects, and curves (Fixes CAD/vector-based PDF overlaps)
            for obj in last_page.edges + last_page.rects + last_page.curves:
                height = obj.get('height', 0)
                bottom = obj.get('bottom', 0)
                # Ignore full-page backgrounds and borders that falsely stretch to the bottom
                if bottom < last_page.height - 5 and height < last_page.height * 0.9:
                    if bottom > max_y: max_y = bottom
                        
            # 3. Check images
            for img in last_page.images:
                height = img.get('height', 0)
                bottom = img.get('bottom', 0)
                # Ignore full-page scanned backgrounds
                if bottom < last_page.height - 5 and height < last_page.height * 0.9:
                    if bottom > max_y: max_y = bottom

            if max_y == 0:
                max_y = 50

            return {
                "height": float(last_page.height),
                "width": float(last_page.width),
                "last_y": float(max_y)
            }

    except Exception as e:
        return {"height": 0, "width": 0, "last_y": 0, "error": str(e)}

if __name__ == "__main__":
    # Reroute stderr to stdout at the system level to prevent exec() crashes
    sys.stderr = sys.stdout 
    if len(sys.argv) > 1:
        print(json.dumps(get_last_y_coordinate(sys.argv[1])))
    else:
        print(json.dumps({"error": "No file path provided"}))