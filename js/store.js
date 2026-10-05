// A tiny shared store so Act III feels like one system rather than four demos:
// the token you generate in Lesson 9 is the token Lesson 10 hands to the meter.

import { CURRENT_BASE, TID_MAX } from './crypto/sts.js';

const KEY = 'cryptolab.store.v2';
const LEGACY_KEY = 'cryptolab.store.v1';

const DEFAULTS = {
  vendingPhrase: 'umeme-master-2024',
  drn: '04122334455',
  sgc: 600321,
  krn: 1,
  ti: 7,
  baseDate: CURRENT_BASE,
  lastIssuedTid: 0,       // vending side: highest TID issued so far
  lastToken: null,        // { digits, kwh, tid, cls, issuedAt }
  issued: []              // history of tokens vended, newest first
};

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
    // v1 pinned the 1993 base date, which ran out on 2024-11-24, and its tokens carry
    // TIDs that wrapped past the 24-bit ceiling. Keep the meter settings, drop the rest.
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}');
    const { baseDate, lastToken, issued, ...keep } = old;
    return { ...DEFAULTS, ...keep };
  } catch {
    return { ...DEFAULTS };
  }
}

let state = read();

export const Store = {
  get all() { return state; },
  get(k) { return state[k]; },
  set(k, v) { state[k] = v; Store.save(); },
  patch(obj) { Object.assign(state, obj); Store.save(); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} },
  reset() { state = { ...DEFAULTS }; Store.save(); },

  /**
   * Allocate a TID the way a vending system must: the current minute, but always above the
   * last TID issued. Without this, two purchases in the same minute share a TID and the
   * meter rejects the second, genuine token as a replay.
   */
  issueTid(tidNow) {
    const tid = Math.max(tidNow, (state.lastIssuedTid || 0) + 1);
    if (tid > TID_MAX) throw new RangeError(`TID space exhausted (${tid} > ${TID_MAX}).`);
    state.lastIssuedTid = tid;
    Store.save();
    return tid;
  },

  recordToken(tok) {
    state.lastToken = tok;
    state.issued = [tok, ...(state.issued || [])].slice(0, 12);
    Store.save();
  }
};
