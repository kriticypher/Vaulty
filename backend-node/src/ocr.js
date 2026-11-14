// ocr.js - Invoice text extraction for Vaultly (Member 2).
// Two extraction paths, both fully local (no cloud APIs):
//   • PDF  → hand-written stream extractor using Node's built-in zlib
//            (inflate FlateDecode content streams and pull the text operators).
//   • Image (JPG/PNG) → tesseract.js (pure WebAssembly Tesseract, runs offline
//     once the English language data is cached).
//
// The extracted text is then parsed with heuristics to detect the invoice
// number, seller and date. OCR is best-effort: when nothing can be read the
// caller simply gets empty fields and the user types them manually.

import zlib from 'node:zlib';

// ── PDF TEXT EXTRACTION (built-in zlib only, no PDF library) ─────────────────

/**
 * Pulls human-readable text out of a simple (non-encrypted, text-based) PDF.
 * Strategy: locate every "stream ... endstream" payload, inflate the ones that
 * are Flate-compressed (the vast majority), then collect the PDF text-show
 * operators' string arguments:  (Hello) Tj   and   [(Hel) -2 (lo)] TJ
 * Scanned/image-only PDFs contain no text operators → empty result.
 */
export function extractPdfText(pdfBytes) {
  const chunks = [];
  let cursor = 0;

  while (cursor < pdfBytes.length) {
    const streamStart = pdfBytes.indexOf('stream', cursor);
    if (streamStart === -1) break;
    const streamEnd = pdfBytes.indexOf('endstream', streamStart);
    if (streamEnd === -1) break;

    // Payload starts after "stream" + EOL (\r\n, \n or \r)
    let payloadStart = streamStart + 6;
    while (payloadStart < streamEnd && (pdfBytes[payloadStart] === 13 || pdfBytes[payloadStart] === 10)) {
      payloadStart += 1;
    }
    const payload = pdfBytes.subarray(payloadStart, streamEnd);

    let content = null;
    try {
      content = zlib.inflateSync(payload); // FlateDecode
    } catch {
      content = null; // not zlib (e.g. raw or image stream)
    }

    if (content) {
      chunks.push(content.toString('latin1'));
    }
    cursor = streamEnd + 9; // skip past "endstream"
  }

  const operators = chunks.join('\n');
  const stringLiterals = operators.match(/\((?:\\.|[^()\\])*\)/g) || [];

  return stringLiterals
    .map((literal) =>
      literal
        .slice(1, -1) // strip the surrounding parentheses
        .replace(/\\([()\\])/g, '$1') // unescape \( \) \\
        .replace(/\\[nr]/g, ' ') // \n \r → space
        .replace(/\\[0-9]{1,3}/g, ' ') // octal escapes → space (approximation)
    )
    .filter((s) => s.trim().length > 0)
    .join(' ');
}

// ── IMAGE OCR (tesseract.js, lazily initialised + cached worker) ─────────────

let workerPromise = null;

async function getImageWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(
      ({ createWorker }) =>
        // errorHandler: tesseract.js THROWS synchronously inside its message
        // handler for job failures (e.g. a corrupt image) when no handler is
        // set, which crashes the whole Node process. It always rejects the
        // recognize() promise first, so swallowing the event turns the crash
        // into an ordinary rejection that extractInvoiceFields handles.
        createWorker('eng', undefined, { errorHandler: () => {} })
    );
  }
  return workerPromise;
}

export async function extractImageText(imageBytes, timeoutMs = 60_000) {
  const worker = await getImageWorker();
  // Race the recognition against a timeout: if the worker died from an
  // internal error the promise may otherwise hang forever.
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('OCR took too long and was aborted.')), timeoutMs);
  });
  try {
    const result = await Promise.race([worker.recognize(imageBytes), timeout]);
    return result.data.text || '';
  } catch (err) {
    // Recycle the worker — after a hard failure it may be unusable and a
    // fresh one is created lazily on the next request.
    workerPromise = null;
    try { await worker.terminate(); } catch { /* already dead */ }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── FIELD DETECTION HEURISTICS ───────────────────────────────────────────────

function normalizeDate(rawDate) {
  // ISO YYYY-MM-DD (may use . or / separators)
  let m = rawDate.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  // DD/MM/YYYY or MM/DD/YYYY (day/year fixed to 19xx/20xx), separators - / .
  m = rawDate.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    // Ambiguous format: if the first number can't be a day, assume MM/DD/YYYY
    const [day, month] = first > 12 ? [first, second] : [second, first];
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

function detectInvoiceNumber(text) {
  // Labels like: Invoice No: A-1023 / Bill #2024-88 / INV 20260114
  const labeled = text.match(
    /(?:invoice|inv|bill|receipt)\s*(?:no\.?|number|num|#)?\s*[:#\-–]?\s*([A-Za-z0-9][A-Za-z0-9/_-]{2,24})/i
  );
  if (labeled) {
    return labeled[1].trim();
  }
  // Bare INV-style codes: INV-2026-001, INV2026001
  const bare = text.match(/\bINV[-\s]?[0-9][0-9\-/]{2,20}/i);
  return bare ? bare[0].replace(/\s+/g, '') : '';
}

function detectSeller(text) {
  // Labels like: Sold by: Acme Traders / Merchant: Croma / Vendor - StoreX.
  // The capture stops at the next label keyword (Date:, Invoice No:, Total…)
  // or a big vertical gap, so "Sold by: Acme Date: 2026-01-01" reads "Acme".
  const labeled = text.match(
    /(?:sold\s*by|seller|billed\s*(?:from|by)|merchant|store|vendor|from)\s*[:\-–]\s*([A-Za-z0-9&'’.,() -]{2,40}?)(?=\s{2,}|\s*\b(?:date|invoice\s*no|inv\s*no|bill\s*no|tel|phone|address|gst|total|amount)\b|$)/i
  );
  if (labeled) {
    return labeled[1].trim().replace(/[,.\s]+$/, '');
  }
  // Fallback: first short text line of the document (store names usually come first)
  const firstLine = text
    .split(/\r?\n|\s{3,}/)
    .map((line) => line.trim())
    .find((line) => /^[A-Za-z0-9&'’ .()-]{3,40}$/.test(line));
  return firstLine ? firstLine.trim() : '';
}

/**
 * Main entry point: extract text with the right engine, then detect fields.
 * Returns { text, invoice_number, seller, invoice_date, engine }.
 * `engine` is "pdf-zlib" or "tesseract-ocr" — useful for the viva/demo.
 */
export async function extractInvoiceFields(fileName, fileBytes) {
  const extension = (fileName.split('.').pop() || '').toLowerCase();

  let text = '';
  let engine = '';
  if (extension === 'pdf') {
    text = extractPdfText(fileBytes);
    engine = 'pdf-zlib';
  } else {
    try {
      text = await extractImageText(fileBytes);
      engine = 'tesseract-ocr';
    } catch (err) {
      // OCR engine unavailable (e.g. no language data cached yet) — degrade
      // gracefully: the user just fills the fields manually.
      console.error('OCR engine error:', err.message);
      return { text: '', invoice_number: '', seller: '', invoice_date: '', engine: 'tesseract-ocr', error: 'OCR engine unavailable. Please fill the fields manually.' };
    }
  }

  return {
    text,
    invoice_number: detectInvoiceNumber(text),
    seller: detectSeller(text),
    invoice_date: normalizeDate(text),
    engine
  };
}
