# Document Extraction

**Project context:** Independent portfolio project inspired by document processing and AI engineering work at Lazarus AI. This application was created for demonstration and was not commissioned, used, or endorsed by Lazarus AI.

The app turns invoice text into structured fields and line items. The browser demo works with pasted text; a separate FastAPI service accepts text files and PDFs, performs OCR on image-only pages, and can optionally use an AI model.

## What It Does

Give the application an invoice and inspect its invoice number, date, vendor, billing recipient, email, total, and line items as JSON. Supply expected values to calculate exact-match accuracy for those fields.

## How It Works

1. **Receive:** `POST /extract` accepts UTF-8 `.txt` or PDF files up to 5 MB and 10 pages.
2. **Read:** PyMuPDF extracts embedded PDF text. Tesseract OCR reads a page if it has no embedded text.
3. **Extract:** The default parser finds labeled fields and comma-separated line items. With `use_ai=true` and a server-side `OPENAI_API_KEY`, an optional model path requests structured JSON with nulls for absent fields.
4. **Evaluate:** If `expected_json` is supplied, the API reports exact-match accuracy for its expected scalar fields.
5. **Demo:** `site/app.js` extracts pasted text in the browser. GitHub Pages does **not** run PDF parsing, OCR, or AI calls.

## Features

- PDF and text upload through FastAPI
- OCR fallback for scanned PDF pages
- Rules parser and optional model-backed extraction
- JSON line items and a field comparison report
- Interactive browser demo and parser tests

## Built With

Python 3.12, FastAPI, PyMuPDF, Tesseract OCR, optional OpenAI API, Pytest, Docker, and HTML/CSS/JavaScript for the demo.

## Getting Started

Clone this repository. From its root, run:

```bash
docker build -t document-extraction ./backend
docker run --rm -p 8000:8000 document-extraction
```

Open `http://localhost:8000/docs` to upload a file, or `site/index.html` for the separate browser demo. To enable model extraction, pass `OPENAI_API_KEY` as a **server environment variable**, optionally set `OPENAI_MODEL`, and submit `use_ai=true`. Never commit an API key or put it in browser code.

## Example

```text
INVOICE
Invoice Number: INV-2026-042
Date: 2026-09-24
Vendor: Harbor Supply Co.
Bill To: Northline Labs
Email: billing@harborsupply.example
Item,Quantity,Unit Price,Total
USB-C hub,2,42.50,85.00
Total: $85.00
```

The extractor returns `invoice_number: "INV-2026-042"`, `total: "85.00"`, and one line item. To evaluate it, submit `expected_json` such as `{"invoice_number":"INV-2026-042","total":"85.00"}` alongside the file.

## Limitations

The rules parser works best on labeled English invoices and simple comma-separated tables. OCR quality depends on the scan. The browser demo does not process PDFs or call an AI model. Model extraction sends document text to the configured API, so use only documents you are authorized to share.

## Future Improvements

Add layout-aware table extraction, build a labeled evaluation set, and connect the browser UI to a secured PDF upload API.

## Skills Demonstrated

Combining PDF text extraction with OCR fallback, returning JSON, measuring extraction accuracy, and keeping optional model calls server-side.
