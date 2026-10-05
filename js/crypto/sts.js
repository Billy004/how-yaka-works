// An educational model of an STS-style prepaid electricity token.
//
// The FIELD STRUCTURE follows the shape described in IEC 62055-41: a token is
// 66 bits — a 2-bit class sent in the clear, plus a 64-bit data block that is
// encrypted under a per-meter Decoder Key — rendered as 20 decimal digits.
// The encryption itself uses our own teaching cipher (see cipher.js), because
// the real Standard Transfer Algorithm is licensed and not published.
//
// Everything here genuinely round-trips: a token built by buildCreditToken()
// really is decrypted, CRC-checked and TID-checked by Meter.feed().

import { encryptBlock, decryptBlock, toBig, fromBig, keyFromPhrase } from './cipher.js';

/* ── Token classes (2 bits, transmitted in the clear) ──────────────────── */
export const CLASS = { CREDIT: 0, KEY_CHANGE: 1, ENGINEER: 2, RESERVED: 3 };
export const CLASS_NAME = ['Credit transfer', 'Key change', 'Engineering', 'Reserved'];

/* ── Sub-classes (4 bits) ──────────────────────────────────────────────── */
export const SUB = { CREDIT: 0, CREDIT_EMERGENCY: 1, CLEAR_TAMPER: 2, CLEAR_CREDIT: 3 };

/* ── Base dates. The real 24-bit TID counts minutes from 1993-01-01, which
      ran out on 24 Nov 2024 — the global "TID rollover" — moving the world to
      a 2014 base date. Lesson 11 demonstrates exactly this. ─────────────── */
export const BASE_DATES = {
  1: { label: '1993-01-01 (original)', ms: Date.UTC(1993, 0, 1, 0, 0, 0) },
  2: { label: '2014-01-01 (post-rollover)', ms: Date.UTC(2014, 0, 1, 0, 0, 0) }
};
export const TID_MAX = 0xFFFFFF;          // 24 bits = 16,777,215 minutes ≈ 31.9 years
/** The base date in force today. Base 1 expired on 2024-11-24; anything "now" must use 2. */
export const CURRENT_BASE = 2;

export const tidFromDate  = (date, base = 1) =>
  Math.floor((date.getTime() - BASE_DATES[base].ms) / 60000);
export const dateFromTid  = (tid, base = 1) =>
  new Date(BASE_DATES[base].ms + tid * 60000);
export const tidExpiry    = (base = 1) => dateFromTid(TID_MAX, base);

/* ── CRC-16/CCITT-FALSE, used by STS for error detection ───────────────── */
export function crc16(bytes) {
  let crc = 0xFFFF;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF
                                                    : (crc << 1) & 0xFFFF;
  }
  return crc & 0xFFFF;
}
/** CRC over the top 48 bits of a 64-bit block value. */
function crcOfTop48(v48) {
  const bytes = [];
  for (let i = 5; i >= 0; i--) bytes.push(Number((v48 >> BigInt(i * 8)) & 0xFFn));
  return crc16(bytes);
}

/* ── Decoder key derivation ────────────────────────────────────────────────
   A meter's Decoder Key is never shipped around: it is DERIVED from the
   utility's secret Vending Key plus public data printed on the meter.
   Same inputs → same key, on both sides, without either side transmitting it. */
export function deriveDecoderKey({ vendingKey, drn, sgc, krn = 1, ti = 7 }) {
  const seed = ((BigInt(drn) & 0xFFFFFFFFFFn) << 24n)
             | ((BigInt(sgc) & 0xFFFFn) << 8n)
             | ((BigInt(krn) & 0xFn) << 4n)
             | (BigInt(ti) & 0xFn);
  return encryptBlock(fromBig(seed & 0xFFFFFFFFFFFFFFFFn), vendingKey);
}
export const vendingKeyFromPhrase = keyFromPhrase;

/* ── Building tokens ───────────────────────────────────────────────────── */
function finish(cls, blockValue, dk) {
  const cipher = encryptBlock(fromBig(blockValue), dk);
  const big = (BigInt(cls & 3) << 64n) | toBig(cipher);
  const digits = big.toString(10).padStart(20, '0');
  return {
    digits,
    groups: digits.match(/.{4}/g).join(' '),
    plainBlock: fromBig(blockValue),
    cipherBlock: cipher,
    cls
  };
}

/** Refuse values that do not fit their field, instead of silently masking them —
 *  a TID past the 24-bit ceiling would otherwise wrap to a date decades in the past. */
function checkField(name, v, max) {
  if (!Number.isInteger(v) || v < 0 || v > max) {
    throw new RangeError(`${name} ${v} does not fit its field (0…${max.toLocaleString()}).`);
  }
}

/**
 * Credit token: subclass(4) | TID(24) | units(20) | CRC(16)
 * `units` is in 0.1 kWh steps, so 1 kWh = 10.
 * Simplified from IEC 62055-41, whose credit token is subclass(4) | RND(4) | TID(24) |
 * amount(16, compactly encoded) | CRC(16). We drop RND and use a plain 20-bit amount.
 */
export function buildCreditToken({ tid, units, dk, sub = SUB.CREDIT }) {
  checkField('TID', tid, TID_MAX);
  checkField('Amount', units, 0xFFFFF);
  const top48 = ((BigInt(sub) & 0xFn) << 44n)
              | ((BigInt(tid) & 0xFFFFFFn) << 20n)
              | (BigInt(units) & 0xFFFFFn);
  const v = (top48 << 16n) | BigInt(crcOfTop48(top48));
  return finish(CLASS.CREDIT, v, dk);
}

/**
 * Key-change token half: subclass(4) | half(4) | new key half(32) | KRN(8) | CRC(16)
 * Two of these together carry a complete new 64-bit Decoder Key.
 */
export function buildKeyChangeToken({ half, keyHalf, krn, dk, sub = 0 }) {
  const top48 = ((BigInt(sub) & 0xFn) << 44n)
              | ((BigInt(half) & 0xFn) << 40n)
              | ((BigInt(keyHalf >>> 0) & 0xFFFFFFFFn) << 8n)
              | (BigInt(krn) & 0xFFn);
  const v = (top48 << 16n) | BigInt(crcOfTop48(top48));
  return finish(CLASS.KEY_CHANGE, v, dk);
}

/** Build the KCT pair that moves a meter to `newKey` / `newKrn`. */
export function buildKctPair({ newKey, newKrn, dk }) {
  return [
    buildKeyChangeToken({ half: 0, keyHalf: newKey.hi, krn: newKrn, dk }),
    buildKeyChangeToken({ half: 1, keyHalf: newKey.lo, krn: newKrn, dk })
  ];
}

/* ── Reading tokens ────────────────────────────────────────────────────── */
export function normaliseDigits(s) { return (s || '').replace(/\D/g, ''); }

/** Split a 20-digit token into its clear class and its encrypted block. */
export function splitToken(digits) {
  const d = normaliseDigits(digits);
  if (d.length !== 20) return { error: `Token must be 20 digits (got ${d.length}).` };
  let big;
  try { big = BigInt(d); } catch { return { error: 'Not a number.' }; }
  if (big >= (1n << 66n)) return { error: 'Token value exceeds 66 bits — not a valid token.' };
  return { cls: Number((big >> 64n) & 3n), cipherBlock: fromBig(big & 0xFFFFFFFFFFFFFFFFn), big };
}

/** Decrypt and unpack a token with a given Decoder Key. Does NOT apply meter policy. */
export function decodeToken(digits, dk) {
  const s = splitToken(digits);
  if (s.error) return { ok: false, stage: 'format', reason: s.error };

  const plain = decryptBlock(s.cipherBlock, dk);
  const v = toBig(plain);
  const top48 = v >> 16n;
  const crcGot = Number(v & 0xFFFFn);
  const crcWant = crcOfTop48(top48);
  const crcOk = crcGot === crcWant;

  const out = {
    ok: crcOk, stage: crcOk ? 'decoded' : 'crc',
    reason: crcOk ? '' : 'CRC mismatch — wrong key, wrong meter, or a typo.',
    cls: s.cls, className: CLASS_NAME[s.cls],
    crcGot, crcWant, crcOk, plainBlock: plain, cipherBlock: s.cipherBlock
  };

  if (s.cls === CLASS.KEY_CHANGE) {
    out.sub     = Number((top48 >> 44n) & 0xFn);
    out.half    = Number((top48 >> 40n) & 0xFn);
    out.keyHalf = Number((top48 >> 8n) & 0xFFFFFFFFn);
    out.krn     = Number(top48 & 0xFFn);
  } else {
    out.sub   = Number((top48 >> 44n) & 0xFn);
    out.tid   = Number((top48 >> 20n) & 0xFFFFFFn);
    out.units = Number(top48 & 0xFFFFFn);
    out.kwh   = out.units / 10;
  }
  return out;
}

/* ── The meter ─────────────────────────────────────────────────────────────
   Holds exactly the state a real MCU keeps in EEPROM, and applies the same
   acceptance policy: decrypt → CRC → class → anti-replay → act. */
export class Meter {
  constructor({ drn, sgc, dk, krn = 1, baseDate = 1, balanceKwh = 0 }) {
    this.drn = drn; this.sgc = sgc; this.dk = dk; this.krn = krn;
    this.baseDate = baseDate;
    this.balanceKwh = balanceKwh;
    this.lastTid = 0;
    // Redundant under the strict "newer than lastTid" rule used here. Real STS meters keep a
    // list like this instead, so a slightly out-of-order token can still be accepted.
    this.usedTids = new Set();
    this.relay = balanceKwh > 0;
    this.tamper = null;
    this.pendingKct = null;        // half 0 held while waiting for half 1
    this.history = [];
  }

  /** Keep a bounded event history, like a real meter's EEPROM log. */
  _log(r) {
    this.history.push(r);
    if (this.history.length > 50) this.history.shift();
    return r;
  }

  get status() {
    if (this.tamper) return 'TAMPER';
    if (!this.relay) return 'OFF';
    return 'ON';
  }

  /** Feed a 20-digit token in. Returns a step-by-step result for the UI. */
  feed(digits) {
    const steps = [];
    const fail = (reason, stage) => {
      steps.push({ step: stage, ok: false, detail: reason });
      return this._log({ ok: false, reason, stage, steps });
    };

    const d = normaliseDigits(digits);
    if (d.length !== 20) return fail(`Need 20 digits, got ${d.length}.`, 'format');
    steps.push({ step: 'format', ok: true, detail: `20 digits accepted` });

    const t = decodeToken(d, this.dk);
    if (t.stage === 'format') return fail(t.reason, 'format');
    steps.push({ step: 'decrypt', ok: true,
      detail: `class ${t.cls} (${t.className}), block decrypted with stored DK` });

    if (!t.crcOk) {
      return fail(`CRC check failed (got 0x${t.crcGot.toString(16).padStart(4,'0')}, ` +
                  `expected 0x${t.crcWant.toString(16).padStart(4,'0')}). ` +
                  `This token was not made for this meter.`, 'crc');
    }
    steps.push({ step: 'crc', ok: true, detail: `CRC 0x${t.crcWant.toString(16).padStart(4,'0')} matches` });

    if (this.tamper && t.cls === CLASS.CREDIT && t.sub !== SUB.CLEAR_TAMPER) {
      return fail(`Meter is in TAMPER state — clear it before loading credit.`, 'tamper');
    }

    if (t.cls === CLASS.KEY_CHANGE) return this._applyKct(t, steps);
    if (t.cls === CLASS.CREDIT)     return this._applyCredit(t, steps);

    return fail(`Token class ${t.cls} (${t.className}) is not handled by this meter.`, 'class');
  }

  _applyCredit(t, steps) {
    if (t.sub === SUB.CLEAR_TAMPER) {
      this.tamper = null;
      steps.push({ step: 'action', ok: true, detail: 'Tamper flag cleared' });
      const r = { ok: true, kind: 'clear-tamper', steps, meter: this.snapshot() };
      return this._log(r);
    }

    // Anti-replay: the whole point of the TID.
    if (this.usedTids.has(t.tid) || t.tid <= this.lastTid) {
      const when = dateFromTid(t.tid, this.baseDate);
      const r = {
        ok: false, stage: 'replay', steps,
        reason: `Replay rejected. Token TID ${t.tid} (${when.toISOString().slice(0,16).replace('T',' ')} UTC) ` +
                `is not newer than the last accepted TID ${this.lastTid}.`
      };
      steps.push({ step: 'anti-replay', ok: false, detail: r.reason });
      return this._log(r);
    }
    steps.push({ step: 'anti-replay', ok: true,
      detail: `TID ${t.tid} > stored ${this.lastTid} — fresh token` });

    this.lastTid = t.tid;
    this.usedTids.add(t.tid);
    this.balanceKwh = Math.round((this.balanceKwh + t.kwh) * 10) / 10;
    this.relay = this.balanceKwh > 0;
    steps.push({ step: 'action', ok: true,
      detail: `+${t.kwh.toFixed(1)} kWh credited, relay ${this.relay ? 'CLOSED' : 'open'}` });

    const r = { ok: true, kind: 'credit', kwh: t.kwh, tid: t.tid, steps, meter: this.snapshot() };
    return this._log(r);
  }

  _applyKct(t, steps) {
    if (t.half === 0) {
      this.pendingKct = { hi: t.keyHalf, krn: t.krn };
      steps.push({ step: 'action', ok: true,
        detail: 'Key-change token 1 of 2 held. Waiting for the second half.' });
      const r = { ok: true, kind: 'kct-half', half: 1, steps, meter: this.snapshot() };
      return this._log(r);
    }
    if (!this.pendingKct) {
      const r = { ok: false, stage: 'kct', steps,
        reason: 'Second key-change token received without the first. Enter KCT 1 first.' };
      steps.push({ step: 'action', ok: false, detail: r.reason });
      return this._log(r);
    }
    const oldKrn = this.krn;
    this.dk = { hi: this.pendingKct.hi >>> 0, lo: t.keyHalf >>> 0 };
    this.krn = t.krn;
    this.pendingKct = null;
    this.lastTid = 0;                 // new key era starts a fresh TID window
    this.usedTids.clear();
    steps.push({ step: 'action', ok: true,
      detail: `Decoder Key replaced. KRN ${oldKrn} → ${this.krn}. TID window reset.` });
    const r = { ok: true, kind: 'kct-done', steps, meter: this.snapshot() };
    return this._log(r);
  }

  /** Simulate consumption. */
  consume(kwh) {
    this.balanceKwh = Math.max(0, Math.round((this.balanceKwh - kwh) * 10) / 10);
    if (this.balanceKwh <= 0) this.relay = false;
    return this.balanceKwh;
  }
  trip(reason) { this.tamper = reason; this.relay = false; }
  snapshot() {
    return {
      balanceKwh: this.balanceKwh, relay: this.relay, lastTid: this.lastTid,
      krn: this.krn, status: this.status, tamper: this.tamper
    };
  }
}
