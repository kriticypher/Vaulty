// One-off generator for frontend/public/vaulty-logo.png — no dependencies.
// Renders a flat "vault wheel" icon in Vaultly's palette (navy + cobalt)
// with anti-aliasing, and encodes it as a PNG using zlib.
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIZE = 256;
const CX = SIZE / 2, CY = SIZE / 2;

const NAVY = [15, 23, 42];        // #0f172a background
const COBALT = [37, 99, 235];     // #2563eb vault ring
const ACCENT = [96, 165, 250];    // #60a5fa inner ring + hub
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (edge, d) => clamp(edge + 0.5 - d, 0, 1); // ~1px anti-aliasing

function roundedRectAlpha(x, y, radius = 56) {
  const qx = Math.max(radius - x, x - (SIZE - 1 - radius), 0);
  const qy = Math.max(radius - y, y - (SIZE - 1 - radius), 0);
  const dist = Math.hypot(qx, qy);
  return clamp(radius - dist + 0.5, 0, 1);
}

function coverage(x, y) {
  const px = x - CX, py = y - CY;
  const dist = Math.hypot(px, py);

  // Outer vault ring (the "door"): annulus 60..80
  let cov = smooth(10, Math.abs(dist - 70));
  // Inner accent ring: annulus 36..42
  const inner = smooth(3, Math.abs(dist - 39));

  // 8 spokes of the vault wheel (every 45°), thickness ~8px, from r=16 to r=58
  let spokes = 0;
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI / 4) * k;
    const proj = px * Math.cos(a) + py * Math.sin(a);
    const perp = Math.abs(-px * Math.sin(a) + py * Math.cos(a));
    if (proj > 14 && proj < 58) {
      spokes = Math.max(spokes, smooth(4, perp));
    }
  }

  // Center hub: filled disc radius 16
  const hub = smooth(16, dist);

  return { ring: cov, inner, spokes, hub };
}

const rows = [];
for (let y = 0; y < SIZE; y++) {
  const scanline = Buffer.alloc(1 + SIZE * 4);
  scanline[0] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const bgAlpha = roundedRectAlpha(x, y);
    let r = NAVY[0], g = NAVY[1], b = NAVY[2], a = bgAlpha * 255;

    const { ring, inner, spokes, hub } = coverage(x, y);

    // blend helper: paint color with coverage over current pixel
    const blend = (color, c) => {
      if (c <= 0) return;
      r = r * (1 - c) + color[0] * c;
      g = g * (1 - c) + color[1] * c;
      b = b * (1 - c) + color[2] * c;
    };

    blend(COBALT, ring);
    blend(ACCENT, Math.max(inner, Math.min(spokes, 1) * 0.9, hub));

    const off = 1 + x * 4;
    scanline[off] = Math.round(r);
    scanline[off + 1] = Math.round(g);
    scanline[off + 2] = Math.round(b);
    scanline[off + 3] = Math.round(a);
  }
  rows.push(scanline);
}

// ── PNG ENCODING ─────────────────────────────────────────────────────────────
const raw = Buffer.concat(rows);
const idat = zlib.deflateSync(raw, { level: 9 });

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// CRC32 (IEEE) — small table-based implementation
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0))
]);

fs.writeFileSync('/Users/pthawait/Documents/GitHub/Vaulty/frontend/public/vaulty-logo.png', png);
console.log(`vaulty-logo.png written (${png.length} bytes, ${SIZE}x${SIZE})`);
