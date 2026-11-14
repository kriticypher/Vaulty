// ocr.js - Invoice text extraction for Vaultly (Member 2).
// Extraction paths, all fully local (no cloud APIs):
//   • PDF (text-based)   → hand-written extractor using Node's built-in zlib:
//     inflates FlateDecode streams and decodes the text-show operators, BOTH
//     simple "(Hello) Tj" literals AND CID-keyed "<0044...> Tj" hex strings
//     (Identity-H fonts), translating glyph codes through the font's /ToUnicode
//     CMap (bfchar + bfrange entries).
//   • PDF (scanned)      → when no text operators exist, embedded JPEG images
//     are extracted from the PDF and pushed through tesseract.js.
//   • Image (JPG/PNG)    → tesseract.js (pure WebAssembly Tesseract, runs
//     offline once the English language data is cached).
//
// The extracted text is then parsed with heuristics to detect the invoice
// number, seller and date. OCR is best-effort: when nothing can be read the
// caller simply gets empty fields and the user types them manually.

import zlib from 'node:zlib';

// ── PDF TEXT EXTRACTION (built-in zlib only, no PDF library) ─────────────────

/** Inflates every FlateDecode "stream … endstream" payload in the PDF. */
function inflateAllStreams(pdfBytes) {
  const streams = [];
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
    try {
      streams.push(zlib.inflateSync(pdfBytes.subarray(payloadStart, streamEnd)).toString('latin1'));
    } catch {
      // Not zlib: accept the payload as raw text when it looks printable
      // (uncompressed content streams), otherwise skip (JPEG/binary data).
      const payload = pdfBytes.subarray(payloadStart, streamEnd);
      if (payload.length > 0 && payload.length <= 2_000_000) {
        const text = payload.toString('latin1');
        const printable = text.split('').filter((ch) => /[\x20-\x7e\r\n\t]/.test(ch)).length;
        if (printable / text.length >= 0.95) {
          streams.push(text);
        }
      }
    }
    cursor = streamEnd + 9;
  }
  return streams;
}

/** Decodes a ToUnicode destination hex string (UTF-16BE code units). */
function hexToUnicode(hexDigits) {
  const digits = hexDigits.replace(/\s+/g, '');
  let out = '';
  if (digits.length % 4 === 0 && digits.length > 0) {
    for (let i = 0; i < digits.length; i += 4) {
      out += String.fromCharCode(parseInt(digits.slice(i, i + 4), 16));
    }
  } else {
    // byte-oriented destination (single-byte CMap)
    for (let i = 0; i < digits.length; i += 2) {
      out += String.fromCharCode(parseInt(digits.slice(i, i + 2), 16));
    }
  }
  return out.replace(/\u0000/g, '');
}

/**
 * Parses a /ToUnicode CMap (bfchar + bfrange entries) into a
 * Map<glyphCodeNumber, unicodeString>.
 */
export function parseToUnicodeCMap(cmapText) {
  const map = new Map();

  const bfcharBlocks = cmapText.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const block of bfcharBlocks) {
    const entry = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m;
    while ((m = entry.exec(block))) {
      map.set(parseInt(m[1], 16), hexToUnicode(m[2]));
    }
  }

  const bfrangeBlocks = cmapText.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  for (const block of bfrangeBlocks) {
    // Form 1: <lo> <hi> <dstStart>  (codes increment from dstStart)
    // Form 2: <lo> <hi> [<d1> <d2> …]  (explicit list)
    const entry = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g;
    let m;
    while ((m = entry.exec(block))) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (m[3] !== undefined) {
        const startUnits = m[3].replace(/\s+/g, '');
        const unit = startUnits.length % 4 === 0 && startUnits.length >= 4 ? 4 : 2;
        let base = parseInt(startUnits.slice(-unit), 16);
        for (let code = lo; code <= hi && code - lo < 65536; code++) {
          map.set(code, hexToUnicode((base + (code - lo)).toString(16).padStart(unit, '0')));
        }
      } else if (m[4] !== undefined) {
        const destinations = m[4].match(/<([0-9A-Fa-f]+)>/g) || [];
        for (let i = 0; i < destinations.length && lo + i <= hi; i++) {
          map.set(lo + i, hexToUnicode(destinations[i].slice(1, -1)));
        }
      }
    }
  }
  return map;
}

/** Decodes one hex string operand through the available ToUnicode maps. */
function decodeHexOperand(hexDigits, toUnicodeMaps) {
  const digits = hexDigits.replace(/\s+/g, '');
  if (!digits) return '';
  const twoByte = digits.length % 4 === 0;
  const step = twoByte ? 4 : 2;
  const codes = [];
  for (let i = 0; i < digits.length; i += step) {
    codes.push(parseInt(digits.slice(i, i + step), 16));
  }
  for (const map of toUnicodeMaps) {
    let out = '';
    let allMapped = true;
    for (const code of codes) {
      const mapped = map.get(code);
      if (mapped === undefined) { allMapped = false; break; }
      out += mapped;
    }
    if (allMapped && out.trim()) {
      return out;
    }
  }
  // No map covered every code: fall back to a raw UTF-16BE / byte decode but
  // only accept mostly-printable results (otherwise it is font-subset noise).
  const fallback = codes.map((c) => String.fromCharCode(c)).join('');
  const printable = fallback.split('').filter((ch) => /[\x20-\x7e]/.test(ch)).length;
  return printable / fallback.length >= 0.9 ? fallback : '';
}

const UNESCAPE = (literal) =>
  literal
    .slice(1, -1)
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\[nr]/g, ' ')
    .replace(/\\[0-9]{1,3}/g, (m) => String.fromCharCode(parseInt(m.slice(1), 8) || 32));

/** Pulls string operands out of the text-show operators inside a BT…ET block.
 *  Joining rule: operands decoded from parenthesized literals (simple fonts)
 *  are separate "words" — join those with spaces. Hex CID fragments (spaces
 *  are embedded as glyph codes inside the strings) are concatenated directly,
 *  so "P" + "r" + "a…" glyphs rebuild "Pranav" without stray spaces. */
function collectTextFromBlock(block, toUnicodeMaps) {
  const parts = []; // { text, isLiteral }

  // TJ arrays: [(He) -20 <llo>] TJ
  const tjArrays = block.match(/\[((?:[^\[\]])*)\]\s*TJ/g) || [];
  for (const arrayOp of tjArrays) {
    const strings = arrayOp.match(/\((?:\\.|[^()\\])*\)|<([0-9A-Fa-f\s]+)>/g) || [];
    let arrayText = '';
    for (const str of strings) {
      if (str.startsWith('(')) arrayText += UNESCAPE(str);
      else arrayText += decodeHexOperand(str.slice(1, -1), toUnicodeMaps);
    }
    parts.push({ text: arrayText, isLiteral: true }); // arrays act like literals
  }

  // Tj operators: (Hello) Tj   /   <0048…> Tj
  const tjPattern = /(\((?:\\.|[^()\\])*\)|<([0-9A-Fa-f\s]+)>)\s*Tj/g;
  let m;
  while ((m = tjPattern.exec(block))) {
    if (m[1].startsWith('(')) {
      parts.push({ text: UNESCAPE(m[1]), isLiteral: true });
    } else {
      parts.push({ text: decodeHexOperand(m[2], toUnicodeMaps), isLiteral: false });
    }
  }

  let out = '';
  for (const part of parts) {
    if (!part.text) continue;
    const previous = out.slice(-1);
    const needsSpace = part.isLiteral && out && /\w/.test(previous) && /\w/.test(part.text[0]);
    out += (needsSpace ? ' ' : '') + part.text;
  }
  return out;
}

/**
 * Pulls human-readable text out of a PDF (non-encrypted).
 * Handles: simple "(text) Tj / […] TJ" literals AND CID-keyed Identity-H
 * "<hex> Tj" strings translated via /ToUnicode CMaps. Streams without text
 * operators (ICC profiles, glyph vector programs, images) contribute nothing.
 * Scanned/image-only PDFs produce '' — use the JPEG fallback for those.
 */
export function extractPdfText(pdfBytes) {
  const streams = inflateAllStreams(pdfBytes);

  // 1. Every stream that looks like a ToUnicode CMap becomes a decoding table.
  const toUnicodeMaps = [];
  for (const stream of streams) {
    if (/beginb(fchar|range)/.test(stream)) {
      toUnicodeMaps.push(parseToUnicodeCMap(stream));
    }
  }

  // 2. Decode the BT…ET text blocks of every other stream.
  const lines = [];
  for (const stream of streams) {
    if (/beginb(fchar|range)/.test(stream)) continue; // a CMap itself, not text
    const blocks = stream.match(/BT[\s\S]*?ET/g);
    if (blocks) {
      for (const block of blocks) {
        const text = collectTextFromBlock(block, toUnicodeMaps).trim();
        if (text) lines.push(text);
      }
    } else if (/<[0-9A-Fa-f\s]+>\s*Tj/.test(stream) || /\((?:\\.|[^()\\])*\)\s*Tj/.test(stream)) {
      // Some generators omit BT/ET: fall back to scanning the whole stream.
      const text = collectTextFromBlock(stream, toUnicodeMaps).trim();
      if (text) lines.push(text);
    }
  }
  return lines.join('\n');
}

/**
 * Scanned-invoice fallback: extracts embedded JPEG images (DCTDecode) from the
 * PDF so tesseract.js can read them. Only sizeable images qualify (logos are
 * small); returns up to `maxImages` raw JPEG buffers.
 */
export function extractPdfImages(pdfBytes, maxImages = 2, minBytes = 10_000) {
  const images = [];
  const soi = Buffer.from([0xff, 0xd8, 0xff]);
  const eoi = Buffer.from([0xff, 0xd9]);
  let cursor = 0;
  while (images.length < maxImages) {
    const start = pdfBytes.indexOf(soi, cursor);
    if (start === -1) break;
    let end = pdfBytes.indexOf(eoi, start + soi.length);
    if (end === -1) break;
    end += eoi.length;
    if (end - start >= minBytes) {
      images.push(pdfBytes.subarray(start, end));
    }
    cursor = end;
  }
  return images;
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

const MONTH_NAMES = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

function normalizeDate(rawDate) {
  // ISO YYYY-MM-DD (may use . or / separators)
  let m = rawDate.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  // "Jul 02, 2026" / "July 2 2026" (month name first)
  m = rawDate.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(20\d{2})\b/);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    const day = Number(m[2]);
    if (month && day >= 1 && day <= 31) {
      return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  // "15-Jul-2026" / "02 July, 2026" (day first)
  m = rawDate.match(/\b(\d{1,2})(?:st|nd|rd|th)?[-/. ]([A-Za-z]{3,9})\.?[-/. ](20\d{2})\b/);
  if (m) {
    const month = MONTH_NAMES[m[2].toLowerCase()];
    const day = Number(m[1]);
    if (month && day >= 1 && day <= 31) {
      return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
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
  // Labels like: Invoice No: A-1023 / Bill #2024-88 / Receipt Number 55.
  // Two patterns because the separator rules differ:
  //   1. the word No/Number/num must be present ("Invoice No PT00001",
  //      "Invoice\nBilled To" does NOT match — bare "Invoice" never swallows
  //      the following word, and \b stops 'inv' matching inside 'INV-…');
  //   2. or an explicit separator follows the label ("Invoice: A-1023").
  const labeled =
    text.match(
      /(?:invoice|inv|bill|receipt)\s*(?:no\.?|number|num)\b\s*[:#\-–]?\s*([A-Za-z0-9][A-Za-z0-9/_-]{2,24})/i
    ) ||
    text.match(
      /(?:invoice|bill|receipt)\s*[:#\-–]\s*([A-Za-z0-9][A-Za-z0-9/_-]{2,24})/i
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
  // Fallback: first short text line of the document (store names usually come
  // first). Must look like a NAME, not drawing operators: starts with a letter,
  // has at least 3 letters, and letters must dominate over digits — this keeps
  // PDF operator junk like ".23999999 0 0 -.23999999 0 842.88 cm" out.
  const firstLine = text
    .split(/\r?\n|\s{3,}/)
    .map((line) => line.trim())
    .find((line) => {
      if (!/^[A-Za-z][A-Za-z0-9&'’.,() -]{2,39}$/.test(line)) return false;
      if (/\b(cm|re|rg|gs|Tj|TJ|Td|Tm|ET|BT)\b/.test(line)) return false;
      const letters = (line.match(/[A-Za-z]/g) || []).length;
      const digits = (line.match(/[0-9]/g) || []).length;
      return letters >= 3 && letters > digits;
    });
  return firstLine ? firstLine.trim() : '';
}

/**
 * Main entry point: extract text with the right engine, then detect fields.
 * Returns { text, invoice_number, seller, invoice_date, engine }.
 * `engine` is "pdf-zlib", "pdf-image-ocr" or "tesseract-ocr" — useful for the
 * viva/demo. PDFs fall back to image OCR when they carry no text operators.
 */
export async function extractInvoiceFields(fileName, fileBytes) {
  const extension = (fileName.split('.').pop() || '').toLowerCase();

  if (extension === 'pdf') {
    // Path 1: real text (covers simple literal PDFs AND CID/Identity-H fonts).
    const text = extractPdfText(fileBytes);
    if (text.trim()) {
      return {
        text,
        invoice_number: detectInvoiceNumber(text),
        seller: detectSeller(text),
        invoice_date: normalizeDate(text),
        engine: 'pdf-zlib'
      };
    }

    // Path 2: scanned PDF — OCR the embedded page images.
    const images = extractPdfImages(fileBytes);
    for (const image of images) {
      try {
        const imageText = await extractImageText(image);
        if (imageText.trim()) {
          return {
            text: imageText,
            invoice_number: detectInvoiceNumber(imageText),
            seller: detectSeller(imageText),
            invoice_date: normalizeDate(imageText),
            engine: 'pdf-image-ocr'
          };
        }
      } catch (err) {
        console.error('PDF image OCR error:', err.message);
      }
    }
    return { text: '', invoice_number: '', seller: '', invoice_date: '', engine: 'pdf-zlib' };
  }

  try {
    const text = await extractImageText(fileBytes);
    return {
      text,
      invoice_number: detectInvoiceNumber(text),
      seller: detectSeller(text),
      invoice_date: normalizeDate(text),
      engine: 'tesseract-ocr'
    };
  } catch (err) {
    // OCR engine unavailable (e.g. no language data cached yet) — degrade
    // gracefully: the user just fills the fields manually.
    console.error('OCR engine error:', err.message);
    return { text: '', invoice_number: '', seller: '', invoice_date: '', engine: 'tesseract-ocr', error: 'OCR engine unavailable. Please fill the fields manually.' };
  }
}
