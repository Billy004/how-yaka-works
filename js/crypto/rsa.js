// Textbook RSA with real BigInt arithmetic, at a size small enough that the
// numbers fit on screen and you can watch the security argument fail.
//
// Real RSA uses 2048-bit or larger moduli and a padding scheme (OAEP for
// encryption, PSS for signatures). This has neither — it is here so the
// mathematics is visible, not to protect anything.

const PRIMES = [
  1009,1013,1019,1021,1031,1033,1039,1049,1051,1061,1063,1069,1087,1091,1093,
  1097,1103,1109,1117,1123,1129,1151,1153,1163,1171,1181,1187,1193,1201,1213,
  1217,1223,1229,1231,1237,1249,1259,1277,1279,1283,1289,1291,1297,1301,1303,
  1307,1319,1321,1327,1361,1367,1373,1381,1399,1409,1423,1427,1429,1433,1439
];

export function modpow(base, exp, mod) {
  let r = 1n; base %= mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}

function egcd(a, b) {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, y] = egcd(b, a % b);
  return [g, y, x - (a / b) * y];
}

export function modinv(a, m) {
  const [g, x] = egcd(((a % m) + m) % m, m);
  if (g !== 1n) return null;
  return ((x % m) + m) % m;
}

const gcd = (a, b) => (b === 0n ? a : gcd(b, a % b));

/**
 * Build a key pair from two primes.
 * @returns {{p,q,n,phi,e,d, pub:{n,e}, priv:{n,d}, bits:number}}
 */
export function makeKeyPair(p, q) {
  const P = BigInt(p), Q = BigInt(q);
  const n = P * Q;
  const phi = (P - 1n) * (Q - 1n);
  let e = 65537n;
  if (e >= phi || gcd(e, phi) !== 1n) {
    e = 3n;
    while (gcd(e, phi) !== 1n) e += 2n;
  }
  const d = modinv(e, phi);
  return {
    p: P, q: Q, n, phi, e, d,
    pub: { n, e }, priv: { n, d },
    bits: n.toString(2).length
  };
}

export function randomKeyPair() {
  let p = PRIMES[Math.floor(Math.random() * PRIMES.length)];
  let q = PRIMES[Math.floor(Math.random() * PRIMES.length)];
  while (q === p) q = PRIMES[Math.floor(Math.random() * PRIMES.length)];
  return makeKeyPair(p, q);
}

export const encryptNum = (m, pub)  => modpow(BigInt(m), pub.e, pub.n);
export const decryptNum = (c, priv) => modpow(BigInt(c), priv.d, priv.n);
export const signNum    = (m, priv) => modpow(BigInt(m), priv.d, priv.n);
export const verifyNum  = (s, pub)  => modpow(BigInt(s), pub.e, pub.n);

/** Encrypt a string one character at a time (each code point must be < n). */
export function encryptString(text, pub) {
  return [...text].map(ch => encryptNum(BigInt(ch.codePointAt(0)), pub));
}
export function decryptString(nums, priv) {
  return nums.map(c => String.fromCodePoint(Number(decryptNum(c, priv)))).join('');
}

/**
 * Factor a small modulus by trial division — the attack that real RSA's key
 * size is chosen to make impossible.
 * @returns {{p,q,steps,ms}|null}
 */
export function factor(n, maxSteps = 5_000_000) {
  const t0 = performance.now();
  let steps = 0;
  for (let i = 2n; i * i <= n; i++) {
    steps++;
    if (steps > maxSteps) return null;
    if (n % i === 0n) return { p: i, q: n / i, steps, ms: performance.now() - t0 };
  }
  return null;
}

/** Reduce a hash digest into the range [0, n) so it can be signed. */
export function digestToNum(bytes, n) {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v % n;
}

export { PRIMES };
