// Browser demo data stays in memory and disappears when the page reloads.
const $ = (id) => document.getElementById(id);

// Escape values before inserting them into HTML.
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

let lastExtraction = null;

// Load the contents of a selected text file into the invoice input.
$("doc-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (file) $("document-input").value = await file.text();
});

const reviewFields = [
  "invoice_number",
  "date",
  "vendor",
  "bill_to",
  "email",
  "total"
];

// Compare only supported fields supplied in the expected JSON.
function evaluateFields(result, raw) {
  if (!raw.trim()) return null;

  let expected;
  try {
    expected = JSON.parse(raw);
  } catch {
    throw new Error("Expected fields must be valid JSON.");
  }

  if (!expected || Array.isArray(expected) || typeof expected !== "object") {
    throw new Error("Expected fields must be a JSON object.");
  }

  const fields = reviewFields.filter((key) =>
    Object.hasOwn(expected, key)
  );

  if (!fields.length) {
    throw new Error("Add at least one supported field to compare.");
  }

  if (fields.some((key) =>
    expected[key] === null || typeof expected[key] === "object"
  )) {
    throw new Error("Expected values must be text or numbers.");
  }

  return fields.map((key) => ({
    key,
    expected: String(expected[key]),
    actual: result[key],
    match: String(result[key] ?? "").toLowerCase() ===
           String(expected[key]).toLowerCase()
  }));
}

$("extract-doc").addEventListener("click", () => {
  const text = $("document-input").value;
  const field = (pattern) => text.match(pattern)?.[1]?.trim() || null;
  const lines = text.split(/\r?\n/);
  const items = [];

  // Read simple comma-separated invoice line items.
  const headerIndex = lines.findIndex((line) =>
    /^item\s*,\s*quantity\s*,\s*unit price\s*,\s*total/i.test(line)
  );

  if (headerIndex >= 0) {
    for (const line of lines.slice(headerIndex + 1)) {
      const cols = line.split(",").map((value) => value.trim());

      if (
        cols.length !== 4 ||
        !/^\d+(?:\.\d+)?$/.test(cols[1]) ||
        !/^\d+(?:\.\d+)?$/.test(cols[2])
      ) {
        break;
      }

      items.push({
        description: cols[0],
        quantity: Number(cols[1]),
        unit_price: Number(cols[2]),
        total: Number(cols[3])
      });
    }
  }

  // Extract the labeled fields from the invoice text.
  const result = {
    invoice_number: field(/invoice\s*(?:number|#)\s*:\s*([^\r\n]+)/i),
    date: field(/date\s*:\s*([^\r\n]+)/i),
    vendor: field(/vendor\s*:\s*([^\r\n]+)/i),
    bill_to: field(/bill\s*to\s*:\s*([^\r\n]+)/i),
    email: field(/\bemail\s*:\s*([^\s\r\n]+)/i),
    total: field(/(?:^|\n)total\s*:\s*\$?([\d,.]+)/i),
    line_items: items
  };

  lastExtraction = result;

  const found = reviewFields.filter((key) => result[key] !== null).length;
  let evaluation = "";

  try {
    const comparisons = evaluateFields(
      result,
      $("expected-fields").value
    );

    if (comparisons) {
      const matched = comparisons.filter((item) => item.match).length;

      const rows = comparisons.map((item) => `
        <tr>
          <th scope="row">${escapeHtml(item.key.replaceAll("_", " "))}</th>
          <td>${escapeHtml(item.expected)}</td>
          <td>${escapeHtml(item.actual ?? "Not found")}</td>
          <td class="${item.match ? "match" : "mismatch"}">
            ${item.match ? "Match" : "Review"}
          </td>
        </tr>
      `).join("");

      evaluation = `
        <section class="evaluation">
          <h3>
            Field comparison
            <span>${matched}/${comparisons.length} matched</span>
          </h3>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Expected</th>
                  <th>Extracted</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <p>
            Exact text comparison on the fields you supplied.
            This is not a model confidence score.
          </p>
        </section>
      `;
    }
  } catch (error) {
    evaluation = `
      <p class="validation-error" role="alert">
        ${escapeHtml(error.message)}
      </p>
    `;
  }

  $("document-result").className = "";
  $("document-result").innerHTML = `
    <div class="summary">
      <div><strong>${found}/6</strong><small>Fields found</small></div>
      <div><strong>${items.length}</strong><small>Line items</small></div>
    </div>
    ${evaluation}
    <pre class="code">${escapeHtml(JSON.stringify(result, null, 2))}</pre>
  `;
});

// The assistant uses local question matching. It makes no server request.
const assistantPanel = $("assistant-panel");
const assistantMessages = $("assistant-messages");
const assistantInput = $("assistant-input");

function showAssistant(open) {
  assistantPanel.hidden = !open;
  $("assistant-toggle").setAttribute("aria-expanded", String(open));

  if (open) assistantInput.focus();
  else $("assistant-toggle").focus();
}

function addAssistantMessage(message, sender = "assistant", destination = null) {
  const bubble = document.createElement("div");
  bubble.className = `assistant-message ${sender}`;

  // textContent keeps a visitor's question from becoming HTML.
  bubble.textContent = message;
  assistantMessages.append(bubble);

  if (destination) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "assistant-jump";
    link.textContent = destination.label;

    link.addEventListener("click", () => {
      if (destination.id === "expected-fields") {
        $("expected-fields").closest("details").open = true;
      }

      $(destination.id).scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      if (["document-input", "expected-fields"].includes(destination.id)) {
        $(destination.id).focus({ preventScroll: true });
      }
    });

    assistantMessages.append(link);
  }

  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function explainExtraction() {
  if (!lastExtraction) {
    return {
      text: "First click “Extract and evaluate” under the sample invoice. Then ask me again and I can explain what the page found.",
      destination: {
        id: "extract-doc",
        label: "Go to Extract and evaluate"
      }
    };
  }

  const labels = {
    invoice_number: "invoice number",
    date: "date",
    vendor: "vendor",
    bill_to: "bill-to name",
    email: "email",
    total: "total"
  };

  const missing = Object.entries(labels)
    .filter(([key]) => lastExtraction[key] === null)
    .map(([, label]) => label);

  const found = Object.keys(labels).length - missing.length;
  const lines = lastExtraction.line_items.length;

  return {
    text: `The demo found ${found} of 6 main fields and ${lines} line item${lines === 1 ? "" : "s"}. ${
      missing.length
        ? `Missing: ${missing.join(", ")}. Check that each field has a clear label and a value in the invoice text.`
        : "All main fields were found."
    } These values come from simple text rules, so check the JSON against the invoice.`,
    destination: {
      id: "document-result",
      label: "View JSON result"
    }
  };
}

function answerAssistant(question) {
  const q = question.toLowerCase().trim();
  const includes = (...words) => words.some((word) => q.includes(word));

  if (includes("privacy", "private", "send data", "uploaded where", "stored", "api key")) {
    return {
      text: "This public demo processes the invoice and this chat in your browser. It does not send either to an AI service. The separate Python backend supports optional model extraction when you run it yourself."
    };
  }

  if (includes("pdf", "scan", "ocr", "image")) {
    return {
      text: "The public page accepts pasted text or a .txt file. PDF reading and OCR are available in the separate Python backend, not on this GitHub Pages demo.",
      destination: { id: "document-input", label: "Go to text input" }
    };
  }

  if (includes("explain", "my result", "missing", "null", "wrong", "error", "why did")) {
    return explainExtraction();
  }

  if (includes("line item", "table", "quantity", "unit price")) {
    return {
      text: "For line items, the rules look for a comma-separated header: Item,Quantity,Unit Price,Total. Each following row should have those four values in that order. The JSON shows each extracted item.",
      destination: { id: "document-input", label: "View invoice text" }
    };
  }

  if (includes("accuracy", "evaluate", "expected", "compare", "match", "benchmark")) {
    return {
      text: "Open “Compare with expected fields,” enter known values as JSON, then click “Extract and evaluate.” The review table shows each match and mismatch. The score is an exact comparison for the fields you supplied, not a model confidence estimate.",
      destination: { id: "expected-fields", label: "Go to expected fields" }
    };
  }

  if (includes("field", "json", "extract what", "output")) {
    return {
      text: "The demo looks for invoice number, date, vendor, bill-to name, email, total, and line items. Click “Extract and evaluate” to see the JSON. A null value means a rule did not find that field.",
      destination: { id: "document-result", label: "Go to result" }
    };
  }

  if (includes("code", "source", "backend", "download", "github")) {
    return {
      text: "The “See how this app works” section has a source download. It includes the separate FastAPI backend for PDF text, OCR, and optional model extraction.",
      destination: { id: "source-code", label: "Go to source code" }
    };
  }

  if (includes("start", "use", "navigate", "where", "help", "sample", "upload", "paste", "how do")) {
    return {
      text: "Start with the sample invoice already in the text box, or paste your own invoice text or choose a .txt file. Open the optional expected-fields section, then click “Extract and evaluate.” Inspect the JSON and comparison table on the right.",
      destination: { id: "document-input", label: "Go to invoice input" }
    };
  }

  return {
    text: "I can help you start the demo, understand the JSON, troubleshoot missing fields, explain line items, find the source code, or clarify PDF and OCR support. Try one of those questions."
  };
}

function askAssistant(question) {
  const trimmed = question.trim();
  if (!trimmed) return;

  showAssistant(true);
  addAssistantMessage(trimmed, "visitor");

  const response = answerAssistant(trimmed);
  addAssistantMessage(response.text, "assistant", response.destination);

  assistantInput.value = "";
}

$("assistant-toggle").addEventListener("click", () =>
  showAssistant(assistantPanel.hidden)
);
$("assistant-close").addEventListener("click", () =>
  showAssistant(false)
);
$("assistant-form").addEventListener("submit", (event) => {
  event.preventDefault();
  askAssistant(assistantInput.value);
});
document.querySelectorAll("[data-assistant-prompt]").forEach((button) => {
  button.addEventListener("click", () =>
    askAssistant(button.dataset.assistantPrompt)
  );
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !assistantPanel.hidden) showAssistant(false);
});

addAssistantMessage(
  "Hi! I can guide you through extracting an invoice and explain the JSON result. What would you like to know?"
);
