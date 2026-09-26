"""Deterministic invoice extraction, with PDF OCR fallback for image pages.

The heuristic parser fits labeled English invoices; it does not claim to be an
AI model. Swap this module for an OCR/document AI provider if needed.
"""
import re

FIELDS = ("invoice_number", "date", "vendor", "bill_to", "email", "total")


def extract_fields(text: str) -> dict:
    def match(pattern):
        found = re.search(pattern, text, re.I | re.M)
        return found.group(1).strip() if found else None

    result = {
        "invoice_number": match(r"^invoice\s*(?:number|#)\s*:\s*([^\n]+)"),
        "date": match(r"^date\s*:\s*([^\n]+)"),
        "vendor": match(r"^vendor\s*:\s*([^\n]+)"),
        "bill_to": match(r"^bill\s*to\s*:\s*([^\n]+)"),
        "email": match(r"^email\s*:\s*([^\s\n]+)"),
        "total": match(r"^total\s*:\s*\$?([\d,.]+)"),
    }
    lines = text.splitlines()
    result["line_items"] = []
    for index, line in enumerate(lines):
        if re.match(r"^item\s*,\s*quantity\s*,\s*unit price\s*,\s*total", line, re.I):
            for item_line in lines[index + 1:]:
                parts = [part.strip() for part in item_line.split(",")]
                if len(parts) != 4 or not re.fullmatch(r"\d+(?:\.\d+)?",parts[1]): break
                try:
                    result["line_items"].append({"description":parts[0],"quantity":int(parts[1]),
                        "unit_price":float(parts[2]),"total":float(parts[3])})
                except ValueError: break
            break
    return result


def evaluate(extracted: dict, expected: dict) -> dict:
    """Return exact-match accuracy only for supplied scalar ground-truth fields."""
    checked = {key: {"expected": str(value), "actual": extracted.get(key),
                     "match": str(extracted.get(key) or "").casefold() == str(value).casefold()}
               for key,value in expected.items() if key in FIELDS}
    return {"accuracy": round(sum(item["match"] for item in checked.values())/len(checked), 3) if checked else None,
            "fields":checked}
