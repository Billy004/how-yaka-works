import { PAL, THREE, makeLabel, makeBox, makeBitField, makeFlow, linePath, Timeline } from '../scene.js';
import { makeEngine, makeTokenDisplay, makeKeyIcon } from '../viz.js';
import {
  deriveDecoderKey, vendingKeyFromPhrase, buildCreditToken, decodeToken,
  tidFromDate, dateFromTid, crc16, SUB, TID_MAX
} from '../crypto/sts.js';
import { blockHex, blockBits, toBig } from '../crypto/cipher.js';
import { Store } from '../store.js';

/* Field layout of the 64-bit data block, most significant bit first. */
const FIELDS = [
  { name: 'SUBCLASS', bits: 4,  color: 0xa58bd8, note: 'what kind of credit' },
  { name: 'TID',      bits: 24, color: 0x5ea1e6, note: 'minutes since the base date' },
  { name: 'AMOUNT',   bits: 20, color: 0xf0a04b, note: 'units of 0.1 kWh' },
  { name: 'CRC',      bits: 16, color: 0x62c08a, note: 'error check' }
];

export default {
  id: 'l09', act: 3, num: 9,
  title: 'Building a token',
  subtitle: 'From "50,000 shillings of power" to twenty digits, one field at a time.',
  stageOpts: { camera: [0, 0.2, 13], target: [0, -0.1, 0], gridY: -5.0, maxDistance: 30 },

  learn: `
    <h3>What happens when you pay</h3>
    <p>You send mobile money and quote your meter number. Within a couple of seconds you get twenty
    digits back. Here is everything that happened in between.</p>

    <h3>1 · Assemble the payload</h3>
    <p>The vending system builds a 64-bit block out of four fields:</p>
    <table class="kv">
      <tr><td>Sub-class <span class="hint">4 bits</span></td><td>Ordinary credit, emergency credit,
      or a maintenance instruction.</td></tr>
      <tr><td>TID <span class="hint">24 bits</span></td><td><strong>Token Identifier</strong> — the
      number of minutes elapsed since a fixed base date — 1 January 2014 since the 2024 rollover
      you will meet in Lesson 11. It is what makes this token unique, and it is the heart of
      Lesson 10.</td></tr>
      <tr><td>Amount <span class="hint">20 bits</span></td><td>The credit purchased, in units of
      0.1 kWh.</td></tr>
      <tr><td>CRC <span class="hint">16 bits</span></td><td>A checksum over the other three fields.</td></tr>
    </table>

    <h3>2 · Find the key</h3>
    <p>The system derives this meter's Decoder Key from the vending key and the meter's DRN —
    exactly the derivation you drove in Lesson 7. No per-meter key is ever stored.</p>

    <h3>3 · Encrypt</h3>
    <p>The whole 64-bit block is encrypted under that Decoder Key. Every bit of the output depends
    on every bit of the input and on the key — the avalanche from Lesson 3, doing real work.</p>

    <h3>4 · Render as digits</h3>
    <p>The 2-bit class stays in the clear and is prepended, giving 66 bits. Written as a decimal
    number that is at most twenty digits, printed in five groups of four.</p>
    <p><code>2⁶⁶ = 73,786,976,294,838,206,464</code> — twenty digits exactly. The format was chosen
    to be the largest number a person can reasonably be asked to type.</p>

    <div class="callout cy"><p>Press <strong>Vend</strong> twice without changing anything. The
    token is completely different both times — because the TID moved. Even inside the same minute
    the vending system never reuses a TID, so two identical purchases never produce the same
    token.</p></div>

    <div class="callout"><p>The 66-bit format, the clear 2-bit class, the 24-bit TID and the
    16-bit CRC follow IEC 62055-41. Two simplifications: the real credit token also carries a
    4-bit random field, and packs the amount into 16 bits where we use a plain 20-bit count. The
    cipher is ours, not the licensed Standard Transfer Algorithm — the structure is real, the
    algorithm is a stand-in.</p></div>
  `,

  build({ stage, ui }) {
    const tl = new Timeline(stage);

    // ── Field bar ──────────────────────────────────────────────────────
    const BAR_W = 9.2;
    const fieldGroup = new THREE.Group();
    fieldGroup.position.set(0, 3.5, 0);
    let x = -BAR_W / 2;
    const fieldMeshes = [];
    FIELDS.forEach((f) => {
      const w = (f.bits / 64) * BAR_W;
      const box = makeBox(w - 0.06, 0.5, 0.2, f.color, {
        roughness: 0.4, emissive: f.color, emissiveIntensity: 0.18, wire: false
      });
      box.position.x = x + w / 2;
      const nameL = makeLabel(`${f.name}`, { height: 0.17, mono: true, color: '#ebe9e4', weight: 700 });
      nameL.position.set(x + w / 2, 0.46, 0);
      const bitsL = makeLabel(`${f.bits}b`, { height: 0.14, mono: true, color: '#a19e96' });
      bitsL.position.set(x + w / 2, -0.44, 0);
      const valL = makeLabel('—', { height: 0.16, mono: true, color: '#06121a', weight: 700 });
      valL.position.set(x + w / 2, 0, 0.15);
      fieldGroup.add(box, nameL, bitsL, valL);
      fieldMeshes.push({ box, valL, f });
      x += w;
    });
    stage.add(fieldGroup);
    const barTitle = makeLabel('64-BIT DATA BLOCK — assembled in the clear',
      { height: 0.2, color: '#b3b0a8' });
    barTitle.position.set(0, 4.35, 0);
    stage.add(barTitle);

    // ── Plain bits ─────────────────────────────────────────────────────
    const plainBits = makeBitField(64, 32, { gap: 0.26, size: 0.17 });
    plainBits.group.position.set(0, 2.15, 0);
    stage.add(plainBits.group);

    // ── Engine ─────────────────────────────────────────────────────────
    const engine = makeEngine('ENCRYPT  ·  DECODER KEY', PAL.cyan, [3.4, 1.5, 1.4]);
    engine.group.position.set(0, 0.45, 0);
    stage.add(engine.group);

    const dk = makeKeyIcon(PAL.green);
    dk.scale.setScalar(0.62);
    dk.position.set(-3.5, 0.45, 0.3);
    stage.add(dk);
    const dkFlow = makeFlow(linePath([-3.1, 0.45, 0.3], [-1.9, 0.45, 0.1]), 6, PAL.green, 0.05);
    dkFlow.speed = 0.5;
    stage.add(dkFlow.group);

    const downFlow = makeFlow(linePath([0, 1.85, 0], [0, 1.25, 0]), 6, PAL.amber, 0.06);
    const outFlow  = makeFlow(linePath([0, -0.35, 0], [0, -1.0, 0]), 6, PAL.violet, 0.06);
    downFlow.speed = 0.55; outFlow.speed = 0.55;
    stage.add(downFlow.group, outFlow.group);

    // ── Cipher bits ────────────────────────────────────────────────────
    const cipherBits = makeBitField(64, 32, { gap: 0.26, size: 0.17 });
    cipherBits.group.position.set(0, -1.5, 0);
    stage.add(cipherBits.group);
    const cipherLabel = makeLabel('ENCRYPTED — nothing about the amount is visible',
      { height: 0.18, color: '#cdb8e6' });
    cipherLabel.position.set(0, -2.15, 0);
    stage.add(cipherLabel);

    // ── Token digits ───────────────────────────────────────────────────
    const tok = makeTokenDisplay({ tile: 0.4 });
    tok.group.position.set(0, -3.4, 0);
    stage.add(tok.group);
    const tokLabel = makeLabel('20-DIGIT TOKEN — what the customer receives',
      { height: 0.2, color: '#a9cdf2' });
    tokLabel.position.set(0, -4.15, 0);
    stage.add(tokLabel);
    const classTag = makeLabel('', { height: 0.16, mono: true, color: '#f0a04b' });
    classTag.position.set(0, -2.85, 0);
    stage.add(classTag);

    // ── State ──────────────────────────────────────────────────────────
    const S = {
      phrase: Store.get('vendingPhrase'),
      drn: Store.get('drn'),
      sgc: Store.get('sgc'),
      krn: Store.get('krn'),
      ti: Store.get('ti'),
      kwh: 50,
      sub: SUB.CREDIT,
      tid: tidFromDate(new Date(), Store.get('baseDate')),
      base: Store.get('baseDate')
    };

    const currentKey = () => deriveDecoderKey({
      vendingKey: vendingKeyFromPhrase(S.phrase),
      drn: S.drn || '0', sgc: S.sgc, krn: S.krn, ti: S.ti
    });

    const render = (animate = false) => {
      const key = currentKey();
      const units = Math.round(S.kwh * 10);
      const t = buildCreditToken({ tid: S.tid, units, dk: key, sub: S.sub });
      const plain = blockBits(t.plainBlock);
      const cipher = blockBits(t.cipherBlock);
      const back = decodeToken(t.digits, key);

      // field values
      const vals = [String(S.sub), String(S.tid), `${units}`, `0x${back.crcWant.toString(16).padStart(4, '0')}`];
      fieldMeshes.forEach((fm, i) => fm.valL.setText(vals[i]));

      plainBits.set(plain);
      cipherBits.set(cipher);
      tok.set(t.digits);
      classTag.setText(`class ${t.cls} (in the clear) + 64 encrypted bits = 66 bits`);

      const when = dateFromTid(S.tid, S.base);
      rToken.set(t.groups, '');
      rTid.set(`${S.tid}\n${when.toISOString().replace('T', ' ').slice(0, 16)} UTC`);
      rKey.set(blockHex(key));
      rBlock.set(`plain  ${blockHex(t.plainBlock)}\ncipher ${blockHex(t.cipherBlock)}`);
      rCheck.set(back.ok
        ? `decodes back to ${back.kwh.toFixed(1)} kWh, TID ${back.tid} ✓`
        : `SELF-CHECK FAILED — ${back.reason}`, back.ok ? 'ok' : 'err');

      ui.data({
        'meter DRN': S.drn,
        'decoder key': blockHex(key),
        '—': '',
        'sub-class (4b)': `${S.sub}`,
        'TID (24b)': `${S.tid}  = ${when.toISOString().replace('T', ' ').slice(0, 16)} UTC`,
        'amount (20b)': `${units} units = ${S.kwh.toFixed(1)} kWh`,
        'CRC-16 (16b)': `0x${back.crcWant.toString(16).padStart(4, '0')}`,
        'plain block': blockHex(t.plainBlock),
        'plain bits': plain.match(/.{8}/g).join(' '),
        '––': '',
        'encrypted block': blockHex(t.cipherBlock),
        'cipher bits': cipher.match(/.{8}/g).join(' '),
        'class (2b, clear)': String(t.cls),
        '66-bit value': ((BigInt(t.cls) << 64n) | toBig(t.cipherBlock)).toString(),
        'TOKEN': t.groups,
        '–––': '',
        'self-check': back.ok ? 'decrypts and CRC-validates against the same key' : back.reason
      });

      if (animate) {
        engine.setSpin(3.5);
        tl.run(0.9, null, () => engine.setSpin(1));
      }
      return t;
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('The purchase');
    ui.slider({ label: 'Credit bought', min: 1, max: 500, value: S.kwh, step: 1,
      format: (v) => `${v} kWh`, onInput: (v) => { S.kwh = v; render(); } });
    ui.note('The vendor converts shillings to kWh at your tariff before building the token — ' +
            'the meter only ever sees energy, never money.');
    ui.chips({
      label: 'Sub-class',
      options: [
        { label: 'Credit', value: String(SUB.CREDIT) },
        { label: 'Emergency', value: String(SUB.CREDIT_EMERGENCY) },
        { label: 'Clear tamper', value: String(SUB.CLEAR_TAMPER) }
      ],
      value: String(SUB.CREDIT),
      onChange: (v) => { S.sub = Number(v); render(); }
    });

    ui.section('Meter');
    ui.text({ label: 'DRN', value: S.drn, maxlength: 11,
      onInput: (v) => { S.drn = v.replace(/\D/g, ''); Store.set('drn', S.drn); render(); } });
    const rKey = ui.readout('Derived decoder key', '—');

    ui.section('Token identifier');
    const tidCtl = ui.slider({ label: 'TID (minutes since base date)', min: 0, max: TID_MAX,
      value: S.tid, step: 1, format: (v) => String(v),
      onInput: (v) => { S.tid = v; render(); } });
    const rTid = ui.readout('TID → wall-clock time', '—');
    ui.button('Set TID to now', () => tidCtl.set(tidFromDate(new Date(), S.base)), { variant: 'ghost' });

    ui.section('Generate');
    ui.button('⚡  Vend this token', () => {
      S.tid = Store.issueTid(tidFromDate(new Date(), S.base));
      tidCtl.set(S.tid);
      const t = render(true);
      Store.recordToken({
        digits: t.digits, groups: t.groups, kwh: S.kwh, tid: S.tid,
        cls: t.cls, sub: S.sub, drn: S.drn, issuedAt: new Date().toISOString()
      });
      log.add(`Vended ${S.kwh} kWh to ${S.drn} — TID ${S.tid}`, 'ok');
      log.add(t.groups, 'cy');
      rSaved.set('Saved. Lesson 10 will hand this token to the meter.', 'ok');
    });
    const rToken = ui.readout('Token', '—', { big: true });
    const rCheck = ui.readout('Self-check', '—');
    const rBlock = ui.readout('Blocks', '—');
    const rSaved = ui.readout('Passed to the next lesson', 'Press Vend to carry a token forward.');

    ui.section('Vending log');
    const log = ui.log();

    stage.onTick((dt, t) => {
      engine.tick(dt, t);
      plainBits.tick(dt); cipherBits.tick(dt);
      downFlow.tick(dt); outFlow.tick(dt); dkFlow.tick(dt);
      dk.userData.tick(dt, t);
      fieldGroup.rotation.x = Math.sin(t * 0.4) * 0.03;
      tok.group.position.y = -3.4 + Math.sin(t * 1.3) * 0.04;
    });

    render();
    const prev = Store.get('lastToken');
    if (prev) log.add(`Last vended: ${prev.groups} (${prev.kwh} kWh)`, '');
  }
};
