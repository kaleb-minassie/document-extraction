"""Text/PDF extraction API; OCRs pages whose embedded text is absent."""
import json
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from extractor import extract_fields, evaluate

app = FastAPI(title="Document Extraction", version="1.0")
MAX_BYTES = 5 * 1024 * 1024
MAX_PAGES = 10


@app.post("/extract")
async def extract(file: UploadFile = File(...), expected_json: str | None = Form(None), use_ai: bool = Form(False)):
    name = (file.filename or "").lower()
    if not name.endswith((".pdf", ".txt")):
        raise HTTPException(400,"Upload a PDF or TXT file")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES: raise HTTPException(413,"File must be 5 MB or smaller")
    if name.endswith(".pdf"):
        import fitz
        try:
            with fitz.open(stream=data,filetype="pdf") as document:
                if len(document) > MAX_PAGES: raise HTTPException(413,"PDF must have 10 pages or fewer")
                pages=[]; ocr_pages=[]
                for number,page in enumerate(document):
                    text=page.get_text()
                    if not text.strip():
                        try:
                            text=page.get_text(textpage=page.get_textpage_ocr(language="eng",dpi=150))
                        except Exception as exc:
                            raise HTTPException(422,"Scanned page needs Tesseract OCR installed") from exc
                        ocr_pages.append(number+1)
                    pages.append(text)
                text="\n".join(pages)
        except (ValueError, RuntimeError) as exc:
            raise HTTPException(422,"PDF could not be read") from exc
    else:
        try: text=data.decode("utf-8-sig")
        except UnicodeDecodeError as exc: raise HTTPException(422,"Text file must be UTF-8") from exc
        ocr_pages=[]
    if use_ai:
        from ai_extractor import extract_with_ai
        try: extracted=extract_with_ai(text)
        except ValueError as exc: raise HTTPException(503,str(exc)) from exc
    else:
        extracted=extract_fields(text)
    report=None
    if expected_json is not None:
        try:
            expected=json.loads(expected_json)
            if not isinstance(expected,dict): raise ValueError()
        except (ValueError,TypeError) as exc:
            raise HTTPException(422,"expected_json must be a JSON object") from exc
        report=evaluate(extracted,expected)
    return {"filename":file.filename,"mode":"ai" if use_ai else "rules","extracted":extracted,"ocr_pages":ocr_pages,"evaluation":report}


@app.get("/health")
def health(): return {"status":"ok"}
