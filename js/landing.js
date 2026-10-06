// Landing page: a working keypad (CIU) wired to the same meter model the lessons use.
// No three.js here, so the page stays light; sts.js does the real decrypt, CRC and TID checks.

import {
  Meter, deriveDecoderKey, vendingKeyFromPhrase, buildCreditToken, tidFromDate, normaliseDigits, CURRENT_BASE
} from './crypto/sts.js';
import { Store } from './store.js';

const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── The demo meter ─────────────────────────────────────────────────────── */
const TARIFF = 800;                     // UGX per kWh — illustrative, as in Lesson 12
const AMOUNTS = [10000, 5000, 20000];   // what successive purchases cost
const NEIGHBOUR_DRN = '04199887766';
const BURN = { kwh: 0.1, everyMs: 1500 };   // the lamp's (heavily accelerated) consumption
const LOW_KWH = 2;

const base = Store.get('baseDate') || CURRENT_BASE;
const keyParams = {
  vendingKey: vendingKeyFromPhrase(Store.get('vendingPhrase')),
  sgc: Store.get('sgc'), krn: Store.get('krn'), ti: Store.get('ti')
};
// The same meter as the lessons, unless a learner left a partial DRN in Lesson 9.
const drn = /^\d{11}$/.test(Store.get('drn')) ? Store.get('drn') : '04122334455';
const dk = deriveDecoderKey({ ...keyParams, drn });
const neighbourKey = deriveDecoderKey({ ...keyParams, drn: NEIGHBOUR_DRN });
const meter = new Meter({ drn, sgc: keyParams.sgc, dk, krn: keyParams.krn, baseDate: base, balanceKwh: 0 });

/* ── Formatting ─────────────────────────────────────────────────────────── */
const fmtDrn = (d) => `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
const groups = (d) => (d.match(/.{1,4}/g) || []).join(' ');
const kwh = (v) => `${v.toFixed(1)} kWh`;
const ugx = (v) => `UGX ${v.toLocaleString('en-US')}`;

/* ── Elements ───────────────────────────────────────────────────────────── */
const bench = $('#meter');
const lcd = { top: $('#lcdTop'), relay: $('#lcdRelay'), main: $('#lcdMain'), bal: $('#lcdBal'), count: $('#lcdCount') };
const leds = { ok: $('#ledOk'), low: $('#ledLow'), err: $('#ledErr') };
const gateItems = [...$('#gateList').children];
const outcomeEl = $('#outcome');

/* ── Tokens on the receipt ──────────────────────────────────────────────── */
const issued = [];      // every token printed this visit
let shown = null;
let purchases = 0;

function issue({ neighbour = false } = {}) {
  const amount = AMOUNTS[purchases++ % AMOUNTS.length];
  const kwhBought = Math.round((amount / TARIFF) * 10) / 10;
  const now = tidFromDate(new Date(), base);
  // Our meter's tokens draw from the site-wide TID counter, so two purchases in the same
  // minute (or one here and one in Lesson 9) never share a TID.
  const tid = neighbour ? now : Store.issueTid(now);
  const t = buildCreditToken({ tid, units: Math.round(kwhBought * 10), dk: neighbour ? neighbourKey : dk });
  shown = {
    digits: t.digits, groups: t.groups, kwh: kwhBought, amount, neighbour,
    drn: neighbour ? NEIGHBOUR_DRN : drn, at: new Date()
  };
  issued.push(shown);
  renderSlip();
}

function showOwn() {
  const own = issued.filter(t => !t.neighbour).at(-1);
  if (own) { shown = own; renderSlip(); } else issue();
}

function renderSlip() {
  const slip = $('#slip');
  slip.classList.toggle('is-neighbour', shown.neighbour);
  $('#slipDrn').textContent = fmtDrn(shown.drn);
  $('#slipTag').textContent = shown.neighbour ? 'your neighbour’s' : 'yours';
  $('#slipToken').textContent = shown.groups;
  $('#slipAmt').textContent = `${ugx(shown.amount)} · ${kwh(shown.kwh)}`;
  $('#slipTime').textContent = shown.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#neighbour').textContent = shown.neighbour ? 'Back to your own token' : 'Borrow your neighbour’s token';
  slip.classList.remove('printed');
  void slip.offsetWidth;                 // restart the print animation
  slip.classList.add('printed');
}

/* ── Keypad state ───────────────────────────────────────────────────────── */
let entry = '';
let busy = false;           // true while the meter runs its checks
let flash = null;           // { top?, main } shown briefly after a result
let flashTimer = 0;
let autoRun = null;         // the "Type it for me" run in progress, if any

function render() {
  const s = meter.snapshot();
  const low = s.relay && s.balanceKwh < LOW_KWH;

  lcd.relay.textContent = s.relay ? 'RELAY ON' : 'RELAY OPEN';
  lcd.top.textContent = flash?.top ?? (!s.relay ? 'NO CREDIT' : low ? 'LOW CREDIT' : 'CREDIT');

  const typing = !flash && entry.length > 0;
  const showsBalance = !flash && !typing && s.relay;
  lcd.main.textContent = flash ? flash.main
    : typing ? groups(entry)
    : showsBalance ? kwh(s.balanceKwh) : 'ENTER TOKEN';
  // The footer carries the balance only while the main line is busy with something else.
  lcd.bal.textContent = showsBalance ? '' : kwh(s.balanceKwh);
  lcd.main.classList.toggle('is-digits', typing);
  lcd.main.classList.toggle('is-open', typing && entry.length < 20);
  lcd.count.textContent = typing ? `${String(entry.length).padStart(2, '0')}/20` : '';

  leds.ok.classList.toggle('on', s.relay);
  leds.low.classList.toggle('on', low);
  bench.classList.toggle('lit', s.relay);
  $('#supply').textContent = s.relay ? `Lights on — ${kwh(s.balanceKwh)} left` : 'Lights off — no credit';
}

function showFlash(f, ms) {
  clearTimeout(flashTimer);
  flash = f;
  render();
  if (ms) flashTimer = setTimeout(() => { flash = null; render(); }, ms);
}

function pulseKey(k) {
  const b = document.querySelector(`.key[data-k="${k}"]`);
  if (!b) return;
  b.classList.add('is-down');
  setTimeout(() => b.classList.remove('is-down'), 110);
}

function press(k, { auto = false } = {}) {
  if (!auto) cancelAuto();
  pulseKey(k);
  if (busy) return;
  if (k === 'ok') { submit(); return; }
  clearTimeout(flashTimer);
  flash = null;
  if (k === 'del') entry = entry.slice(0, -1);
  else if (entry.length < 20) entry += k;
  render();
}

/* ── The meter's five checks ────────────────────────────────────────────── */
const GATES = ['format', 'decrypt', 'crc', 'anti-replay', 'action'];
const STEP_MS = reduceMotion ? 0 : 300;

async function runGates(result) {
  gateItems.forEach(li => { li.className = ''; li.removeAttribute('title'); });
  const byStep = Object.fromEntries(result.steps.map(s => [s.step, s]));
  // A failure with no gate of its own (tamper, unknown class) is shown on the next gate.
  const stray = result.steps.find(s => !s.ok && !GATES.includes(s.step));
  let stopped = false;
  for (let i = 0; i < GATES.length; i++) {
    const li = gateItems[i];
    if (stopped) { li.className = 'skipped'; continue; }
    li.className = 'run';
    await wait(STEP_MS);
    const st = byStep[GATES[i]] || stray;
    if (!st) { li.className = 'skipped'; stopped = true; continue; }
    li.className = st.ok ? 'pass' : 'fail';
    li.title = st.detail;
    if (!st.ok) stopped = true;
  }
}

const nearMiss = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d > 0 && d <= 3;
};

function classify(result, digits) {
  if (result.ok && result.kind === 'credit') return 'credit';
  if (result.stage === 'replay') return 'replay';
  if (result.stage === 'crc') {
    if (issued.some(t => t.neighbour && t.digits === digits)) return 'neighbour';
    if (issued.some(t => !t.neighbour && nearMiss(t.digits, digits))) return 'typo';
    return 'crc';
  }
  if (result.stage === 'format' && digits.length !== 20) return 'short';
  return 'other';
}

const OUTCOMES = {
  credit: (r) => ({ lcd: { top: 'ACCEPTED', main: `+${kwh(r.kwh)}` }, cls: 'ok',
    text: `Accepted: ${kwh(r.kwh)} added. The meter closed its relay, so the lights are on.` }),
  replay: () => ({ lcd: { main: 'TOKEN USED' }, cls: 'err',
    text: 'Refused at check 4. This token’s TID — the minute it was issued — is not newer than ' +
          'the last token this meter accepted. A token works exactly once.' }),
  typo: () => ({ lcd: { main: 'REJECTED' }, cls: 'err',
    text: 'Refused at check 3. One wrong digit changes the whole encrypted block, so it decrypts ' +
          'to noise and the checksum fails. The meter can’t tell a typo from a forgery, so it accepts neither.' }),
  neighbour: () => ({ lcd: { main: 'REJECTED' }, cls: 'err',
    text: `Refused at check 3. That token was made for meter ${fmtDrn(NEIGHBOUR_DRN)}. Every meter ` +
          'has its own key, so under this meter’s key it decrypts to noise.' }),
  crc: () => ({ lcd: { main: 'REJECTED' }, cls: 'err',
    text: 'Refused at check 3. Those digits don’t decrypt to a valid token for this meter.' }),
  short: (r, d) => ({ lcd: { main: 'INCOMPLETE' }, cls: 'err',
    text: `The meter needs all twenty digits — ${d.length} typed.` }),
  other: (r) => ({ lcd: { main: 'REJECTED' }, cls: 'err', text: r.reason })
};

function setOutcome(text, cls = '') {
  outcomeEl.textContent = text;
  outcomeEl.className = `outcome ${cls}`;
}

async function submit() {
  const digits = normaliseDigits(entry);
  if (!digits.length) { showFlash({ main: 'ENTER TOKEN' }, 1200); return; }
  busy = true;
  showFlash({ top: 'SENDING', main: 'CHECKING…' });
  const result = meter.feed(digits);
  await runGates(result);

  const kind = classify(result, digits);
  const o = OUTCOMES[kind](result, digits);
  entry = '';
  busy = false;
  setOutcome(o.text, o.cls);
  showFlash(o.lcd, 2600);
  if (o.cls === 'err') {
    leds.err.classList.add('on');
    setTimeout(() => leds.err.classList.remove('on'), 1600);
  }
  tick(kind);
}

/* ── Things to try ──────────────────────────────────────────────────────── */
const found = new Set();
function tick(kind) {
  const li = document.querySelector(`.challenges li[data-c="${kind}"]`);
  if (!li || found.has(kind)) return;
  found.add(kind);
  li.classList.add('done');
  if (found.size === 4) $('#tryDone').hidden = false;
}

/* ── "Type it for me" ───────────────────────────────────────────────────── */
function cancelAuto() { if (autoRun) autoRun.cancelled = true; autoRun = null; }

async function typeFor(digits) {
  if (busy) return;
  cancelAuto();
  const run = { cancelled: false };
  autoRun = run;
  entry = '';
  clearTimeout(flashTimer);
  flash = null;
  render();
  for (const ch of digits) {
    if (run.cancelled) return;
    press(ch, { auto: true });
    await wait(reduceMotion ? 0 : 70);
  }
  await wait(reduceMotion ? 0 : 250);
  if (run.cancelled) return;
  autoRun = null;
  press('ok', { auto: true });
}

/* ── Wiring ─────────────────────────────────────────────────────────────── */
$('#keys').addEventListener('click', (e) => {
  const key = e.target.closest('.key');
  if (key) press(key.dataset.k);
});

$('#typeIt').addEventListener('click', () => typeFor(shown.digits));
$('#buyAgain').addEventListener('click', () => issue());
$('#neighbour').addEventListener('click', () => (shown.neighbour ? showOwn() : issue({ neighbour: true })));

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
  else if (e.key === 'Backspace') { press('del'); e.preventDefault(); }
  else if (e.key === 'Escape') { cancelAuto(); entry = ''; render(); }
  // Enter on a focused button or link keeps doing what that control says.
  else if (e.key === 'Enter' && !t.closest?.('a, button')) { press('ok'); e.preventDefault(); }
});

// The lamp draws credit while it is on. Paused while the page is hidden or a token is being checked.
setInterval(() => {
  if (document.hidden || busy || !meter.relay) return;
  meter.consume(BURN.kwh);
  if (!meter.relay) setOutcome('Credit used up: the meter opened its relay and the lights went out. Buy another token.', 'info');
  render();
}, BURN.everyMs);

/* ── Go ─────────────────────────────────────────────────────────────────── */
$('#drnPlate').textContent = fmtDrn(drn);
issue();
render();
