// Demo data and chat messages stay in this browser tab.
const $ = (id) => document.getElementById(id);

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

let lastExtraction = null;

// Load a selected text file into the invoice input.
$("doc-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (file) {
    $("document-input").value = await file.text();
  }
});

// Extract labeled invoice fields from the text in the browser.
$("extract-doc").addEventListener("click", () => {
  const text = $("document-input").value;
  const field = (pattern) => text.match(pattern)?.[1]?.trim() || null;
  const lines = text.split(/\r?\n/);
  const items = [];

  const headerIndex = lines.findIndex((line) =>
    /^item\s*,\s*quantity\s*,\s*unit price\s*,\s*total/i.test(line)
  );

  if (headerIndex >= 0) {
    for (const line of lines.slice(headerIndex + 1)) {
      const columns = line.split(",").map((column) => column.trim());

      if (
        columns.length === 4 &&
        /^\d+(?:\.\d+)?$/.test(columns[1]) &&
        /^\d+(?:\.\d+)?$/.test(columns[2])
      ) {
        items.push({
          description: columns[0],
          quantity: Number(columns[1]),
          unit_price: Number(columns[2]),
          total: Number(columns[3])
        });
      } else {
        break;
      }
    }
  }

  const result = {
    invoice_number: field(/invoice\s*(?:number|#)\s*:\s*([^\r\n]+)/i),
    date: field(/date\s*:\s*([^\r\n]+)/i),
    vendor: field(/vendor\s*:\s*([^\r\n]+)/i),
    bill_to: field(/bill\s*to\s*:\s*([^\r\n]+)/i),
    email: field(/\bemail\s*:\s*([^\s\r\n]+)/i),
    total: field(/(?:^|\n)total\s*:\s*\$?([\d,.]+)/i),
    line_items: items
  };

  // Keep the result so the assistant can explain it later.
  lastExtraction = result;

  const found = Object.entries(result).filter(
    ([key, value]) => key !== "line_items" && value !== null
  ).length;

  $("document-result").className = "";
  $("document-result").innerHTML = `
    <div class="summary">
      <div><strong>${found}/6</strong><small>Fields found</small></div>
      <div><strong>${items.length}</strong><small>Line items</small></div>
    </div>
    <pre class="code">${escapeHtml(JSON.stringify(result, null, 2))}</pre>
  `;
});

// The assistant uses local question matching. It does not call an AI API.
const assistantPanel = $("assistant-panel");
const assistantMessages = $("assistant-messages");
const assistantInput = $("assistant-input");

function showAssistant(open) {
  assistantPanel.hidden = !open;
  $("assistant-toggle").setAttribute("aria-expanded", String(open));

  if (open) {
    assistantInput.focus();
  } else {
    $("assistant-toggle").focus();
  }
}

function addAssistantMessage(message, sender = "assistant", destination = null) {
  const bubble = document.createElement("div");
  bubble.className = `assistant-message ${sender}`;

  // textContent keeps visitor messages from being interpreted as HTML.
  bubble.textContent = message;
  assistantMessages.append(bubble);

  if (destination) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "assistant-jump";
    link.textContent = destination.label;

    link.addEventListener("click", () => {
      $(destination.id).scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      if (destination.id === "document-input") {
        $("document-input").focus({ preventScroll: true });
      }
    });

    assistantMessages.append(link);
  }

  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function explainExtraction() {
  if (!lastExtraction) {
    return {
      text: "First click “Extract fields” under the sample invoice. Then ask me again and I can explain what the page found.",
      destination: {
        id: "extract-doc",
        label: "Go to Extract fields"
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
  const count = lastExtraction.line_items.length;

  return {
    text:
      `The demo found ${found} of 6 main fields and ${count} line ` +
      `item${count === 1 ? "" : "s"}. ` +
      (missing.length
        ? `Missing: ${missing.join(", ")}. Check that each field has a clear label and a value in the invoice text.`
        : "All main fields were found.") +
      " These values come from simple text rules, so check the JSON against the invoice.",
    destination: {
      id: "document-result",
      label: "View JSON result"
    }
  };
}

function answerAssistant(question) {
  const q = question.toLowerCase().trim();
  const includes = (...words) => words.some((word) => q.includes(word));

  if (includes("privacy", "private", "send data", "stored", "api key")) {
    return {
      text: "This public demo processes the invoice and this chat in your browser. It does not send either to an AI service. The separate Python backend supports optional model extraction when you run it yourself."
    };
  }

  if (includes("pdf", "scan", "ocr", "image")) {
    return {
      text: "The public page accepts pasted text or a .txt file. PDF reading and OCR are available in the separate Python backend, not on this GitHub Pages demo.",
      destination: {
        id: "document-input",
        label: "Go to text input"
      }
    };
  }

  if (includes("explain", "my result", "missing", "null", "wrong", "error")) {
    return explainExtraction();
  }

  if (includes("line item", "table", "quantity", "unit price")) {
    return {
      text: "For line items, the rules look for a comma-separated header: Item,Quantity,Unit Price,Total. Each following row should have those four values in that order.",
      destination: {
        id: "document-input",
        label: "View invoice text"
      }
    };
  }

  if (includes("field", "json", "output")) {
    return {
      text: "The demo looks for invoice number, date, vendor, bill-to name, email, total, and line items. Click “Extract fields” to see the JSON. A null value means a rule did not find that field.",
      destination: {
        id: "document-result",
        label: "Go to result"
      }
    };
  }

  if (includes("accuracy", "evaluate", "expected", "compare")) {
    return {
      text: "The separate backend can compare expected values with extracted fields. This browser demo displays found fields and JSON, but it does not calculate an accuracy score."
    };
  }

  if (includes("code", "source", "backend", "download", "github")) {
    return {
      text: "The “See how this app works” section has a source download. It includes the separate FastAPI backend for PDF text, OCR, and optional model extraction.",
      destination: {
        id: "source-code",
        label: "Go to source code"
      }
    };
  }

  if (includes("start", "use", "navigate", "where", "help", "sample", "upload", "paste", "how do")) {
    return {
      text: "Start with the sample invoice already in the text box, or paste your own invoice text or choose a .txt file. Click “Extract fields” and inspect the JSON on the right. Ask “Explain my result” afterward.",
      destination: {
        id: "document-input",
        label: "Go to invoice input"
      }
    };
  }

  return {
    text: "I can help you start the demo, understand the JSON, troubleshoot missing fields, explain line items, find the source code, or clarify PDF and OCR support."
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

$("assistant-toggle").addEventListener("click", () => {
  showAssistant(assistantPanel.hidden);
});

$("assistant-close").addEventListener("click", () => {
  showAssistant(false);
});

$("assistant-form").addEventListener("submit", (event) => {
  event.preventDefault();
  askAssistant(assistantInput.value);
});

document.querySelectorAll("[data-assistant-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    askAssistant(button.dataset.assistantPrompt);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !assistantPanel.hidden) {
    showAssistant(false);
  }
});

addAssistantMessage(
  "Hi! I can guide you through extracting an invoice and explain the JSON result. What would you like to know?"
);
