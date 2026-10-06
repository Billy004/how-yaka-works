import { PAL, THREE, makeLabel, makeBox, makeFlow, linePath, makeGlow, Timeline, easeInOut }
  from '../scene.js';
import { makeMCU, makeKeyIcon, makeTokenDisplay } from '../viz.js';
import {
  Meter, deriveDecoderKey, vendingKeyFromPhrase, buildCreditToken, buildKctPair,
  tidFromDate, dateFromTid, tidExpiry, TID_MAX, BASE_DATES
} from '../crypto/sts.js';
import { blockHex, keyFromPhrase } from '../crypto/cipher.js';
import { Store } from '../store.js';

export default {
  id: 'l11', act: 3, num: 11,
  title: 'Re-keying, rollover and tamper',
  subtitle: 'Changing a meter\'s key through its keypad — and the day the world\'s TID counter ran out.',
  stageOpts: { camera: [0, 1.2, 14.5], target: [0, 0.4, 0], gridY: -4.0, maxDistance: 32 },

  learn: `
    <h3>Changing a key you cannot reach</h3>
    <p>The Decoder Key lives in a sealed box on a pole. Sometimes it has to change — a tariff
    change, a meter transferred to another supply area, a key generation being retired, or a
    suspected compromise. Sending a technician to every meter is not an option.</p>
    <p>So the new key arrives the same way credit does: as tokens typed on the keypad. A
    <strong>Key Change Token</strong> pair, class 1 instead of class 0.</p>
    <ul>
      <li><strong>KCT 1</strong> carries the first half of the new key. The meter holds it and waits.</li>
      <li><strong>KCT 2</strong> carries the second half. The meter assembles both, replaces the key
      in EEPROM, and updates its Key Revision Number.</li>
    </ul>
    <p>Both are encrypted under the <em>old</em> key — which is what makes them trustworthy. Only
    the utility, which can derive the old key, can issue a valid pair.</p>

    <div class="callout cy"><p>After a key change, tokens bought under the old key stop working.
    Press <strong>Try an old token</strong> after re-keying and watch it fail the CRC gate.
    This is the single most common cause of "my token won't go in" after a utility does maintenance.</p></div>

    <h3>The 2024 TID rollover — a real deadline, met worldwide</h3>
    <p>The TID field is 24 bits: <code>16,777,215</code> minutes. Counted from the STS base date of
    <strong>1 January 1993</strong>, that counter reached its maximum on
    <strong>24 November 2024</strong>. Every STS meter on earth — millions of them, Uganda's
    included — had to be moved to a new base date of <strong>1 January 2014</strong> before that
    date, or it would start rejecting every new token as "not newer".</p>
    <p>The fix was exactly the mechanism above: key change tokens, issued to every meter, entered by
    hand on millions of keypads. It was one of the largest coordinated field updates in utility
    history, and it bought another 31 years.</p>

    <div class="callout"><p>Drag the date slider past November 2024 with the 1993 base date
    selected. Watch the TID hit its ceiling and stick. Then switch the base date to 2014 and see the
    counter fall back to a small number with three decades of headroom.</p></div>

    <h3>Tamper detection</h3>
    <table class="kv">
      <tr><td>Cover switch</td><td>A micro-switch under the terminal cover. Opening it trips the
      relay instantly and logs the event.</td></tr>
      <tr><td>Neutral / bypass</td><td>Two current transformers measure live and neutral. If they
      disagree, current is returning through something that is not the meter — a bypass. The meter
      bills the higher reading, or disconnects.</td></tr>
      <tr><td>Magnetic field</td><td>A Hall-effect sensor spots a strong magnet held against the
      case to saturate the transformers.</td></tr>
    </table>
    <p>None of these are cryptographic. They exist because the cheapest attack on a meter was never
    to break the cipher — it was to bypass the box.</p>
  `,

  build({ stage, ui }) {
    const tl = new Timeline(stage);

    const vkey = vendingKeyFromPhrase(Store.get('vendingPhrase'));
    const startKey = deriveDecoderKey({
      vendingKey: vkey, drn: Store.get('drn'), sgc: Store.get('sgc'),
      krn: Store.get('krn'), ti: Store.get('ti')
    });
    const meter = new Meter({
      drn: Store.get('drn'), sgc: Store.get('sgc'), dk: startKey,
      krn: Store.get('krn'), baseDate: 1, balanceKwh: 18.0
    });
    let oldKey = { ...startKey };
    let pair = null;

    // ── Scene ──────────────────────────────────────────────────────────
    const mcu = makeMCU();
    mcu.group.position.set(4.8, 0.9, 0);
    mcu.group.scale.setScalar(0.88);
    stage.add(mcu.group);

    const dk = makeKeyIcon(PAL.green, 'KRN 1');
    dk.position.set(4.4, 0.55, 1.0);
    dk.scale.setScalar(0.6);
    stage.add(dk);

    const kct1 = makeTokenDisplay({ tile: 0.24 });
    const kct2 = makeTokenDisplay({ tile: 0.24 });
    kct1.group.position.set(-2.6, 2.6, 0);
    kct2.group.position.set(-2.6, 1.7, 0);
    kct1.group.scale.setScalar(0.9);
    kct2.group.scale.setScalar(0.9);
    stage.add(kct1.group, kct2.group);
    const l1 = makeLabel('KCT 1 — first half of the new key', { height: 0.16, mono: true, color: '#ffffff' });
    l1.material.color.set('#c7b5e8');
    l1.position.set(-2.6, 3.0, 0);
    const l2 = makeLabel('KCT 2 — second half', { height: 0.16, mono: true, color: '#ffffff' });
    l2.material.color.set('#c7b5e8');
    l2.position.set(-2.6, 2.1, 0);
    stage.add(l1, l2);

    const kctFlow = makeFlow(linePath([-0.4, 2.2, 0.3], [3.6, 0.9, 0.3]), 10, PAL.violet, 0.055);
    kctFlow.speed = 0.4; kctFlow.active = false;
    stage.add(kctFlow.group);

    // ── TID timeline ───────────────────────────────────────────────────
    const TL_W = 10.4, TL_Y = -1.9;
    const track = makeBox(TL_W, 0.3, 0.16, 0x1e2024, { wireColor: PAL.steel, wireOpacity: 0.5 });
    track.position.set(0, TL_Y, 0);
    stage.add(track);
    const fill = makeBox(0.1, 0.34, 0.2, PAL.cyan, { wire: false, emissive: PAL.cyan, emissiveIntensity: 0.4 });
    fill.position.set(-TL_W / 2, TL_Y, 0.02);
    stage.add(fill);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4),
      new THREE.MeshStandardMaterial({ color: PAL.amber, emissive: PAL.amber, emissiveIntensity: 1.2 }));
    marker.rotation.x = Math.PI;
    marker.position.set(-TL_W / 2, TL_Y + 0.45, 0.1);
    stage.add(marker);
    const markerLabel = makeLabel('', { height: 0.17, mono: true, color: '#ffd9a0' });
    markerLabel.position.set(-TL_W / 2, TL_Y + 0.85, 0.1);
    stage.add(markerLabel);

    const ceiling = makeBox(0.06, 0.62, 0.22, PAL.red, { wire: false, emissive: PAL.red, emissiveIntensity: 0.9 });
    ceiling.position.set(TL_W / 2, TL_Y, 0.06);
    stage.add(ceiling);
    const ceilLabel = makeLabel('', { height: 0.16, mono: true, color: '#ffffff' });
    ceilLabel.material.color.set('#f3a19c');
    ceilLabel.position.set(TL_W / 2 - 0.9, TL_Y - 0.6, 0.1);
    stage.add(ceilLabel);
    const startLabel = makeLabel('', { height: 0.16, mono: true, color: '#ffffff' });
    startLabel.material.color.set('#86837b');
    startLabel.position.set(-TL_W / 2 + 0.8, TL_Y - 0.6, 0.1);
    stage.add(startLabel);
    const tlTitle = makeLabel('24-BIT TID SPACE', { height: 0.18, color: '#b3b0a8' });
    tlTitle.position.set(0, TL_Y - 1.15, 0);
    stage.add(tlTitle);

    // ── State ──────────────────────────────────────────────────────────
    let simDate = new Date('2024-06-01T12:00:00Z');

    const clampedTid = () => {
      const raw = tidFromDate(simDate, meter.baseDate);
      return { raw, tid: Math.max(0, Math.min(TID_MAX, raw)), over: raw > TID_MAX, under: raw < 0 };
    };

    // Vending side: never reissue a TID. Capped at the ceiling, so past it every new token
    // repeats TID_MAX and is refused — exactly the rollover failure this lesson shows.
    let lastIssued = 0;
    const issueTid = () => (lastIssued = Math.min(TID_MAX, Math.max(clampedTid().tid, lastIssued + 1)));

    const renderTimeline = () => {
      const { raw, tid, over, under } = clampedTid();
      const u = Math.max(0, Math.min(1, tid / TID_MAX));
      fill.scale.x = Math.max(0.001, u * TL_W / 0.1);
      fill.position.x = -TL_W / 2 + (u * TL_W) / 2;
      marker.position.x = -TL_W / 2 + u * TL_W;
      markerLabel.position.x = Math.min(TL_W / 2 - 1.2, Math.max(-TL_W / 2 + 1.2, marker.position.x));
      markerLabel.setText(`TID ${tid.toLocaleString()}`);

      const exp = tidExpiry(meter.baseDate);
      ceilLabel.setText(`max ${TID_MAX.toLocaleString()}\n${exp.toISOString().slice(0, 10)}`);
      startLabel.setText(`base ${new Date(BASE_DATES[meter.baseDate].ms).toISOString().slice(0, 10)}`);

      fill.material.color.setHex(over ? PAL.red : u > 0.92 ? PAL.amber : PAL.cyan);
      fill.material.emissive.setHex(over ? PAL.red : u > 0.92 ? PAL.amber : PAL.cyan);

      rDate.set(simDate.toISOString().replace('T', ' ').slice(0, 16) + ' UTC');
      rTidNow.set(over
        ? `${raw.toLocaleString()} — EXCEEDS the 24-bit field\nclamped to ${TID_MAX.toLocaleString()}`
        : under ? `${raw.toLocaleString()} — before the base date` : tid.toLocaleString(),
        over || under ? 'err' : u > 0.92 ? 'am' : 'ok');
      rHeadroom.set(over
        ? 'NONE — every new token now looks "not newer" to the meter'
        : `${((TID_MAX - tid) / 525600).toFixed(1)} years of TID space left`,
        over ? 'err' : (TID_MAX - tid) / 525600 < 2 ? 'am' : 'ok');
    };

    const syncMeter = () => {
      const s = meter.snapshot();
      mcu.setScreen(s.tamper ? 'TAMPER' : `${s.balanceKwh.toFixed(1)} kWh`);
      mcu.setLamp('relay', s.relay, 1.8);
      mcu.setLamp('tamper', !!s.tamper, 2.4);
      rKrn.set(`KRN ${meter.krn}`, '');
      rMeterKey.set(blockHex(meter.dk));
      rOldKey.set(blockHex(oldKey), meter.dk.hi === oldKey.hi && meter.dk.lo === oldKey.lo ? '' : 'am');
      dk.children.forEach(c => { if (c.isSprite && c.setText) c.setText(`KRN ${meter.krn}`); });
      renderTimeline();
    };

    const enter = (digits, note) => {
      const r = meter.feed(digits);
      kctFlow.active = true;
      setTimeout(() => { kctFlow.active = false; }, 1600);
      log.add(`${note}: ${r.ok ? (r.steps.at(-1)?.detail || 'accepted') : r.reason}`, r.ok ? 'ok' : 'err');
      syncMeter();
      ui.data({
        'entered': digits.replace(/(.{4})/g, '$1 ').trim(),
        ...Object.fromEntries(r.steps.map(s => [`gate: ${s.step}`, `${s.ok ? 'PASS' : 'FAIL'} — ${s.detail}`])),
        'outcome': r.ok ? 'ACCEPTED' : `REJECTED (${r.stage})`,
        'meter KRN': String(meter.krn),
        'meter decoder key': blockHex(meter.dk)
      });
      return r;
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('Meter');
    const rKrn      = ui.readout('Key revision', '—');
    const rMeterKey = ui.readout('Decoder key in EEPROM', '—');
    const rOldKey   = ui.readout('Key the old tokens were built with', '—');

    ui.section('Re-key over the keypad');
    ui.button('1 · Utility issues a KCT pair', () => {
      const newKey = keyFromPhrase('umeme-generation-2-' + Date.now());
      pair = buildKctPair({ newKey, newKrn: (meter.krn % 9) + 1, dk: meter.dk });
      kct1.set(pair[0].digits);
      kct2.set(pair[1].digits);
      rK1.set(pair[0].groups);
      rK2.set(pair[1].groups);
      log.add(`KCT pair generated under the CURRENT key (KRN ${meter.krn}).`, 'cy');
      log.add('Both halves are encrypted with the old key — that is what proves they are genuine.', '');
    });
    const rK1 = ui.readout('KCT 1', '—');
    const rK2 = ui.readout('KCT 2', '—');
    ui.buttonRow([
      { label: '2 · Enter KCT 1', variant: 'warn', onClick: () => {
          if (!pair) return log.add('Issue a pair first.', 'am');
          enter(pair[0].digits, 'KCT 1');
        } },
      { label: '3 · Enter KCT 2', variant: 'warn', onClick: () => {
          if (!pair) return log.add('Issue a pair first.', 'am');
          enter(pair[1].digits, 'KCT 2');
          tl.run(0.8, (u) => { dk.rotation.y = u * Math.PI * 4; dk.scale.setScalar(0.6 + Math.sin(u * Math.PI) * 0.3); });
        } }
    ]);
    ui.button('Enter KCT 2 on its own', () => {
      if (!pair) return log.add('Issue a pair first.', 'am');
      enter(pair[1].digits, 'KCT 2 alone');
    }, { variant: 'ghost' });

    ui.section('Did it work?');
    ui.button('Try a token bought under the OLD key', () => {
      const t = buildCreditToken({ tid: issueTid(), units: 200, dk: oldKey });
      const r = enter(t.digits, 'Old-key token');
      rOutcome.set(r.ok ? 'Accepted — the key has not changed yet'
                        : 'Rejected at the CRC gate — the key really did change',
                   r.ok ? 'am' : 'ok');
    }, { variant: 'danger' });
    ui.button('Try a token bought under the NEW key', () => {
      const t = buildCreditToken({ tid: issueTid(), units: 200, dk: meter.dk });
      const r = enter(t.digits, 'New-key token');
      rOutcome.set(r.ok ? 'Accepted — 20.0 kWh credited under the new key' : r.reason,
                   r.ok ? 'ok' : 'err');
    });
    const rOutcome = ui.readout('Result', '—');

    ui.section('The 2024 TID rollover');
    const dateCtl = ui.slider({
      label: 'Simulated date', min: 0, max: 100, value: 62, step: 0.5,
      format: (v) => new Date(Date.UTC(1993, 0, 1) + (v / 100) * (Date.UTC(2035, 0, 1) - Date.UTC(1993, 0, 1)))
        .toISOString().slice(0, 10),
      onInput: (v) => {
        simDate = new Date(Date.UTC(1993, 0, 1) + (v / 100) * (Date.UTC(2035, 0, 1) - Date.UTC(1993, 0, 1)));
        renderTimeline();
      }
    });
    const rDate     = ui.readout('Wall clock', '—');
    const rTidNow   = ui.readout('TID at that moment', '—');
    const rHeadroom = ui.readout('Remaining TID space', '—');

    ui.chips({
      label: 'Base date in force',
      options: [{ label: '1993 (original)', value: '1' }, { label: '2014 (after rollover)', value: '2' }],
      value: '1',
      onChange: (v) => {
        meter.baseDate = Number(v);
        meter.lastTid = 0;
        meter.usedTids.clear();
        lastIssued = 0;
        log.add(`Base date set to ${BASE_DATES[meter.baseDate].label}. TID window reset.`,
          meter.baseDate === 2 ? 'ok' : 'am');
        syncMeter();
      }
    });
    ui.button('Jump to the day it ran out', () => {
      const exp = tidExpiry(1);
      const span = Date.UTC(2035, 0, 1) - Date.UTC(1993, 0, 1);
      dateCtl.set(((exp.getTime() - Date.UTC(1993, 0, 1)) / span) * 100);
      log.add(`24-bit TID exhausted: ${exp.toISOString().slice(0, 10)}.`, 'err');
      ui.data({
        'base date': '1993-01-01 (original STS base date)',
        'TID field width': '24 bits',
        'maximum TID': TID_MAX.toLocaleString() + ' minutes',
        'that is': `${(TID_MAX / 525600).toFixed(2)} years`,
        'exhausted on': tidExpiry(1).toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        'what breaks': 'The counter cannot go higher, so no token is ever "newer" than the last ' +
                       'one accepted. Every meter stops taking credit.',
        'the fix': 'Move every meter to a 2014 base date via key change tokens.',
        'new exhaustion': tidExpiry(2).toISOString().slice(0, 10),
        'scale': 'Hundreds of millions of meters worldwide, updated by hand, before the deadline.'
      });
    }, { variant: 'danger' });

    ui.section('Tamper sensors');
    ui.buttonRow([
      { label: 'Open cover', variant: 'danger', onClick: () => {
          meter.trip('cover');
          tl.run(0.6, (u) => mcu.setCoverOpen(u));
          log.add('Cover micro-switch → tamper. Relay tripped.', 'err');
          syncMeter();
        } },
      { label: 'Magnet', variant: 'danger', onClick: () => {
          meter.trip('magnet');
          log.add('Hall-effect sensor saw a strong field → tamper. Relay tripped.', 'err');
          syncMeter();
        } }
    ]);
    ui.button('Neutral bypass', () => {
      meter.trip('bypass');
      log.add('Live and neutral CTs disagree by 4.1 A → bypass suspected. Relay tripped.', 'err');
      syncMeter();
    }, { variant: 'danger' });
    ui.button('Utility issues a clear-tamper token', () => {
      const t = buildCreditToken({ tid: issueTid(), units: 0, dk: meter.dk, sub: 2 });
      enter(t.digits, 'Clear-tamper token');
      tl.run(0.6, (u) => mcu.setCoverOpen(1 - u));
      meter.relay = meter.balanceKwh > 0;
      syncMeter();
    }, { variant: 'ghost' });
    ui.note('A tampered meter refuses ordinary credit until the flag is cleared — which only the ' +
            'utility can do, because only the utility can build a token this meter will accept.');

    ui.section('Log');
    const log = ui.log();

    stage.onTick((dt, t) => {
      mcu.tick(dt, t);
      kctFlow.tick(dt);
      dk.userData.tick(dt, t);
      marker.position.y = TL_Y + 0.45 + Math.sin(t * 2.4) * 0.05;
      ceiling.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.3;
    });

    // Prefill the KCT displays with the current (unchanged) key so the panels aren't blank
    kct1.set('0'.repeat(20));
    kct2.set('0'.repeat(20));
    syncMeter();
    log.add(`Meter online. KRN ${meter.krn}, base date ${BASE_DATES[meter.baseDate].label}.`, '');
  }
};
