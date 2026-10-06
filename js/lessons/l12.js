import { PAL, THREE, makeLabel, makeBox, makeShell, makeFlow, linePath, arcPath, makeConduit,
  makeGlow, Timeline, easeInOut } from '../scene.js';
import { makeMCU, makeCIU, makePole, makeHouse, makeTokenDisplay, makeEngine, makeKeyIcon }
  from '../viz.js';
import {
  Meter, deriveDecoderKey, vendingKeyFromPhrase, buildCreditToken,
  tidFromDate, dateFromTid, normaliseDigits
} from '../crypto/sts.js';
import { blockHex } from '../crypto/cipher.js';
import { Store } from '../store.js';

export default {
  id: 'l12', act: 3, num: 12,
  title: 'The whole thing, running',
  subtitle: 'Mobile money to light bulb, with every cryptographic step visible.',
  stageOpts: { camera: [0, 3.4, 22], target: [0, 1.2, 0], gridY: -2.6, maxDistance: 55, minDistance: 6 },

  learn: `
    <h3>Everything you have built, in one machine</h3>
    <p>Press <strong>Buy credit</strong> and watch the whole chain run. Each stage is a lesson you
    have already done:</p>
    <table class="kv">
      <tr><td>1 · Pay</td><td>Mobile money confirms, quoting the meter's DRN.</td></tr>
      <tr><td>2 · Derive</td><td>The vending system derives this meter's Decoder Key from the
      vending key + DRN. <span class="hint">Lesson 7</span></td></tr>
      <tr><td>3 · Assemble</td><td>Sub-class, TID, amount, CRC packed into 64 bits.
      <span class="hint">Lesson 9</span></td></tr>
      <tr><td>4 · Encrypt</td><td>The block is encrypted under that key.
      <span class="hint">Lessons 2–3</span></td></tr>
      <tr><td>5 · Render</td><td>66 bits become twenty digits, sent to your phone.
      <span class="hint">Lesson 9</span></td></tr>
      <tr><td>6 · Type</td><td>You enter them on the CIU keypad. <span class="hint">Lesson 8</span></td></tr>
      <tr><td>7 · Validate</td><td>The MCU decrypts, checks the CRC, checks the TID is newer.
      <span class="hint">Lesson 10</span></td></tr>
      <tr><td>8 · Act</td><td>Credit is added, the relay closes, the lights come on.</td></tr>
    </table>

    <h3>The thing worth remembering</h3>
    <p>Between step 5 and step 6 the token travels through an SMS, across a room, and through a
    person's fingers. It is completely public for that whole journey. It does not matter.</p>
    <p>The token is not secret — it is <strong>unforgeable</strong> and <strong>single-use</strong>.
    Unforgeable because only a holder of the Decoder Key can produce twenty digits that decrypt to a
    valid CRC. Single-use because its TID must be newer than the last one the meter accepted.</p>
    <p>That is why a meter with no clock sync, no network and a four-cent microcontroller can be
    trusted with a national billing system.</p>

    <div class="callout cy"><p>Turn on <strong>Consumption</strong> and let it run. The balance
    drains, the lights dim, and at zero the relay opens on its own. Then buy again. That loop,
    repeated across millions of households, <em>is</em> Yaka.</p></div>

    <h3>Try to break it</h3>
    <p>The attack buttons are all real attacks that people genuinely attempt. Every one of them ends
    at a gate you now understand.</p>
  `,

  build({ stage, ui }) {
    const tl = new Timeline(stage);

    const vkey = vendingKeyFromPhrase(Store.get('vendingPhrase'));
    const dkey = deriveDecoderKey({
      vendingKey: vkey, drn: Store.get('drn'), sgc: Store.get('sgc'),
      krn: Store.get('krn'), ti: Store.get('ti')
    });
    const meter = new Meter({
      drn: Store.get('drn'), sgc: Store.get('sgc'), dk: dkey,
      krn: Store.get('krn'), baseDate: Store.get('baseDate'), balanceKwh: 1.4
    });

    /* ── Props ────────────────────────────────────────────────────── */
    // Phone
    const phone = new THREE.Group();
    phone.position.set(-8.4, 0.6, 1.4);
    const phoneBody = makeBox(1.0, 1.9, 0.12, 0x26282d, { wireColor: PAL.cyan, wireOpacity: 0.4 });
    const phoneScreen = makeBox(0.86, 1.5, 0.04, 0x07110f, { wire: false });
    phoneScreen.position.z = 0.08;
    const phoneText = makeLabel('', { height: 0.14, mono: true, color: '#a9cdf2' });
    phoneText.position.set(0, 0, 0.13);
    phone.add(phoneBody, phoneScreen, phoneText);
    stage.add(phone);
    const phoneCap = makeLabel('CUSTOMER', { height: 0.19, color: '#b3b0a8' });
    phoneCap.position.set(-8.4, 1.9, 1.4);
    stage.add(phoneCap);

    // Vending server
    const server = new THREE.Group();
    server.position.set(-4.4, 0.9, 0);
    const rack = makeShell(2.4, 3.0, 1.6, PAL.cyan, 0.07);
    const srvCap = makeLabel('VENDING SERVER', { height: 0.21, color: '#ffffff', weight: 700 });
    srvCap.position.y = 1.95;
    const srvSub = makeLabel('derives the key · builds the token', { height: 0.15, color: '#a19e96' });
    srvSub.position.y = 1.68;
    server.add(rack, srvCap, srvSub);
    stage.add(server);

    const srvEngine = makeEngine('', PAL.cyan, [1.5, 1.2, 1.0]);
    srvEngine.group.position.set(-4.4, 0.7, 0);
    srvEngine.group.scale.setScalar(0.75);
    stage.add(srvEngine.group);

    const srvKey = makeKeyIcon(PAL.red);
    srvKey.scale.setScalar(0.42);
    srvKey.position.set(-4.9, 2.1, 0.5);
    stage.add(srvKey);

    // Token in the air
    const tok = makeTokenDisplay({ tile: 0.28 });
    tok.group.position.set(-0.4, 3.4, 0);
    tok.group.scale.setScalar(0.92);
    stage.add(tok.group);
    const tokCap = makeLabel('TOKEN — public, unforgeable, single-use',
      { height: 0.18, mono: true, color: '#ffffff' });
    tokCap.material.color.set('#a9cdf2');
    tokCap.position.set(-0.4, 3.95, 0);
    stage.add(tokCap);

    // Pole + MCU
    const pole = makePole(9);
    pole.position.set(3.4, 0, -0.6);
    stage.add(pole);
    const mcu = makeMCU();
    mcu.group.position.set(3.4, 3.6, 0);
    mcu.group.scale.setScalar(0.82);
    stage.add(mcu.group);

    // House + CIU
    const house = makeHouse();
    house.group.position.set(7.6, -0.2, 0);
    house.group.scale.setScalar(1.05);
    stage.add(house.group);
    const ciu = makeCIU();
    ciu.group.position.set(6.4, 0.3, 1.7);
    ciu.group.scale.setScalar(0.66);
    stage.add(ciu.group);

    const supply = makeConduit([3.5, 2.6, 0.3], [6.4, 1.0, 0.4], PAL.amber);
    stage.add(supply);

    /* ── Flows ────────────────────────────────────────────────────── */
    const payFlow  = makeFlow(arcPath([-7.9, 0.8, 1.2], [-5.4, 0.9, 0.4], 0.9), 9, PAL.green, 0.055);
    const tokFlow  = makeFlow(arcPath([-3.4, 1.4, 0.3], [-1.0, 3.2, 0], 0.7), 9, PAL.cyan, 0.055);
    const smsFlow  = makeFlow(arcPath([-1.4, 3.3, 0], [-8.3, 1.5, 1.3], 1.4), 11, PAL.cyan, 0.05);
    const typeFlow = makeFlow(arcPath([-7.9, 0.6, 1.5], [6.1, 0.6, 1.9], -2.4), 13, PAL.violet, 0.05);
    const plcFlow  = makeFlow(linePath([6.2, 0.9, 1.7], [3.6, 3.2, 0.4]), 10, PAL.violet, 0.05);
    const powFlow  = makeFlow(linePath([3.5, 2.6, 0.3], [6.6, 0.6, 0.4]), 10, PAL.amber, 0.05);
    [payFlow, tokFlow, smsFlow, typeFlow, plcFlow, powFlow].forEach(f => {
      f.active = false; f.speed = 0.45; stage.add(f.group);
    });
    powFlow.speed = 0.7;

    const stageLabel = makeLabel('', { height: 0.26, color: '#ffffff', weight: 700 });
    stageLabel.position.set(-0.4, -1.6, 0);
    stageLabel.material.color.set('#86837b');
    stage.add(stageLabel);

    /* ── State ────────────────────────────────────────────────────── */
    let tariff = 800;       // UGX per kWh — illustrative
    let spend = 40000;      // UGX
    let running = false;    // consumption sim
    let simSpeed = 1;
    let lastDigits = Store.get('lastToken')?.digits || '';
    let busy = false;

    const kwhFor = () => Math.max(0.1, Math.round((spend / tariff) * 10) / 10);

    const syncMeter = () => {
      const s = meter.snapshot();
      mcu.setScreen(s.tamper ? 'TAMPER' : `${s.balanceKwh.toFixed(1)}`);
      mcu.setLamp('relay', s.relay, 1.8);
      mcu.setLamp('tamper', !!s.tamper, 2.4);
      ciu.setScreen(s.tamper ? 'TAMPER' : s.relay ? `${s.balanceKwh.toFixed(1)}kWh` : 'NO CREDIT');
      house.setPower(s.relay, Math.min(1, 0.35 + s.balanceKwh / 30));
      powFlow.active = s.relay;
      rBal.set(`${s.balanceKwh.toFixed(1)} kWh`, s.relay ? 'ok' : 'err');
      rRelay.set(s.relay ? 'CLOSED' : 'OPEN', s.relay ? 'ok' : 'err');
      rTidState.set(s.lastTid ? String(s.lastTid) : 'none yet');
      rKrnState.set(`KRN ${s.krn}${s.tamper ? '  ·  TAMPER' : ''}`, s.tamper ? 'err' : '');
    };

    const setStage = (text, color = '#5ea1e6') => {
      stageLabel.setText(text);
      stageLabel.material.color.set(color);
    };

    /* ── The full purchase sequence ───────────────────────────────── */
    const buy = () => {
      if (busy) return;
      busy = true;
      const kwh = kwhFor();
      const units = Math.round(kwh * 10);
      let token = null, issuedTid = 0;

      const steps = [
        [1.1, () => {
          setStage('1 · PAYING', '#62c08a');
          phoneText.setText(`MOBILE MONEY\n\nUGX ${spend.toLocaleString()}\nmeter\n${meter.drn}\n\nsending…`);
          payFlow.active = true;
          log.add(`Customer pays UGX ${spend.toLocaleString()} for meter ${meter.drn}.`, 'cy');
        }],
        [1.0, () => {
          payFlow.active = false;
          setStage('2 · DERIVING THE KEY', '#ec5f59');
          srvKey.scale.setScalar(0.62);
          log.add(`Server derives the decoder key from the vending key + DRN → ${blockHex(meter.dk)}`, '');
        }],
        [1.0, () => {
          srvKey.scale.setScalar(0.42);
          setStage('3 · ASSEMBLING THE BLOCK', '#f0a04b');
          issuedTid = Store.issueTid(tidFromDate(new Date(), meter.baseDate));
          token = buildCreditToken({ tid: issuedTid, units, dk: meter.dk });
          log.add(`Block: subclass 0 | TID ${issuedTid} | ${units} units | CRC`, '');
        }],
        [1.1, () => {
          setStage('4 · ENCRYPTING', '#5ea1e6');
          srvEngine.setSpin(4);
          log.add(`Encrypted under the decoder key → ${blockHex(token.cipherBlock)}`, '');
        }],
        [1.0, () => {
          srvEngine.setSpin(1);
          setStage('5 · RENDERING 20 DIGITS', '#5ea1e6');
          tok.set(token.digits);
          tokFlow.active = true;
          lastDigits = token.digits;
          tokCtl.setQuiet(token.digits);
          log.add(`Token: ${token.groups}`, 'cy');
        }],
        [1.2, () => {
          tokFlow.active = false;
          smsFlow.active = true;
          setStage('6 · SMS TO THE CUSTOMER', '#5ea1e6');
          phoneText.setText(`TOKEN\n\n${token.groups.split(' ').join('\n')}\n\n${kwh.toFixed(1)} kWh`);
        }],
        [1.4, () => {
          smsFlow.active = false;
          typeFlow.active = true;
          setStage('7 · TYPING IT IN', '#a58bd8');
          ciu.setScreen('ENTER…');
          [...token.digits].forEach((ch, i) => setTimeout(() => ciu.press(ch), i * 55));
        }],
        [1.4, () => {
          typeFlow.active = false;
          plcFlow.active = true;
          setStage('8 · MCU VALIDATES', '#a58bd8');
        }],
        [1.3, () => {
          plcFlow.active = false;
          const r = meter.feed(token.digits);
          r.steps.forEach(s => log.add(`  ${s.step}: ${s.detail}`, s.ok ? 'ok' : 'err'));
          if (r.ok) {
            setStage(`✓ ${kwh.toFixed(1)} kWh CREDITED — POWER ON`, '#62c08a');
            log.add(`Accepted. Balance now ${meter.balanceKwh.toFixed(1)} kWh.`, 'ok');
            Store.recordToken({ digits: token.digits, groups: token.groups, kwh,
              tid: issuedTid, cls: 0, drn: meter.drn, issuedAt: new Date().toISOString() });
          } else {
            setStage('✗ REJECTED', '#ec5f59');
            log.add(r.reason, 'err');
          }
          syncMeter();
          ui.data({
            'paid': `UGX ${spend.toLocaleString()} at ${tariff}/kWh`,
            'credit': `${kwh.toFixed(1)} kWh = ${units} units`,
            'meter DRN': meter.drn,
            'decoder key': blockHex(meter.dk),
            'plain block': blockHex(token.plainBlock),
            'cipher block': blockHex(token.cipherBlock),
            'token': token.groups,
            '—': '',
            ...Object.fromEntries(r.steps.map(s => [`gate: ${s.step}`, `${s.ok ? 'PASS' : 'FAIL'} — ${s.detail}`])),
            'outcome': r.ok ? 'ACCEPTED' : `REJECTED (${r.stage})`,
            'balance': `${meter.balanceKwh.toFixed(1)} kWh`,
            'relay': meter.relay ? 'closed' : 'open'
          });
          busy = false;
        }]
      ];

      let i = 0;
      const next = () => {
        if (i >= steps.length) return;
        const [d, fn] = steps[i++];
        fn();
        tl.run(d, null, next);
      };
      next();
    };

    /* ── Controls ─────────────────────────────────────────────────── */
    ui.section('Buy credit');
    ui.slider({ label: 'Amount to spend', min: 2000, max: 200000, step: 1000, value: spend,
      format: (v) => `UGX ${v.toLocaleString()}`, onInput: (v) => { spend = v; rBuy.set(`${kwhFor().toFixed(1)} kWh`); } });
    ui.slider({ label: 'Tariff', min: 200, max: 1500, step: 10, value: tariff,
      format: (v) => `UGX ${v}/kWh`, onInput: (v) => { tariff = v; rBuy.set(`${kwhFor().toFixed(1)} kWh`); } });
    const rBuy = ui.readout('You will receive', '—');
    ui.button('⚡  Buy credit — run the whole chain', buy);
    ui.note('Eight stages, about twelve seconds. Watch the caption under the scene.');

    ui.section('Meter');
    const rBal      = ui.readout('Balance', '—');
    const rRelay    = ui.readout('Relay', '—');
    const rTidState = ui.readout('Last accepted TID', '—');
    const rKrnState = ui.readout('Key revision', '—');

    ui.section('Consumption');
    ui.button('▶  Start / pause the household', (btn) => {
      running = !running;
      btn.innerHTML = running ? '⏸  Pause the household' : '▶  Start / pause the household';
      log.add(running ? 'Household load switched on.' : 'Household load paused.', '');
    }, { variant: 'ghost' });
    ui.slider({ label: 'Simulation speed', min: 1, max: 60, value: 1, step: 1,
      format: (v) => `${v}×`, onInput: (v) => { simSpeed = v; } });
    ui.button('Use 1 kWh now', () => {
      meter.consume(1);
      syncMeter();
      if (!meter.relay) { setStage('✗ BALANCE EXHAUSTED — RELAY OPEN', '#ec5f59'); log.add('Balance reached zero. Relay opened.', 'err'); }
    }, { variant: 'ghost' });

    ui.section('Enter a token by hand');
    const tokCtl = ui.text({ label: '20 digits', value: lastDigits,
      onInput: (v) => tok.set(normaliseDigits(v).padEnd(20, '0').slice(0, 20)) });
    ui.button('Enter it', () => {
      const d = normaliseDigits(tokCtl.get());
      const r = meter.feed(d);
      r.steps.forEach(s => log.add(`  ${s.step}: ${s.detail}`, s.ok ? 'ok' : 'err'));
      setStage(r.ok ? '✓ ACCEPTED' : '✗ REJECTED', r.ok ? '#62c08a' : '#ec5f59');
      if (!r.ok) log.add(r.reason, 'err');
      syncMeter();
    }, { variant: 'ghost' });

    ui.section('Try to break it');
    ui.button('Re-enter the last token', () => {
      const r = meter.feed(lastDigits);
      setStage(r.ok ? '✓ ACCEPTED' : '✗ REPLAY REJECTED', r.ok ? '#62c08a' : '#ec5f59');
      log.add(r.ok ? 'Accepted.' : r.reason, r.ok ? 'ok' : 'err');
      syncMeter();
    }, { variant: 'danger' });

    ui.button('Guess 500 random tokens', () => {
      let hits = 0, crcPass = 0;
      for (let n = 0; n < 500; n++) {
        let d = '';
        for (let i = 0; i < 20; i++) d += Math.floor(Math.random() * 10);
        if (BigInt(d) >= (1n << 66n)) continue;
        const before = meter.balanceKwh;
        const r = meter.feed(d);
        if (r.stage !== 'crc' && r.stage !== 'format') crcPass++;
        if (r.ok) hits++;
        if (meter.balanceKwh !== before) log.add('A random guess got through!', 'err');
      }
      log.add(`500 random tokens: ${crcPass} passed CRC, ${hits} were accepted.`,
        hits ? 'err' : 'ok');
      setStage(hits ? '✗ A GUESS GOT THROUGH' : '✓ 500 GUESSES, ALL REJECTED', hits ? '#ec5f59' : '#62c08a');
      ui.data({
        'attempts': '500 random 20-digit tokens',
        'passed the CRC gate': String(crcPass),
        'expected by chance': `${(500 / 65536).toFixed(3)} (1 in 65,536 per attempt)`,
        'actually accepted': String(hits),
        'why even a CRC pass usually fails': 'it must ALSO decode to a TID newer than the stored one',
        'to brute-force a real meter': 'you would need the 64-bit decoder key, not the token'
      });
      syncMeter();
    }, { variant: 'danger' });

    ui.button('Attack the keypad with a hammer', () => {
      log.add('CIU destroyed.', 'err');
      log.add('MCU is on the pole. Relay unchanged. Balance unchanged. Supply unaffected.', 'ok');
      setStage('CIU DESTROYED — SUPPLY UNAFFECTED', '#62c08a');
      tl.run(0.6, (u) => {
        ciu.group.rotation.z = Math.sin(u * 30) * 0.2 * (1 - u);
        ciu.group.position.y = 0.3 - u * 0.9;
      });
      ui.data({
        'destroyed': 'the Customer Interface Unit — keypad and display',
        'key material lost': 'none, it never had any',
        'credit lost': 'none, the balance is in the MCU',
        'supply': 'still connected — the relay is in the MCU',
        'the point': 'This is why split metering exists.'
      });
    }, { variant: 'danger' });
    ui.button('Put the keypad back', () => {
      ciu.group.rotation.z = 0; ciu.group.position.y = 0.3;
      syncMeter();
    }, { variant: 'ghost' });

    ui.section('Reset');
    ui.button('Factory-reset the meter', () => {
      meter.balanceKwh = 0; meter.lastTid = 0; meter.usedTids.clear();
      meter.relay = false; meter.tamper = null;
      running = false;
      setStage('METER RESET', '#86837b');
      log.clear(); log.add('Meter reset.', '');
      syncMeter();
    }, { variant: 'ghost' });

    ui.section('Log');
    const log = ui.log(140);

    /* ── Tick ─────────────────────────────────────────────────────── */
    let drain = 0;
    stage.onTick((dt, t) => {
      mcu.tick(dt, t); ciu.tick(dt, t); srvEngine.tick(dt, t);
      [payFlow, tokFlow, smsFlow, typeFlow, plcFlow, powFlow].forEach(f => f.tick(dt));
      srvKey.userData.tick(dt, t);
      phone.rotation.y = Math.sin(t * 0.5) * 0.12;
      tok.group.position.y = 3.4 + Math.sin(t * 1.1) * 0.05;

      if (running && meter.relay) {
        drain += dt * simSpeed * 0.06;
        if (drain >= 0.1) {
          const use = Math.round(drain * 10) / 10;
          drain -= use;
          const wasOn = meter.relay;
          meter.consume(use);
          syncMeter();
          if (wasOn && !meter.relay) {
            setStage('✗ BALANCE EXHAUSTED — RELAY OPEN', '#ec5f59');
            log.add('Balance reached zero. Relay opened. Lights out.', 'err');
            running = false;
          }
        }
      }
    });

    /* ── Boot ─────────────────────────────────────────────────────── */
    rBuy.set(`${kwhFor().toFixed(1)} kWh`);
    tok.set(lastDigits ? lastDigits : '0'.repeat(20));
    phoneText.setText('MOBILE MONEY\n\nready');
    syncMeter();
    setStage('READY — press Buy credit', '#86837b');
    log.add(`Meter ${meter.drn} · balance ${meter.balanceKwh.toFixed(1)} kWh · relay ${meter.relay ? 'closed' : 'open'}`, '');
    ui.data({
      'meter DRN': meter.drn,
      'decoder key': blockHex(meter.dk),
      'vending key': blockHex(vkey) + '  (never leaves the HSM in a real system)',
      'base date': String(meter.baseDate),
      'ready': 'Press "Buy credit" to run all eight stages.'
    });
  }
};
