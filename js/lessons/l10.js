import { PAL, THREE, makeLabel, makeBox, makeFlow, linePath, Timeline, easeInOut, makeGlow }
  from '../scene.js';
import { makeCIU, makeMCU, makeTokenDisplay, makeHouse, makeGround, makeChecklist } from '../viz.js';
import {
  Meter, deriveDecoderKey, vendingKeyFromPhrase, buildCreditToken,
  tidFromDate, dateFromTid, normaliseDigits
} from '../crypto/sts.js';
import { blockHex } from '../crypto/cipher.js';
import { Store } from '../store.js';

const GATES = [
  { key: 'format',      label: '1 · TWENTY DIGITS?',  hint: 'length and characters' },
  { key: 'decrypt',     label: '2 · DECRYPT',         hint: 'with the stored Decoder Key' },
  { key: 'crc',         label: '3 · CRC MATCHES?',    hint: 'was this made for me?' },
  { key: 'anti-replay', label: '4 · TID IS NEWER?',   hint: 'have I seen this before?' },
  { key: 'action',      label: '5 · CREDIT & CLOSE',  hint: 'add kWh, close the relay' }
];

export default {
  id: 'l10', act: 3, num: 10,
  title: 'The meter decides',
  subtitle: 'Five checks, no network — and the one that stops you reusing yesterday\'s token.',
  stageOpts: { camera: [0, 0.6, 15], target: [0, 0.2, 0], gridY: -4.2, maxDistance: 32 },
  hint: 'Click the keypad to type a token, then ↵ · drag to orbit',

  learn: `
    <h3>Twenty digits arrive. Now what?</h3>
    <p>The CIU sends the digits to the MCU over the power line. From here the meter is entirely on
    its own — no lookup, no server, no second opinion. It runs five checks in order and stops at
    the first failure.</p>

    <h3>The five gates</h3>
    <ol>
      <li><strong>Format.</strong> Exactly twenty digits, and the 66-bit value must be in range.</li>
      <li><strong>Decrypt.</strong> Split off the 2-bit class, decrypt the 64-bit block with the
      Decoder Key held in EEPROM. This always "works" — even garbage decrypts to something.</li>
      <li><strong>CRC.</strong> Recompute the checksum over the recovered fields and compare. This
      is the real test: a token built for a different meter decrypts under <em>this</em> meter's key
      into noise, and noise almost never has a valid CRC. Odds of passing by luck:
      <strong>1 in 65,536</strong>.</li>
      <li><strong>TID.</strong> Anti-replay — see below.</li>
      <li><strong>Act.</strong> Add the credit, close the relay.</li>
    </ol>

    <h3>Why the TID is the clever bit</h3>
    <p>Encryption alone does not stop a <em>replay</em>. A valid token is valid forever unless
    something makes it stale. So every token carries a Token Identifier: the minute it was issued,
    counted from a fixed base date.</p>
    <p>The meter stores the TID of the last token it accepted. A new token is only accepted if its
    TID is <strong>newer</strong>. Type yesterday's token again and its TID is older than the stored
    one — rejected. The token is a one-shot, and the meter needs no clock synchronisation,
    no counter from the utility, and no connection to enforce it.</p>

    <div class="callout cy"><p>Press <strong>Enter token</strong>, watch it credit. Then press
    <strong>Enter it again</strong>. Same twenty digits, same key, same valid CRC — and gate 4
    throws it out. That is the whole anti-fraud mechanism of prepayment metering, in one button.</p></div>

    <h3>Things that legitimately go wrong</h3>
    <table class="kv">
      <tr><td>Wrong meter</td><td>Token bought against someone else's DRN. Fails at the CRC gate.</td></tr>
      <tr><td>Mistyped digit</td><td>Decrypts to noise. Fails at the CRC gate — which is exactly
      what the CRC is for.</td></tr>
      <tr><td>Out-of-order tokens</td><td>Buy twice quickly, enter the second one first, and the
      first is now older than the stored TID. Real meters keep a short list of recently accepted
      TIDs to soften this.</td></tr>
    </table>
  `,

  build({ stage, ui }) {
    const tl = new Timeline(stage);

    // ── Meter under test ───────────────────────────────────────────────
    const key = deriveDecoderKey({
      vendingKey: vendingKeyFromPhrase(Store.get('vendingPhrase')),
      drn: Store.get('drn'), sgc: Store.get('sgc'), krn: Store.get('krn'), ti: Store.get('ti')
    });
    const meter = new Meter({
      drn: Store.get('drn'), sgc: Store.get('sgc'), dk: key,
      krn: Store.get('krn'), baseDate: Store.get('baseDate'), balanceKwh: 3.2
    });

    // ── Scene ──────────────────────────────────────────────────────────
    const drn = /^\d{11}$/.test(Store.get('drn')) ? Store.get('drn') : '04122334455';
    const CIU_X = -5.4;
    const ciu = makeCIU({ drn });
    ciu.group.position.set(CIU_X, 0.55, 0.3);
    ciu.group.scale.setScalar(1.2);
    ciu.caption?.scale.multiplyScalar(1.4);
    stage.add(ciu.group);

    const mcu = makeMCU({ drn });
    mcu.group.position.set(5.3, 0.75, 0);
    mcu.group.scale.setScalar(1.0);
    mcu.caption?.scale.multiplyScalar(1.4);
    if (mcu.sub) mcu.sub.visible = false;
    stage.add(mcu.group);

    // the house the keypad belongs to, on its own small plot; its lamp shows the relay
    const plot = makeGround({ width: 3.4, depth: 2.9, thickness: 0.3, radius: 0.35, seed: 5,
      zones: [{ kind: 'murram', rect: [-1.25, -1.15, 1.35, 1.2], r: 0.4 }, { kind: 'ao', rect: [-0.95, -0.85, 0.95, 0.85], r: 0.05 }] });
    plot.group.position.set(CIU_X, -3.0, -1.0);
    const house = makeHouse();
    house.group.scale.setScalar(0.45);
    plot.group.add(house.group);
    stage.add(plot.group);

    const tok = makeTokenDisplay({ tile: 0.3, label: 'TOKEN AS TYPED' });
    tok.group.position.set(0, 4.55, 0);
    stage.add(tok.group);

    // the five checks, as the meter's own instrument panel; rows sit at y = 2.35 − 1.15 i
    const CHECKS = ['Twenty digits?', 'Decrypt with its key', 'Checksum matches?', 'TID is newer?', 'Credit, close relay'];
    const panel = makeChecklist({
      title: 'Inside the MCU: five checks',
      rows: GATES.map((g, i) => ({ label: `${i + 1} · ${CHECKS[i]}`, hint: g.hint }))
    });
    panel.group.position.y = 2.35 - panel.rowY(0);
    stage.add(panel.group);
    const gateY = (i) => panel.group.position.y + panel.rowY(i);

    const plcFlow = makeFlow(linePath([CIU_X + 0.9, 0.85, 0.45], [-2.15, 2.35, 0.2]), 10, PAL.violet, 0.055);
    plcFlow.speed = 0.5; plcFlow.active = false;
    stage.add(plcFlow.group);
    const outFlow = makeFlow(linePath([2.15, -2.25, 0.2], [4.45, 0.2, 0.4]), 8, PAL.green, 0.055);
    outFlow.speed = 0.5; outFlow.active = false;
    stage.add(outFlow.group);

    // the token descending through the gates
    const pip = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0),
      new THREE.MeshStandardMaterial({ color: PAL.amber, emissive: PAL.amber, emissiveIntensity: 1.2 }));
    pip.visible = false;
    const pipGlow = makeGlow(PAL.amber, 1.2);
    pip.add(pipGlow);
    stage.add(pip);

    const verdict = makeLabel('', { height: 0.3, color: '#ffffff', weight: 700 });
    verdict.position.set(0, -3.75, 0);
    verdict.material.color.set('#86837b');
    stage.add(verdict);

    // ── Gate rendering ─────────────────────────────────────────────────
    const resetGates = () => {
      panel.reset();
      verdict.setText('');
      pip.visible = false;
    };

    const markGate = (i, ok) => {
      panel.set(i, ok ? 'pass' : 'fail');
      if (!ok) for (let j = i + 1; j < GATES.length; j++) panel.set(j, 'skip');
    };

    const syncMeter = () => {
      const s = meter.snapshot();
      mcu.setScreen(`${s.balanceKwh.toFixed(1)} kWh`);
      mcu.setLamp('relay', s.relay, 1.8);
      mcu.setLamp('tamper', !!s.tamper, 2.2);
      house.setPower(s.relay, Math.min(1, 0.4 + s.balanceKwh / 40));
      ciu.setScreen(s.relay ? `${s.balanceKwh.toFixed(1)} kWh` : 'NO CREDIT');
      rBal.set(`${s.balanceKwh.toFixed(1)} kWh`, s.relay ? 'ok' : 'err');
      rRelay.set(s.relay ? 'CLOSED — power is on' : 'OPEN — supply disconnected', s.relay ? 'ok' : 'err');
      rTid.set(s.lastTid === 0
        ? 'none yet'
        : `${s.lastTid}\n${dateFromTid(s.lastTid, meter.baseDate).toISOString().replace('T', ' ').slice(0, 16)} UTC`);
    };

    // ── Feeding a token ────────────────────────────────────────────────
    let busy = false;
    const feed = (digits, { typed = false } = {}) => {
      if (busy) return;
      const d = normaliseDigits(digits);
      resetGates();
      tok.set(d.padEnd(20, '0').slice(0, 20));
      busy = true;

      // type it on the keypad, unless the learner just did
      if (typed) ciu.setScreen('CHECKING');
      else {
        ciu.setScreen('ENTER…');
        [...d.slice(0, 20)].forEach((ch, i) => setTimeout(() => ciu.press(ch), i * 45));
      }
      plcFlow.active = true;

      const tidBefore = meter.lastTid;
      const result = meter.feed(d);
      const stepByKey = Object.fromEntries(result.steps.map(s => [s.step, s]));

      setTimeout(() => {
        pip.visible = true;
        let stopped = false;
        let idx = 0;

        const advance = () => {
          if (idx >= GATES.length || stopped) { finish(); return; }
          const g = GATES[idx];
          const st = stepByKey[g.key];
          const yFrom = idx ? gateY(idx - 1) : gateY(0) + 0.9, yTo = gateY(idx);
          panel.set(idx, 'run');
          tl.run(0.35, (u) => {
            pip.position.set(-2.75, yFrom - easeInOut(u) * (yFrom - yTo), 0.3);
          }, () => {
            if (!st) { stopped = true; finish(); return; }
            markGate(idx, st.ok);
            log.add(`${g.label.replace(/^\d · /, '')}: ${st.detail}`, st.ok ? 'ok' : 'err');
            if (!st.ok) { stopped = true; finish(); return; }
            idx++;
            advance();
          });
        };
        advance();

        const finish = () => {
          plcFlow.active = false;
          pip.visible = false;
          if (result.ok) {
            outFlow.active = true;
            setTimeout(() => { outFlow.active = false; }, 2200);
            verdict.setText(result.kind === 'credit'
              ? `✓ ACCEPTED — ${result.kwh.toFixed(1)} kWh credited`
              : '✓ ACCEPTED');
            verdict.material.color.set('#62c08a');
            rResult.set(result.kind === 'credit'
              ? `Accepted. +${result.kwh.toFixed(1)} kWh` : 'Accepted.', 'ok');
            ciu.setScreen('ACCEPTED');
          } else {
            verdict.setText('✗ REJECTED');
            verdict.material.color.set('#ec5f59');
            rResult.set(result.reason, 'err');
            ciu.setScreen('REJECT');
            // shake
            tl.run(0.4, (u) => {
              ciu.group.position.x = CIU_X + Math.sin(u * 40) * 0.09 * (1 - u);
            });
          }
          syncMeter();
          ui.data({
            'token entered': d.replace(/(.{4})/g, '$1 ').trim(),
            'meter DRN': meter.drn,
            'meter decoder key': blockHex(meter.dk),
            'stored TID before': String(tidBefore),
            '—': '',
            ...Object.fromEntries(result.steps.map(s => [`gate: ${s.step}`, `${s.ok ? 'PASS' : 'FAIL'} — ${s.detail}`])),
            '––': '',
            'outcome': result.ok ? 'ACCEPTED' : `REJECTED at "${result.stage}"`,
            'balance now': `${meter.balanceKwh.toFixed(1)} kWh`,
            'relay': meter.relay ? 'closed' : 'open',
            'stored TID now': String(meter.lastTid)
          });
          busy = false;
        };
      }, 950);
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('Token to enter');
    const tokCtl = ui.text({
      label: '20 digits', placeholder: '0000 0000 0000 0000 0000',
      value: Store.get('lastToken')?.digits || '',
      onInput: (v) => { tok.set(normaliseDigits(v).padEnd(20, '0').slice(0, 20)); }
    });
    ui.button('⌨  Enter token', () => feed(tokCtl.get()));
    ui.note('Or type it on the keypad in the 3D view: click the keys, then ↵.');

    // the keypad in the scene types into the same field
    ciu.enableInput(stage, {
      onKey: (glyph, entry) => { tokCtl.setQuiet(entry); tok.set(entry.padEnd(20, '0').slice(0, 20)); },
      onEnter: (entry) => feed(entry, { typed: true })
    });

    ui.buttonRow([
      { label: 'Use last vended', variant: 'ghost', onClick: () => {
          const lt = Store.get('lastToken');
          if (!lt) { log.add('Nothing vended yet — go back to Lesson 9.', 'am'); return; }
          tokCtl.set(lt.digits);
          log.add(`Loaded token from Lesson 9 (${lt.kwh} kWh).`, 'cy');
        } },
      { label: 'Vend a fresh one', onClick: () => {
          const t = buildCreditToken({
            tid: Store.issueTid(tidFromDate(new Date(), meter.baseDate)), units: 250, dk: meter.dk
          });
          tokCtl.set(t.digits);
          log.add('Vending server issued a new 25.0 kWh token.', 'cy');
        } }
    ]);

    ui.section('Replay');
    ui.button('↻  Enter the same token again', () => feed(tokCtl.get()), { variant: 'warn' });
    ui.note('Nothing about the token has changed — and it will be refused. That is the TID doing ' +
            'its job.');

    ui.section('Things that go wrong');
    ui.button('Token for a different meter', () => {
      const otherKey = deriveDecoderKey({
        vendingKey: vendingKeyFromPhrase(Store.get('vendingPhrase')),
        drn: '04199887766', sgc: Store.get('sgc'), krn: Store.get('krn'), ti: Store.get('ti')
      });
      const t = buildCreditToken({ tid: tidFromDate(new Date(), meter.baseDate), units: 300, dk: otherKey });
      tokCtl.set(t.digits);
      log.add('Bought 30 kWh against DRN 04199887766 by mistake.', 'am');
      feed(t.digits);
    }, { variant: 'danger' });

    ui.button('Mistype one digit', () => {
      const d = normaliseDigits(tokCtl.get()) || '0'.repeat(20);
      const i = 7;
      const bad = d.slice(0, i) + String((Number(d[i]) + 1) % 10) + d.slice(i + 1);
      tokCtl.set(bad);
      log.add(`Digit ${i + 1} typed wrong.`, 'am');
      feed(bad);
    }, { variant: 'danger' });

    ui.button('Invent a token at random', () => {
      let d = '';
      for (let i = 0; i < 20; i++) d += Math.floor(Math.random() * 10);
      if (BigInt(d) >= (1n << 66n)) d = '1' + d.slice(1);
      tokCtl.set(d);
      log.add('Guessing twenty random digits…', 'am');
      feed(d);
    }, { variant: 'danger' });
    ui.note('Try that a few times. A random guess needs the CRC to match by chance — about ' +
            '<strong>1 in 65,536</strong>, and even then the TID must also be newer.');

    ui.section('Meter state');
    const rBal    = ui.readout('Balance', '—');
    const rRelay  = ui.readout('Relay', '—');
    const rTid    = ui.readout('Last accepted TID', '—');
    const rResult = ui.readout('Last outcome', '—');
    ui.buttonRow([
      { label: 'Consume 3 kWh', variant: 'ghost', onClick: () => {
          meter.consume(3); syncMeter();
          log.add('Household used 3 kWh.', '');
          if (!meter.relay) log.add('Balance hit zero — relay opened. Lights out.', 'err');
        } },
      { label: 'Reset meter', variant: 'ghost', onClick: () => {
          meter.balanceKwh = 0; meter.lastTid = 0; meter.usedTids.clear();
          meter.relay = false; meter.tamper = null;
          resetGates(); syncMeter(); log.add('Meter reset to factory state.', '');
        } }
    ]);

    ui.section('Log');
    const log = ui.log();

    stage.onTick((dt, t) => {
      ciu.tick(dt, t); mcu.tick(dt, t); panel.tick(dt);
      plcFlow.tick(dt); outFlow.tick(dt);
      if (pip.visible) pip.rotation.set(t * 2, t * 1.6, 0);
      tok.group.position.y = 4.55 + Math.sin(t * 1.2) * 0.03;
    });

    syncMeter();
    resetGates();
    tok.set(normaliseDigits(tokCtl.get()).padEnd(20, '0').slice(0, 20));
    log.add(`Meter ${meter.drn} online. Balance ${meter.balanceKwh.toFixed(1)} kWh.`, '');
    if (!Store.get('lastToken')) log.add('Tip: vend a token in Lesson 9 and it appears here.', 'am');
  }
};
