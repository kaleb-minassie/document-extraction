from extractor import extract_fields, evaluate


SAMPLE = """INVOICE
Invoice Number: INV-042
Date: 2026-09-24
Vendor: Harbor Supply
Bill To: Northline Labs
Email: hello@example.com
Item,Quantity,Unit Price,Total
Cable,2,12.50,25.00
Total: $25.00
"""


def test_extract_fields_and_items():
    data=extract_fields(SAMPLE)
    assert data["invoice_number"]=="INV-042"
    assert data["total"]=="25.00"
    assert data["line_items"][0]["quantity"]==2


def test_accuracy_reports_mismatch():
    data=extract_fields(SAMPLE)
    report=evaluate(data,{"vendor":"Harbor Supply","total":"99.00"})
    assert report["accuracy"]==0.5
