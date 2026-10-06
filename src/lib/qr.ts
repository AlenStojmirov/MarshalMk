/**
 * QR code encoder, written here instead of installed (Task 11.5).
 *
 * The npm package could not be fetched (the registry kept failing to resolve
 * on the shop's network), and the labels need exactly one thing: a short link
 * as a QR. That is a small, fixed subset of ISO/IEC 18004, so it lives here:
 *
 *  - byte mode only (a URL), UTF-8;
 *  - error correction level M — a label rubs against hangers and bags, and M
 *    still reads with about 15% of the code scuffed, while staying small;
 *  - versions 1–10, up to 213 bytes. The longest link today is 61 bytes
 *    (version 4); a longer one throws instead of printing something unreadable;
 *  - all eight masks tried, the one with the lowest penalty kept, as the
 *    standard asks.
 *
 * The layout follows the standard step by step, after Project Nayuki's
 * reference generator. Checked when written (2026-10-06), with no test suite to
 * keep it: the Reed–Solomon codewords of the standard's "HELLO WORLD" example,
 * the format words for all eight masks and the version words 7–10 against the
 * standard's tables, and a separately written reader that took back every
 * length from 0 to 213 bytes — all ten versions, all eight masks — with zero
 * syndromes in every block. Change it only with a check like that, and a phone
 * scan of a printed label.
 *
 * Pure: no database, no browser.
 */

/** Error correction codewords per block, level M, by version (index 0 unused). */
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
/** Number of error correction blocks, level M, by version. */
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Alignment pattern centres by version (the standard's Annex E). */
const ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

export const QR_MAX_VERSION = 10;

/** Modules available for data and error correction, after every function pattern. */
function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

const totalCodewords = (ver: number) => Math.floor(rawDataModules(ver) / 8);
const dataCodewords = (ver: number) => totalCodewords(ver) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
const countBits = (ver: number) => (ver <= 9 ? 8 : 16);

// --- Reed–Solomon over GF(2^8), polynomial 0x11D -----------------------------

export function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Generator polynomial of the given degree, roots α^0 … α^(degree−1), leading 1 dropped. */
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** The error correction codewords for one block of data. */
export function rsEcc(data: number[], degree: number): number[] {
  const divisor = rsDivisor(degree);
  const result = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

// --- Format and version words ------------------------------------------------

/**
 * The 15-bit format word: error correction level (M is 00, L 01, H 10, Q 11)
 * and mask, BCH(15,5) protected, XOR 0x5412.
 */
export function formatBits(eclBits: number, mask: number): number {
  const data = (eclBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The 18-bit version word (versions 7 and up), BCH(18,6) protected. */
export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

// --- Data codewords ----------------------------------------------------------

function encodeBytes(bytes: Uint8Array, ver: number): number[] {
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, countBits(ver));
  for (const b of bytes) push(b, 8);

  const capacity = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length)); // terminator
  push(0, (8 - (bits.length % 8)) % 8); // to a byte boundary

  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  for (let pad = 0xec; out.length < dataCodewords(ver); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Split into blocks, add error correction to each, interleave. */
function withEcc(data: number[], ver: number): number[] {
  const numBlocks = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const raw = totalCodewords(ver);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);

  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsEcc(dat, eccLen);
    // A placeholder where long blocks have their extra data codeword; skipped below.
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const out: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= numShort) out.push(blocks[j][i]);
    }
  }
  return out;
}

// --- The symbol ----------------------------------------------------------------

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export interface QrMatrix {
  version: number;
  size: number;
  mask: number;
  /** modules[row][column], true = dark. */
  modules: boolean[][];
}

/** Penalty of a finished symbol (the standard's four rules); lower reads better. */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let p = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) p += run - 2;
        run = 1;
      }
    }
    if (run >= 5) p += run - 2;
    // Finder-like 1:1:3:1:1 with four light modules on one side.
    const A = [true, false, true, true, true, false, true, false, false, false, false];
    const B = [false, false, false, false, true, false, true, true, true, false, true];
    for (let i = 0; i + 11 <= size; i++) {
      let a = true;
      let b = true;
      for (let k = 0; k < 11; k++) {
        const v = get(i + k);
        if (v !== A[k]) a = false;
        if (v !== B[k]) b = false;
      }
      if (a) p += 40;
      if (b) p += 40;
    }
  };
  for (let y = 0; y < size; y++) line((x) => m[y][x]);
  for (let x = 0; x < size; x++) line((y) => m[y][x]);
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
  }
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return p;
}

export function qrMatrix(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  while (ver <= QR_MAX_VERSION && 4 + countBits(ver) + 8 * bytes.length > dataCodewords(ver) * 8) ver++;
  if (ver > QR_MAX_VERSION) throw new Error(`QR: ${bytes.length} бајти е предолго (најмногу 213).`);

  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFn = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFn[y][x] = true;
  };

  // Timing patterns, then the finders (with separators) over their ends.
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(x, y, d !== 2 && d !== 4);
      }
    }
  }

  // Alignment patterns, except where the finders sit.
  const pos = ALIGNMENT[ver];
  const n = pos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFn(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  const drawFormat = (mask: number) => {
    const bits = formatBits(0, mask);
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
    setFn(8, 7, bit(6));
    setFn(8, 8, bit(7));
    setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
    setFn(8, size - 8, true); // the dark module
  };
  drawFormat(0); // reserves the area; drawn again once the mask is chosen

  if (ver >= 7) {
    const bits = versionBits(ver);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, dark);
      setFn(b, a, dark);
    }
  }

  // Data, in two-column strips from the bottom right, zig-zagging up and down.
  const codewords = withEcc(encodeBytes(bytes, ver), ver);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing pattern
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && i < codewords.length * 8) {
          modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  const applyMask = (mask: number) => {
    const f = MASKS[mask];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (!isFn[y][x] && f(x, y)) modules[y][x] = !modules[y][x];
    }
  };

  let best = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const p = penalty(modules);
    if (p < bestPenalty) {
      best = mask;
      bestPenalty = p;
    }
    applyMask(mask); // XOR again: back to unmasked
  }
  applyMask(best);
  drawFormat(best);

  return { version: ver, size, mask: best, modules };
}

/**
 * The code as an SVG string, `margin` light modules around it. Dark runs on a
 * row are merged into one rectangle, which keeps a sheet of labels light.
 */
export function qrSvg(text: string, margin = 2): string {
  const { size, modules } = qrMatrix(text);
  const dim = size + margin * 2;
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; ) {
      if (!modules[y][x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && modules[y][x + run]) run++;
      path += `M${x + margin},${y + margin}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}
