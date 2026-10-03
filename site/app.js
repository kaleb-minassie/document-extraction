// Static demo: invoice text and assistant messages stay in this browser tab.
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(
  /[&<>"']/g,
  char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])
);
const reviewFields = ['invoice_number','date','vendor','bill_to','email','total'];
const fieldLabels = {
  invoice_number:'Invoice number',
  date:'Date',
  vendor:'Vendor',
  bill_to:'Bill to',
  email:'Email',
  total:'Total'
};
let lastExtraction = null;

// Load a small text document into the editor.
$('doc-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) {
    $('selected-file').textContent = 'Choose a text file smaller than 1 MB.';
    event.target.value = '';
    return;
  }
  $('document-input').value = await file.text();
  $('selected-file').textContent = file.name;
});

// Extract known invoice labels and retain the matching source line as evidence.
function parseInvoice(text) {
  const lines = text.split(/\r?\n/);
  const patterns = {
    invoice_number: /^invoice\s*(?:number|#)\s*:\s*(.+)$/i,
    date: /^date\s*:\s*(.+)$/i,
    vendor: /^vendor\s*:\s*(.+)$/i,
    bill_to: /^bill\s*to\s*:\s*(.+)$/i,
    email: /^email\s*:\s*([^\s]+)$/i,
    total: /^total\s*:\s*\$?([\d,.]+)$/i
  };
  const result = {};
  const evidence = {};

  for (const key of reviewFields) {
    const index = lines.findIndex(line => patterns[key].test(line.trim()));
    const match = index >= 0 ? lines[index].trim().match(patterns[key]) : null;
    result[key] = match?.[1]?.trim() || null;
    evidence[key] = index >= 0
      ? {line: index + 1, text: lines[index].trim()}
      : null;
  }

  // Read simple comma-separated invoice rows following the expected header.
  const items = [];
  const headerIndex = lines.findIndex(
    line => /^item\s*,\s*quantity\s*,\s*unit price\s*,\s*total/i.test(line)
  );
  if (headerIndex >= 0) {
    for (let index = headerIndex + 1; index < lines.length; index++) {
      const cols = lines[index].split(',').map(part => part.trim());
      if (
        cols.length !== 4 ||
        !/^\d+(?:\.\d+)?$/.test(cols[1]) ||
        !/^\d+(?:\.\d+)?$/.test(cols[2]) ||
        !/^\d+(?:\.\d+)?$/.test(cols[3])
      ) break;

      items.push({
        description: cols[0],
        quantity: Number(cols[1]),
        unit_price: Number(cols[2]),
        total: Number(cols[3])
      });
    }
  }

  result.line_items = items;
  return {result,evidence};
}

// Compare only fields supplied by the visitor in the expected JSON.
function evaluateFields(result, raw) {
  if (!raw.trim()) return null;

  let expected;
  try {
    expected = JSON.parse(raw);
  } catch {
    throw new Error('Expected fields must be valid JSON.');
  }

  if (!expected || Array.isArray(expected) || typeof expected !== 'object') {
    throw new Error('Expected fields must be a JSON object.');
  }

  const fields = reviewFields.filter(key => Object.hasOwn(expected,key));
  if (!fields.length) {
    throw new Error('Add at least one supported field to compare.');
  }
  if (fields.some(key => !['string','number'].includes(typeof expected[key]))) {
    throw new Error('Expected values must be text or numbers.');
  }

  return fields.map(key => ({
    key,
    expected: String(expected[key]),
    actual: result[key],
    match: String(result[key] ?? '').toLowerCase() ===
           String(expected[key]).toLowerCase()
  }));
}

function renderEvaluation(comparisons) {
  if (!comparisons) return '';

  const matched = comparisons.filter(item => item.match).length;
  const rows = comparisons.map(item => `
    <tr>
      <th scope="row">${escapeHtml(fieldLabels[item.key])}</th>
      <td>${escapeHtml(item.expected)}</td>
      <td>${escapeHtml(item.actual ?? 'Not found')}</td>
      <td class="${item.match ? 'match':'mismatch'}">
        ${item.match ? 'Match':'Review'}
      </td>
    </tr>
  `).join('');

  return `
    <section class="evaluation">
      <h3>Expected-field comparison
        <span>${matched}/${comparisons.length} matched</span>
      </h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Field</th><th>Expected</th><th>Extracted</th><th>Result</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p>Exact text matching on supplied fields. This is not a model confidence score.</p>
    </section>
  `;
}

function renderResult(result, evidence, comparisonHtml) {
  const found = reviewFields.filter(key => result[key] !== null).length;
  const fields = reviewFields.map(key => `
    <div class="field-card${result[key] === null ? ' missing':''}">
      <div class="field-card-head">
        <span>${fieldLabels[key]}</span>
        <strong>${escapeHtml(result[key] ?? 'Not found')}</strong>
      </div>
      <small>
        ${evidence[key]
          ? `Source line ${evidence[key].line}: ${escapeHtml(evidence[key].text)}`
          : 'No matching labeled line found'}
      </small>
    </div>
  `).join('');

  $('document-result').className = '';
  $('document-result').innerHTML = `
    <div class="result-summary">
      <div><strong>${found}/6</strong><small>Fields located</small></div>
      <div><strong>${result.line_items.length}</strong><small>Line items</small></div>
      <div><strong>${6-found}</strong><small>Needs review</small></div>
    </div>
    <div class="result-tabs" role="tablist" aria-label="Result view">
      <button type="button" role="tab" aria-selected="true"
              aria-controls="fields-view" id="fields-tab">Fields and evidence</button>
      <button type="button" role="tab" aria-selected="false"
              aria-controls="json-view" id="json-tab">JSON output</button>
    </div>
    <div id="fields-view" class="result-view" role="tabpanel" aria-labelledby="fields-tab">
      <div class="field-list">${fields}</div>
      <p class="line-item-note">
        ${result.line_items.length} line item${result.line_items.length === 1 ? '':'s'}
        parsed from the comma-separated table.
      </p>
    </div>
    <div id="json-view" class="result-view" role="tabpanel"
         aria-labelledby="json-tab" hidden>
      <pre class="code">${escapeHtml(JSON.stringify(result,null,2))}</pre>
      <button id="export-json" type="button" class="export-button">
        Download JSON ↗
      </button>
    </div>
    ${comparisonHtml}
  `;

  // Switch between the evidence cards and JSON output.
  document.querySelectorAll('.result-tabs button').forEach(button =>
    button.addEventListener('click', () => {
      const showJson = button.id === 'json-tab';
      $('fields-tab').setAttribute('aria-selected',String(!showJson));
      $('json-tab').setAttribute('aria-selected',String(showJson));
      $('fields-view').hidden = showJson;
      $('json-view').hidden = !showJson;
    })
  );

  // Save the extracted JSON without contacting a server.
  $('export-json').addEventListener('click', () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result,null,2)],{type:'application/json'})
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'invoice-extraction.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  });
}

$('extract-doc').addEventListener('click', () => {
  const {result,evidence} = parseInvoice($('document-input').value);
  lastExtraction = result;

  let comparisonHtml = '';
  try {
    comparisonHtml = renderEvaluation(
      evaluateFields(result,$('expected-fields').value)
    );
  } catch (error) {
    comparisonHtml = `<p class="validation-error" role="alert">${escapeHtml(error.message)}</p>`;
  }
  renderResult(result,evidence,comparisonHtml);
});

// This is a local guide with prepared responses, not a live AI chatbot.
// It never sends documents or chat messages to a server.
const assistantPanel = $('assistant-panel');
const assistantMessages = $('assistant-messages');
const assistantInput = $('assistant-input');

function showAssistant(open) {
  assistantPanel.hidden = !open;
  $('assistant-toggle').setAttribute('aria-expanded',String(open));
  if (open) assistantInput.focus();
  else $('assistant-toggle').focus();
}

function addAssistantMessage(message,sender='assistant',destination=null) {
  const bubble = document.createElement('div');
  bubble.className = `assistant-message ${sender}`;
  bubble.textContent = message;
  assistantMessages.append(bubble);

  if (destination) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'assistant-jump';
    link.textContent = destination.label;
    link.addEventListener('click', () => {
      if (destination.id === 'expected-fields') {
        $('expected-fields').closest('details').open = true;
      }
      $(destination.id).scrollIntoView({behavior:'smooth',block:'center'});
      if (['document-input','expected-fields'].includes(destination.id)) {
        $(destination.id).focus({preventScroll:true});
      }
    });
    assistantMessages.append(link);
  }
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function explainExtraction() {
  if (!lastExtraction) {
    return {
      text:'Click “Extract and review” to process the sample invoice. Then ask me to explain the result.',
      destination:{id:'extract-doc',label:'Go to the demo'}
    };
  }

  const missing = reviewFields
    .filter(key => lastExtraction[key] === null)
    .map(key => fieldLabels[key].toLowerCase());
  const found = 6-missing.length;
  return {
    text:`The demo found ${found} of 6 main fields and ${lastExtraction.line_items.length} line item${lastExtraction.line_items.length === 1 ? '':'s'}. ${missing.length ? `Missing: ${missing.join(', ')}.` : 'All six main fields were located.'} Each field card shows the matching source line. The comparison table checks only the expected values you provided.`,
    destination:{id:'document-result',label:'View extraction'}
  };
}

function answerAssistant(question) {
  const q = question.toLowerCase().trim();
  const includes = (...words) => words.some(word => q.includes(word));

  if (includes('privacy','private','send data','stored','api key')) {
    return {
      text:'The public page parses the document and this chat in your browser. Nothing is sent to an AI service. The separate Python backend can use a model when configured with a server-side API key.'
    };
  }
  if (includes('pdf','scan','ocr','image')) {
    return {
      text:'This hosted demo accepts pasted text or a .txt file. The separate FastAPI backend supports PDF text extraction and OCR for image-only pages when Tesseract is installed.',
      destination:{id:'architecture',label:'See backend details'}
    };
  }
  if (includes('accuracy','evaluate','expected','compare','match','review')) {
    return {
      text:'Open “Compare with expected values,” enter known fields as JSON, and select “Extract and review.” The result marks exact matches and mismatches. This is not an AI confidence score.',
      destination:{id:'expected-fields',label:'Go to expected values'}
    };
  }
  if (includes('explain','my result','missing','null','wrong','error','why did')) {
    return explainExtraction();
  }
  if (includes('source line','evidence','trace','ground')) {
    return {
      text:'After extraction, open the Fields and evidence view. Each field shows the invoice line used to produce it. A missing field has no matching labeled line.',
      destination:{id:'document-result',label:'View field evidence'}
    };
  }
  if (includes('line item','table','quantity','unit price')) {
    return {
      text:'The browser parser looks for the header Item,Quantity,Unit Price,Total and reads following comma-separated rows with numeric quantities and prices.',
      destination:{id:'document-input',label:'View sample invoice'}
    };
  }
  if (includes('model','ai','lazarus')) {
    return {
      text:'This independent portfolio project is inspired by document AI work. The public extraction uses simple rules. The downloaded Python backend has an optional model path, but it is not active on this page.',
      destination:{id:'source-code',label:'Explore source'}
    };
  }
  if (includes('code','source','backend','download','github')) {
    return {
      text:'The source section contains the browser demo and a separate FastAPI backend for PDFs, OCR, optional model extraction, and field evaluation.',
      destination:{id:'source-code',label:'Go to source'}
    };
  }
  if (includes('start','use','navigate','where','help','sample','upload','paste','how do')) {
    return {
      text:'Try the preloaded sample invoice or paste your own text. Optionally edit the expected JSON, click “Extract and review,” then inspect Fields and evidence or JSON output.',
      destination:{id:'document-input',label:'Go to invoice input'}
    };
  }
  return {
    text:'I can help you use the demo, explain field evidence, review mismatches, find the source code, or clarify PDF and OCR support. Try one of those questions.'
  };
}

function askAssistant(question) {
  const trimmed = question.trim();
  if (!trimmed) return;
  showAssistant(true);
  addAssistantMessage(trimmed,'visitor');
  const response = answerAssistant(trimmed);
  addAssistantMessage(response.text,'assistant',response.destination);
  assistantInput.value = '';
}

$('assistant-toggle').addEventListener(
  'click', () => showAssistant(assistantPanel.hidden)
);
$('assistant-close').addEventListener('click', () => showAssistant(false));
$('assistant-form').addEventListener('submit', event => {
  event.preventDefault();
  askAssistant(assistantInput.value);
});
document.querySelectorAll('[data-assistant-prompt]').forEach(button =>
  button.addEventListener('click', () => askAssistant(button.dataset.assistantPrompt))
);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !assistantPanel.hidden) showAssistant(false);
});
addAssistantMessage('Hi! I can guide you through the invoice workflow and explain the results. What would you like to know?');
