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
            
            for char in last_page.chars:
                if char.get('text', '').strip():
                    if char['bottom'] > max_y: max_y = char['bottom']
            
            for edge in last_page.edges:
                if edge.get('linewidth', 0) > 0 and edge['bottom'] < last_page.height:
                    if edge['bottom'] > max_y: max_y = edge['bottom']
                        
            for img in last_page.images:
                if img['bottom'] > max_y: max_y = img['bottom']

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