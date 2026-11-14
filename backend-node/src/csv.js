// csv.js - Minimal CSV writer for Vaultly (Member 2, Part F).
// Built entirely with JavaScript's built-in capabilities — no CSV dependency.
//
// Two safety properties the viva should mention:
//  1. RFC 4180 escaping: a cell containing a comma, quote or newline is wrapped
//     in double quotes; inner quotes are doubled (" → ""). This keeps CSV
//     structure intact no matter what text the user stored.
//  2. Formula-injection defense (OWASP): spreadsheet apps (Excel / Google
//     Sheets) execute a cell as a formula when it begins with =, +, -, @, tab
//     or carriage return. Values like "=HYPERLINK(...)" or "=cmd|...'!" could
//     phish or run commands the moment a user opens the export. We prefix such
//     cells with a single quote ('), which spreadsheets display as plain text.

const FORMULA_PREFIXES = /^[=+\-@\t\r]/;

/** Makes one cell safe: quotes when needed, neutralises formula prefixes. */
export function csvCell(value) {
  let text;
  if (value === null || value === undefined) {
    text = '';
  } else if (value instanceof Date) {
    text = value.toISOString();
  } else {
    text = String(value);
  }

  // Never let a cell start with a spreadsheet formula character.
  if (FORMULA_PREFIXES.test(text)) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Joins a row of cells into one CSV line (CRLF per RFC 4180). */
export function csvRow(cells) {
  return cells.map(csvCell).join(',') + '\r\n';
}
