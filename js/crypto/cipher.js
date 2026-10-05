// A real, working 64-bit Feistel block cipher built for teaching.
//
// It is NOT the STS Standard Transfer Algorithm (that is licensed by the STS
// Association and is not public). It has the same SHAPE as the real thing —
// a 64-bit block, a 64-bit secret key, a key schedule, and rounds of
// substitution + diffusion — so every property the lessons demonstrate
// (avalanche, key sensitivity, invertibility) is genuinely being demonstrated,
// not faked. Do not use it to protect anything real.

export const ROUNDS = 12;

/* ── AES S-box, derived rather than pasted so the construction is visible ── */
function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}
function buildSbox() {
  const inv = new Uint8Array(256);
  for (let i = 1; i < 256; i++) {
    for (let j = 1; j < 256; j++) if (gmul(i, j) === 1) { inv[i] = j; break; }
  }
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = inv[i];
    let y = x ^ ((x << 1) | (x >>> 7)) ^ ((x << 2) | (x >>> 6))
              ^ ((x << 3) | (x >>> 5)) ^ ((x << 4) | (x >>> 4));
    s[i] = (y ^ 0x63) & 0xff;
  }
  return s;
}
export const SBOX = buildSbox();
export const INV_SBOX = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[SBOX[i]] = i;
  return t;
})();

/* ── 32-bit helpers ────────────────────────────────────────────────────── */
const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
const subWord = (x) =>
  ((SBOX[(x >>> 24) & 0xff] << 24) | (SBOX[(x >>> 16) & 0xff] << 16) |
   (SBOX[(x >>>  8) & 0xff] <<  8) |  SBOX[x & 0xff]) >>> 0;

/** Expand a 64-bit key {hi,lo} into ROUNDS 32-bit round keys. */
export function keySchedule(key) {
  let a = key.hi >>> 0, b = key.lo >>> 0;
  const rk = [];
  for (let i = 0; i < ROUNDS; i++) {
    a = (a + 0x9e3779b9) >>> 0;              // golden-ratio constant, as in TEA
    b = rotl(b ^ a, 7 + (i % 11));
    a = subWord(rotl(a, 3) ^ b);
    rk.push((a ^ rotl(b, 16)) >>> 0);
  }
  return rk;
}

/** Feistel round function: confusion (S-box) then diffusion (rotate + xor). */
function F(r, rk) {
  let x = (r ^ rk) >>> 0;
  x = subWord(x);                            // confusion
  x = (rotl(x, 5) ^ rotl(x, 17) ^ (x >>> 3)) >>> 0;   // diffusion
  return x;
}

/**
 * Encrypt one 64-bit block.
 * @param {{hi:number,lo:number}} block
 * @param {{hi:number,lo:number}} key
 * @param {{trace?:boolean, rounds?:number}} [opts]
 * @returns {{hi:number,lo:number,trace:Array}}
 */
export function encryptBlock(block, key, opts = {}) {
  const n = opts.rounds ?? ROUNDS;
  const rk = keySchedule(key);
  let L = block.hi >>> 0, R = block.lo >>> 0;
  const trace = opts.trace ? [{ L, R, round: 0 }] : [];
  for (let i = 0; i < n; i++) {
    const nL = R;
    const nR = (L ^ F(R, rk[i])) >>> 0;
    L = nL; R = nR;
    if (opts.trace) trace.push({ L, R, round: i + 1, rk: rk[i] });
  }
  return { hi: L, lo: R, trace };
}

/** Decrypt one 64-bit block — the same rounds, walked backwards. */
export function decryptBlock(block, key, opts = {}) {
  const n = opts.rounds ?? ROUNDS;
  const rk = keySchedule(key);
  let L = block.hi >>> 0, R = block.lo >>> 0;
  const trace = opts.trace ? [{ L, R, round: n }] : [];
  for (let i = n - 1; i >= 0; i--) {
    const pR = L;
    const pL = (R ^ F(L, rk[i])) >>> 0;
    L = pL; R = pR;
    if (opts.trace) trace.push({ L, R, round: i, rk: rk[i] });
  }
  return { hi: L, lo: R, trace };
}

/* ── Conversions ───────────────────────────────────────────────────────── */
export const toBig    = (b) => (BigInt(b.hi >>> 0) << 32n) | BigInt(b.lo >>> 0);
export const fromBig  = (v) => ({ hi: Number((v >> 32n) & 0xffffffffn), lo: Number(v & 0xffffffffn) });
export const blockHex = (b) => (b.hi >>> 0).toString(16).padStart(8, '0') +
                               (b.lo >>> 0).toString(16).padStart(8, '0');

/** 64 characters of '0'/'1', most significant bit first. */
export function blockBits(b) {
  return (b.hi >>> 0).toString(2).padStart(32, '0') +
         (b.lo >>> 0).toString(2).padStart(32, '0');
}

/** How many of the 64 bits differ between two blocks. */
export function blockDistance(a, b) {
  const x = toBig(a) ^ toBig(b);
  let n = 0, v = x;
  while (v) { n += Number(v & 1n); v >>= 1n; }
  return n;
}

/** Derive a stable 64-bit key from any passphrase. */
export function keyFromPhrase(phrase) {
  let hi = 0x243f6a88, lo = 0x85a308d3;      // digits of pi, as a nothing-up-my-sleeve seed
  for (let i = 0; i < phrase.length; i++) {
    hi = (rotl(hi ^ phrase.charCodeAt(i), 5) + 0x9e3779b9) >>> 0;
    lo = subWord(rotl(lo, 11) ^ hi);
  }
  return { hi, lo };
}

/** XOR a string against a repeating key — the toy cipher used in lesson 1. */
export function xorString(text, keyText) {
  if (!keyText.length) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ keyText.charCodeAt(i % keyText.length));
  }
  return out;
}
