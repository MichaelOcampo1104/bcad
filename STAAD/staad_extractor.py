import os
import re
import argparse
import logging
import time
import pytesseract
import pypdfium2 as pdfium
import pdfplumber
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure Tesseract path
TESSERACT_PATH = r"C:\Users\Michael Ocampo\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"
pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Common OCR misreadings to actual STAAD keywords
KEYWORD_MAP = {
    r"ADvdS\s+OvWLS": "STAAD SPACE",
    r"dDvdS\s+OvViS": "STAAD SPACE",
    r"SALYNIGYOOD\s+ANTAL": "JOINT COORDINATES",
    r"SALVNIGHOOD\s+LNZOL": "JOINT COORDINATES",
    r"SHDN3ZOIONI\s+BASHA": "MEMBER INCIDENCES",
    r"SAINIOIONI\s+wasvaW": "MEMBER INCIDENCES",
    r"SLYOddNs": "SUPPORTS",
    r"SLYOddNS": "SUPPORTS",
    r"VW\s+TWAa1LS\s+WIYBLvW": "STEEL MATERIAL",
    r"VW\s+FAILS\s+IWIYBivn": "STEEL MATERIAL",
    r"SISAWWHY\s+WHOSYAd": "PERFORM ANALYSIS",
    r"SISAIVNY\s+WeHOSNAd": "PERFORM ANALYSIS",
    r"SWOD\s+AVC\?": "LOAD",
    r"SWOD\s+GVOT": "LOAD",
    r"GVOT\s+YIGWIH": "MEMBER LOAD",
    r"GVOT\s+LNIOC": "JOINT LOAD",
    r"GaxI3": "FIXED",
    r"LNIOC": "JOINT",
}

import cv2
import numpy as np
from PIL import Image

def enhance_image_opencv(pil_image):
    """Enhance PIL image using OpenCV for better OCR results."""
    # 1. Convert PIL to OpenCV (numpy array)
    open_cv_image = np.array(pil_image)
    # Convert RGB to BGR (OpenCV format)
    if open_cv_image.ndim == 3:
        image = cv2.cvtColor(open_cv_image, cv2.COLOR_RGB2GRAY)
    else:
        image = open_cv_image

    # 2. Adaptive Thresholding: Handles varying lighting/shadows in scans
    # blockSize=15, C=10 are common defaults, can be tuned
    thresh = cv2.adaptiveThreshold(
        image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY, 15, 10
    )

    # 3. Morphological Operations: Dilation to thicken thin text
    # A small 2x2 or 3x3 kernel helps.
    kernel = np.ones((2, 2), np.uint8)
    # Since we have black text on white background, we actually want to 'erode'
    # the white space or 'dilate' the black pixels. 
    # In binary images (0=black, 255=white), erode(thresh) with kernel expands black.
    dilated = cv2.erode(thresh, kernel, iterations=1)

    # 4. Convert back to PIL for Pytesseract
    return Image.fromarray(dilated)

def parse_text_to_staad(text):
    """Clean OCR artifacts and identify STAAD script blocks."""
    # 1. Broad cleaning: Replace common OCR artifacts
    cleaned = text.replace('|', '').replace('©', '').replace('¢', '').replace('$', '').replace('°', '')
    
    # 2. Key Mapping: Fix common OCR misreadings of keywords
    for pattern, replacement in KEYWORD_MAP.items():
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

    # 3. Identify the Start of the script
    start_match = re.search(r"STAAD\s+(SPACE|PLANE|Pro)", cleaned, re.IGNORECASE)
    if start_match:
        cleaned = cleaned[start_match.start():]

    # 4. Organize by Major Command Blocks
    blocks = [
        "JOINT COORDINATES",
        "MEMBER INCIDENCES",
        "ELEMENT INCIDENCES",
        "DEFINE MATERIAL START",
        "MEMBER PROPERTIES",
        "ELEMENT PROPERTIES",
        "CONSTANTS",
        "SUPPORTS",
        "LOAD",
        "GROUP",
        "PERFORM ANALYSIS",
        "PRINT",
        "FINISH"
    ]
    
    for block in blocks:
        cleaned = re.sub(rf"({block})", r"\n\n\1", cleaned, flags=re.IGNORECASE)

    # 5. Filter Noise and Strip Line Numbers
    lines = cleaned.split('\n')
    final_lines = []
    
    noise_patterns = [
        r"PAGE\s+NO\.", 
        r"DATE-", 
        r"TIME", 
        r"USER\s+ID", 
        r"Proprietary\s+Program", 
        r"Bentley\s+Systems",
        r"Licensing\s+Server"
    ]
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Strip report-style line numbers at the beginning (e.g. "159. ", "160. ")
        # But be careful not to strip valid model data starting with numbers.
        # Report line numbers usually have a trailing dot followed by a space.
        line = re.sub(r"^\d+\.\s+", "", line)
            
        if any(re.search(pattern, line, re.IGNORECASE) for pattern in noise_patterns):
            continue
            
        if len(line) < 3 and not line.isalnum():
            continue
            
        final_lines.append(line)

    return "\n".join(final_lines)

def extract_staad_from_pdf(pdf_path):
    """Convert PDF to images and extract text using Pytesseract."""
    logging.info(f"Extracting text from {pdf_path} using Pytesseract with OpenCV enhancement...")
    try:
        pdf = pdfium.PdfDocument(pdf_path)
        
        full_text = ""
        # PSM 3: Fully automatic page segmentation, but no OSD.
        # OEM 3: Default, based on what is available.
        tess_config = "--psm 3 --oem 3"
        
        for i in range(len(pdf)):
            logging.info(f"Processing page {i+1}/{len(pdf)}...")
            page = pdf.get_page(i)
            # Render page at 400 DPI for high fidelity
            bitmap = page.render(scale=400/72) 
            pil_image = bitmap.to_pil()
            
            # Use OpenCV enhancement
            enhanced_image = enhance_image_opencv(pil_image)
            
            full_text += pytesseract.image_to_string(enhanced_image, config=tess_config)
            page.close()
            
        pdf.close()
        return parse_text_to_staad(full_text)
    except Exception as e:
        logging.error(f"Error during PDF to image conversion or OCR: {e}")
        raise

def extract_staad_direct(pdf_path):
    """Directly extract text from a digital PDF using pdfplumber."""
    logging.info(f"Extracting text from {pdf_path} using direct extraction (pdfplumber)...")
    try:
        full_text = ""
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                logging.info(f"Reading page {i+1}/{len(pdf.pages)}...")
                text = page.extract_text()
                if text:
                    full_text += text + "\n"
        
        return parse_text_to_staad(full_text)
    except Exception as e:
        logging.error(f"Error during direct text extraction: {e}")
        raise

from google import genai

def extract_staad_with_gemini(pdf_path, api_key):
    """Use Google Gen AI (new SDK) for high-fidelity extraction using direct PDF upload."""
    if not api_key:
        raise ValueError("Gemini API key is required for 'gemini' method. Provide it via --api-key or GOOGLE_API_KEY env var.")
    
    # Initialize the new GenAI Client
    client = genai.Client(api_key=api_key)
    
    logging.info(f"Uploading {pdf_path} to Gemini Files API...")
    
    try:
        # Upload the file using the new SDK
        uploaded_file = client.files.upload(file=pdf_path)
        logging.info(f"File uploaded: {uploaded_file.name}. Processing...")

        # The new SDK handles basic polling or provides easy access to state
        # In the new SDK, generate_content will often handle the wait or we can check state.
        # Based on docs, it's best to ensure it's ACTIVE.
        
        timeout = 60 # 60 seconds timeout
        start_time = time.time()
        while uploaded_file.state == "PROCESSING":
            if time.time() - start_time > timeout:
                raise Exception("Timeout waiting for document processing.")
            logging.info("Waiting for Gemini to process the document...")
            time.sleep(5)
            uploaded_file = client.files.get(name=uploaded_file.name)

        if uploaded_file.state == "FAILED":
            raise Exception(f"Gemini file processing failed: {uploaded_file.state}")

        logging.info("Document processed. Generating STAAD script...")

        prompt = (
            "Analyze this entire PDF document and extract the STAAD.Pro input commands. "
            "Your goal is to reconstruct the original plain-text STAAD script (.std file). "
            "\n\nCRITICAL CONSTRAINTS:"
            "\n1. Output ONLY the raw STAAD script text."
            "\n2. Remove all non-script noise: Page headers, footers, 'PAGE NO.', 'DATE-', 'TIME', 'Bentley Systems', iteration status, error messages, and calculation notes."
            "\n3. Fix common OCR character swaps in numerical data (e.g., Z->2, S->5, O->0, I->1)."
            "\n4. Ensure the structure is maintained: JOINT COORDINATES, MEMBER INCIDENCES, MEMBER PROPERTIES, SUPPORTS, and LOAD cases must be correctly grouped."
            "\n5. If a command or table spans multiple pages, combine them into a single continuous block."
        )
        
        # Use gemini-flash-latest (1.5 Flash) or gemini-2.0-flash
        response = client.models.generate_content(
            model='gemini-flash-latest',
            contents=[uploaded_file, prompt]
        )
        
        return response.text.strip()
        
    except Exception as e:
        logging.error(f"Error during upgraded Gemini extraction: {e}")
        raise

def process_single_pdf(pdf_path, args, api_key):
    """Process a single PDF file and save the output."""
    try:
        if args.method == "gemini":
            output_script = extract_staad_with_gemini(pdf_path, api_key)
        elif args.method == "direct":
            output_script = extract_staad_direct(pdf_path)
        else:
            output_script = extract_staad_from_pdf(pdf_path)
        
        output_file = args.output
        if not output_file or os.path.isdir(args.input_path):
            base_name = os.path.splitext(os.path.basename(pdf_path))[0]
            if args.output and os.path.isdir(args.output):
                output_file = os.path.join(args.output, f"{base_name}.txt")
            else:
                output_file = f"{base_name}.txt"
            
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(output_script)
            
        logging.info(f"Successfully processed {pdf_path} -> {output_file}")
        
    except Exception as e:
        logging.error(f"Error processing {pdf_path}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract STAAD script from PDF using OCR or Gemini AI")
    parser.add_argument("input_path", help="Path to input PDF file or directory containing PDFs")
    parser.add_argument("--output", help="Output file path or directory (for batch processing)")
    parser.add_argument("--method", choices=["ocr", "gemini", "direct"], default="ocr", 
                        help="Extraction method: 'ocr' (Tesseract), 'gemini' (AI Vision), or 'direct' (Digital PDF)")
    parser.add_argument("--api-key", help="Google Gemini API Key (overrides GOOGLE_API_KEY env var)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_path):
        logging.error(f"Error: Path {args.input_path} not found.")
        exit(1)
        
    api_key = args.api_key or os.environ.get("GOOGLE_API_KEY")
    
    if os.path.isfile(args.input_path):
        if args.input_path.lower().endswith(".pdf"):
            process_single_pdf(args.input_path, args, api_key)
        else:
            logging.error(f"Error: {args.input_path} is not a PDF file.")
    elif os.path.isdir(args.input_path):
        pdf_files = [f for f in os.listdir(args.input_path) if f.lower().endswith(".pdf")]
        if not pdf_files:
            logging.warning(f"No PDF files found in {args.input_path}")
        else:
            logging.info(f"Found {len(pdf_files)} PDF files in {args.input_path}. Starting batch processing...")
            if args.output and not os.path.exists(args.output):
                os.makedirs(args.output)
            
            for pdf_file in pdf_files:
                full_path = os.path.join(args.input_path, pdf_file)
                process_single_pdf(full_path, args, api_key)

