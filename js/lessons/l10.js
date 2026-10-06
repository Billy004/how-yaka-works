import { PAL, THREE, makeLabel, makeBox, makeFlow, linePath, Timeline, easeInOut, makeGlow }
  from '../scene.js';
import { makeCIU, makeMCU, makeTokenDisplay, makeHouse } from '../viz.js';
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
    const ciu = makeCIU();
    ciu.group.position.set(-5.4, 0.2, 0);
    ciu.group.scale.setScalar(0.92);
    stage.add(ciu.group);

    const mcu = makeMCU();
    mcu.group.position.set(5.4, 0.4, 0);
    mcu.group.scale.setScalar(0.92);
    stage.add(mcu.group);

    const house = makeHouse();
    house.group.position.set(-5.4, -2.6, -1.2);
    house.group.scale.setScalar(0.85);
    stage.add(house.group);

    const tok = makeTokenDisplay({ tile: 0.3 });
    tok.group.position.set(0, 3.5, 0);
    stage.add(tok.group);
    const tokLabel = makeLabel('TOKEN AS TYPED', { height: 0.17, color: '#b3b0a8' });
    tokLabel.position.set(0, 3.95, 0);
    stage.add(tokLabel);

    // gate column
    const gateMeshes = [];
    GATES.forEach((g, i) => {
      const y = 2.35 - i * 1.15;
      const grp = new THREE.Group();
      grp.position.set(0, y, 0);
      const box = makeBox(4.3, 0.82, 0.3, 0x1e2024, { wireColor: PAL.steel, wireOpacity: 0.5 });
      const lbl = makeLabel(g.label, { height: 0.19, mono: true, color: '#ffffff', weight: 700 });
      lbl.position.set(-0.55, 0.13, 0.2);
      lbl.material.color.set('#7f7c74');
      const hint = makeLabel(g.hint, { height: 0.14, mono: true, color: '#ffffff' });
      hint.position.set(-0.55, -0.15, 0.2);
      hint.material.color.set('#6b6861');
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12),
        new THREE.MeshStandardMaterial({ color: PAL.steel, emissive: 0x000000 }));
      lamp.position.set(1.85, 0, 0.22);
      const glow = makeGlow(PAL.green, 0.8);
      glow.position.copy(lamp.position);
      glow.material.opacity = 0;
      grp.add(box, lbl, hint, lamp, glow);
      stage.add(grp);
      gateMeshes.push({ grp, box, lbl, hint, lamp, glow });
    });

    const plcFlow = makeFlow(linePath([-4.6, 0.2, 0.4], [-2.3, 2.35, 0.2]), 10, PAL.violet, 0.055);
    plcFlow.speed = 0.5; plcFlow.active = false;
    stage.add(plcFlow.group);
    const outFlow = makeFlow(linePath([2.3, -2.25, 0.2], [4.6, 0.4, 0.4]), 8, PAL.green, 0.055);
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
    verdict.position.set(0, -3.4, 0);
    verdict.material.color.set('#86837b');
    stage.add(verdict);

    // ── Gate rendering ─────────────────────────────────────────────────
    const resetGates = () => {
      gateMeshes.forEach(g => {
        g.box.material.color.setHex(0x1e2024);
        g.box.children[0].material.color.setHex(PAL.steel);
        g.lamp.material.color.setHex(PAL.steel);
        g.lamp.material.emissive.setHex(0x000000);
        g.glow.material.opacity = 0;
        g.lbl.material.color.set('#7f7c74');
      });
      verdict.setText('');
      pip.visible = false;
    };

    const markGate = (i, ok) => {
      const g = gateMeshes[i];
      const c = ok ? PAL.green : PAL.red;
      g.box.material.color.setHex(ok ? 0x0e2419 : 0x2a1119);
      g.box.children[0].material.color.setHex(c);
      g.lamp.material.color.setHex(c);
      g.lamp.material.emissive.setHex(c);
      g.lamp.material.emissiveIntensity = 1.8;
      g.glow.material.color.setHex(c);
      g.glow.material.opacity = 0.9;
      g.lbl.material.color.set(ok ? '#62c08a' : '#ec5f59');
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
    const feed = (digits) => {
      if (busy) return;
      const d = normaliseDigits(digits);
      resetGates();
      tok.set(d.padEnd(20, '0').slice(0, 20));
      busy = true;

      // type it on the keypad
      [...d.slice(0, 20)].forEach((ch, i) => setTimeout(() => ciu.press(ch), i * 45));
      ciu.setScreen('ENTER…');
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
          const yTo = gateMeshes[idx].grp.position.y;
          tl.run(0.35, (u) => {
            pip.position.set(0, 3.1 - easeInOut(u) * (3.1 - yTo), 0.45);
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
              ciu.group.position.x = -5.4 + Math.sin(u * 40) * 0.09 * (1 - u);
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
      ciu.tick(dt, t); mcu.tick(dt, t);
      plcFlow.tick(dt); outFlow.tick(dt);
      if (pip.visible) pip.rotation.set(t * 2, t * 1.6, 0);
      tok.group.position.y = 3.5 + Math.sin(t * 1.2) * 0.03;
    });

    syncMeter();
    resetGates();
    tok.set(normaliseDigits(tokCtl.get()).padEnd(20, '0').slice(0, 20));
    log.add(`Meter ${meter.drn} online. Balance ${meter.balanceKwh.toFixed(1)} kWh.`, '');
    if (!Store.get('lastToken')) log.add('Tip: vend a token in Lesson 9 and it appears here.', 'am');
  }
};
