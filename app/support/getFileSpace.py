import pdfplumber
import sys
import json

def get_last_y_coordinate(pdf_path):
    try:
        with pdfplumber.open(pdf_path) as pdf:
            last_page = pdf.pages[-1]
            
            # pdfplumber automatically normalizes rotations.
            # Coordinates are strictly based on the visual, upright page from top-to-bottom.
            max_y = 0
            
            # 1. Check all visible characters (ignores blank spaces)
            for char in last_page.chars:
                if char.get('text', '').strip():
                    if char['bottom'] > max_y:
                        max_y = char['bottom']
            
            # 2. Check visible table lines/borders (linewidth > 0)
            for edge in last_page.edges:
                if edge.get('linewidth', 0) > 0 and edge['bottom'] < last_page.height:
                    if edge['bottom'] > max_y:
                        max_y = edge['bottom']
                        
            # 3. Check visible images/logos
            for img in last_page.images:
                if img['bottom'] > max_y:
                    max_y = img['bottom']

            # If the page is completely blank, fallback to top of page
            if max_y == 0:
                max_y = 50

            return {
                "height": float(last_page.height),
                "width": float(last_page.width),
                "last_y": float(max_y)
            }

    except Exception as e:
        # Failsafe to prevent Node.js crashes
        return {"height": 0, "width": 0, "last_y": 0, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(json.dumps(get_last_y_coordinate(sys.argv[1])))
    else:
        print(json.dumps({"error": "No file path provided"}))