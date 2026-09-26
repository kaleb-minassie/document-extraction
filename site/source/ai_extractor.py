"""Optional model-backed extraction. Keep the API key on the server."""
import json
import os
from openai import OpenAI

# Nulls are allowed for fields absent from the document; the model must not guess.
SCHEMA = {
    "type": "object", "properties": {
        **{name:{"type":["string","null"]} for name in
           ("invoice_number","date","vendor","bill_to","email","total")},
        "line_items":{"type":"array","items":{"type":"object","properties":{
            "description":{"type":"string"},"quantity":{"type":"integer"},
            "unit_price":{"type":"number"},"total":{"type":"number"}},
            "required":["description","quantity","unit_price","total"],"additionalProperties":False}}
    }, "required":["invoice_number","date","vendor","bill_to","email","total","line_items"],
    "additionalProperties":False
}


def extract_with_ai(text: str) -> dict:
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("OPENAI_API_KEY is required for model-backed extraction")
    response = OpenAI().responses.create(
        model=os.getenv("OPENAI_MODEL","gpt-4.1-mini"),
        store=False,
        instructions="Extract fields from invoice text. Use null for absent fields. Never invent a value.",
        input=text[:30000],
        text={"format":{"type":"json_schema","name":"invoice","strict":True,"schema":SCHEMA}},
    )
    return json.loads(response.output_text)
