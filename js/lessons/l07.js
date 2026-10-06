import { PAL, THREE, makeLabel, makeShell, makeBox, makeGlow, makeFlow, linePath, makeConduit }
  from '../scene.js';
import { makeKeyIcon, makeEngine, makeCage } from '../viz.js';
import { deriveDecoderKey, vendingKeyFromPhrase } from '../crypto/sts.js';
import { blockHex } from '../crypto/cipher.js';

export default {
  id: 'l07', act: 2, num: 7,
  title: 'Deriving a key instead of sending one',
  subtitle: 'How two machines end up holding the same secret without it ever crossing a wire.',
  stageOpts: { camera: [0, 2.2, 13.5], target: [0, -0.2, 0], gridY: -3.8 },

  learn: `
    <h3>The problem we left open</h3>
    <p>Yaka is symmetric — the vending server and the meter must hold the same key. But the meter
    is on a pole with no network, and the key must never be guessable from anything an attacker can
    see. So how do they agree?</p>

    <h3>They don't agree. They both compute it.</h3>
    <p>The utility holds one master secret, the <strong>Vending Key</strong>, locked inside a
    tamper-resistant hardware security module. It never leaves that box — not to staff, not to the
    vending software, not to the meter.</p>
    <p>Every meter's <strong>Decoder Key</strong> is <em>derived</em> from that master key plus data
    that is printed on the meter itself and is not secret at all:</p>
    <table class="kv">
      <tr><td>DRN</td><td>Decoder Reference Number — the 11 digits printed on the meter. This is the
      number you quote when buying credit.</td></tr>
      <tr><td>SGC</td><td>Supply Group Code — which utility and region this meter belongs to.</td></tr>
      <tr><td>KRN</td><td>Key Revision Number — which generation of key is in force.</td></tr>
      <tr><td>TI</td><td>Tariff Index — the tariff the meter is set to.</td></tr>
    </table>
    <p><code>DecoderKey = f(VendingKey, DRN, SGC, KRN, TI)</code></p>

    <h3>Why this is the whole ballgame</h3>
    <ul>
      <li>The key is never transmitted, so it can never be intercepted.</li>
      <li>The vending server can serve millions of meters while storing <em>no</em> per-meter keys —
      it recomputes each one on demand.</li>
      <li>Compromising one meter reveals one Decoder Key, not the master, and not any other meter.</li>
      <li>Changing the KRN changes every derived key at once — which is how a whole region gets
      re-keyed. You will use this in Lesson 11.</li>
    </ul>

    <div class="callout cy"><p>Watch the channel in the middle. Only the <strong>public</strong>
    nameplate data crosses it. Both ends run the same derivation and arrive at the same 64-bit key
    independently. Change any one field and both sides change together — change it on
    <em>one</em> side only and they stop being able to talk.</p></div>

    <div class="callout"><p>That is the last piece of theory. From here on, everything is Yaka.</p></div>
  `,

  build({ stage, ui }) {
    // ── The utility's HSM ──────────────────────────────────────────────
    const hsm = new THREE.Group();
    hsm.position.set(-5.2, 0.4, 0);
    const hsmShell = makeShell(2.2, 2.4, 1.6, PAL.red, 0.09);
    const hsmTitle = makeLabel('HSM', { height: 0.26, color: '#fff', weight: 700 });
    hsmTitle.position.y = 1.6;
    const hsmSub = makeLabel('vending key never leaves', { height: 0.16, color: '#f3a19c' });
    hsmSub.position.y = 1.33;
    const vk = makeKeyIcon(PAL.red, 'VENDING KEY');
    vk.scale.setScalar(0.8);
    vk.position.y = 0.1;
    hsm.add(hsmShell, hsmTitle, hsmSub, vk);
    stage.add(hsm);

    // a cage around the HSM to say "sealed"
    const cage = makeCage(2.5, 2.7, 1.9, PAL.red);
    hsm.add(cage);

    // ── Derivation engine ──────────────────────────────────────────────
    const engine = makeEngine('DERIVE', PAL.violet, [2.3, 1.8, 1.5]);
    engine.group.position.set(-1.2, 0.4, 0);
    stage.add(engine.group);

    // ── The meter ──────────────────────────────────────────────────────
    const meter = new THREE.Group();
    meter.position.set(5.0, 0.4, 0);
    const mShell = makeShell(2.2, 2.4, 1.5, PAL.green, 0.08);
    const mTitle = makeLabel('METER EEPROM', { height: 0.22, color: '#fff', weight: 700 });
    mTitle.position.y = 1.6;
    const mSub = makeLabel('holds one derived key', { height: 0.16, color: '#a19e96' });
    mSub.position.y = 1.33;
    const dkMeter = makeKeyIcon(PAL.green, 'DECODER KEY');
    dkMeter.scale.setScalar(0.72);
    dkMeter.position.y = 0.1;
    meter.add(mShell, mTitle, mSub, dkMeter);
    stage.add(meter);

    // the server's copy of the same derived key
    const dkServer = makeKeyIcon(PAL.green, 'DECODER KEY');
    dkServer.scale.setScalar(0.72);
    dkServer.position.set(1.5, 0.5, 0);
    stage.add(dkServer);
    const sameLabel = makeLabel('identical — computed twice, never sent',
      { height: 0.19, mono: true, color: '#ffffff' });
    sameLabel.material.color.set('#a9cdf2');
    sameLabel.position.set(3.2, 1.5, 0);
    stage.add(sameLabel);

    // ── The public channel carrying nameplate data ─────────────────────
    const plate = makeBox(4.4, 1.15, 0.12, 0x23252a, { wireColor: PAL.amber, wireOpacity: 0.55 });
    plate.position.set(0, -2.5, 0);
    stage.add(plate);
    const plateTitle = makeLabel('PRINTED ON THE METER · NOT SECRET',
      { height: 0.16, mono: true, color: '#f0a04b' });
    plateTitle.position.set(0, -1.85, 0);
    stage.add(plateTitle);
    const plateText = makeLabel('', { height: 0.19, mono: true, color: '#ebe9e4' });
    plateText.position.set(0, -2.5, 0.12);
    stage.add(plateText);

    const upFlow = makeFlow(linePath([0, -1.9, 0], [-1.2, -0.5, 0]), 9, PAL.amber, 0.055);
    const acrossFlow = makeFlow(linePath([0, -2.0, 0], [4.6, -0.5, 0]), 11, PAL.amber, 0.055);
    upFlow.speed = 0.4; acrossFlow.speed = 0.35;
    stage.add(upFlow.group, acrossFlow.group);

    const vkFlow = makeFlow(linePath([-4.3, 0.4, 0], [-2.3, 0.4, 0]), 7, PAL.red, 0.055);
    vkFlow.speed = 0.5;
    stage.add(vkFlow.group);
    const vkNote = makeLabel('master key, inside the box only', { height: 0.15, mono: true, color: '#f3a19c' });
    vkNote.position.set(-3.3, 1.0, 0);
    stage.add(vkNote);

    const outFlow = makeFlow(linePath([-0.1, 0.4, 0], [1.2, 0.5, 0]), 6, PAL.green, 0.055);
    outFlow.speed = 0.45;
    stage.add(outFlow.group);

    const barrier = makeConduit([2.6, 2.0, 0], [2.6, -3.0, 0], PAL.steel);
    stage.add(barrier);
    const barrierLabel = makeLabel('utility  ·  |  ·  field', { height: 0.15, mono: true, color: '#7f7c74' });
    barrierLabel.position.set(2.6, 2.3, 0);
    stage.add(barrierLabel);

    // ── State ──────────────────────────────────────────────────────────
    const S = { phrase: 'umeme-master-2024', drn: '04122334455', sgc: 600321, krn: 1, ti: 7 };
    const M = { drn: '04122334455', sgc: 600321, krn: 1, ti: 7 };

    const render = () => {
      const vkey = vendingKeyFromPhrase(S.phrase);
      const dkS = deriveDecoderKey({ vendingKey: vkey, drn: S.drn || '0', sgc: S.sgc, krn: S.krn, ti: S.ti });
      const dkM = deriveDecoderKey({ vendingKey: vkey, drn: M.drn || '0', sgc: M.sgc, krn: M.krn, ti: M.ti });
      const same = dkS.hi === dkM.hi && dkS.lo === dkM.lo;

      plateText.setText(`DRN ${S.drn}   SGC ${S.sgc}   KRN ${S.krn}   TI ${S.ti}`);

      rVend.set(blockHex(vkey), 'am');
      rServer.set(blockHex(dkS));
      rMeter.set(blockHex(dkM), same ? 'ok' : 'err');
      rMatch.set(same ? 'MATCH — this meter and this server can talk'
                      : 'MISMATCH — every token will be rejected', same ? 'ok' : 'err');

      const c = same ? PAL.green : PAL.red;
      [dkMeter, dkServer].forEach(k => k.traverse(o => {
        if (o.type === 'Mesh' && o.material?.color) { o.material.color.setHex(c); o.material.emissive?.setHex(c); }
      }));
      sameLabel.setText(same ? 'identical — computed twice, never sent'
                             : 'DIFFERENT — the meter is out of sync');
      sameLabel.material.color.set(same ? '#a9cdf2' : '#f3a19c');
      engine.setColor(same ? PAL.violet : PAL.red);

      ui.data({
        'vending key phrase': JSON.stringify(S.phrase),
        'vending key (master)': blockHex(vkey) + '   ← never transmitted, never stored per-meter',
        '': '',
        'server DRN/SGC/KRN/TI': `${S.drn} / ${S.sgc} / ${S.krn} / ${S.ti}`,
        'meter  DRN/SGC/KRN/TI': `${M.drn} / ${M.sgc} / ${M.krn} / ${M.ti}`,
        'server decoder key': blockHex(dkS),
        'meter  decoder key': blockHex(dkM),
        'agreement': same ? 'identical' : 'DIFFERENT — tokens will fail CRC at the meter',
        'what crossed the wire': 'only the nameplate data — all of it public'
      });
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('Utility master secret');
    ui.text({ label: 'Vending key phrase <span class="hint">— lives in the HSM</span>',
      value: S.phrase, onInput: (v) => { S.phrase = v; render(); } });
    const rVend = ui.readout('Vending key (64-bit)', '—');

    ui.section('Meter nameplate — public');
    const drnCtl = ui.text({ label: 'DRN <span class="hint">— 11 digits on the meter</span>',
      value: S.drn, maxlength: 11,
      onInput: (v) => { S.drn = M.drn = v.replace(/\D/g, ''); render(); } });
    ui.slider({ label: 'SGC — supply group', min: 600000, max: 600999, value: S.sgc,
      format: (v) => String(v), onInput: (v) => { S.sgc = M.sgc = v; render(); } });
    ui.slider({ label: 'KRN — key revision', min: 1, max: 9, value: S.krn,
      format: (v) => String(v), onInput: (v) => { S.krn = M.krn = v; render(); } });
    ui.slider({ label: 'TI — tariff index', min: 0, max: 15, value: S.ti,
      format: (v) => String(v), onInput: (v) => { S.ti = M.ti = v; render(); } });

    ui.section('Derived keys');
    const rServer = ui.readout('Server computes', '—');
    const rMeter  = ui.readout('Meter holds', '—');
    const rMatch  = ui.readout('Can they talk?', '—');

    ui.section('Break the agreement');
    ui.note('These change the <strong>server\'s</strong> view only — as if the utility\'s records ' +
            'no longer matched the meter in the field.');
    ui.buttonRow([
      { label: 'Wrong SGC', variant: 'danger', onClick: () => { S.sgc = M.sgc + 1; render(); } },
      { label: 'Wrong KRN', variant: 'danger', onClick: () => { S.krn = (M.krn % 9) + 1; render(); } }
    ]);
    ui.button('Typo in the DRN', () => {
      const d = M.drn.split('');
      d[4] = String((Number(d[4]) + 1) % 10);
      S.drn = d.join('');
      render();
    }, { variant: 'danger' });
    ui.button('Re-sync the server to the meter', () => {
      S.drn = M.drn; S.sgc = M.sgc; S.krn = M.krn; S.ti = M.ti;
      drnCtl.setQuiet(S.drn);
      render();
    }, { variant: 'ghost' });

    ui.callout('A wrong DRN is the single most common real-world failure: one mistyped digit at ' +
               'the point of sale derives a completely different key, and the customer gets a ' +
               '20-digit token their meter will never accept.', 'rd');

    stage.onTick((dt, t) => {
      engine.tick(dt, t);
      upFlow.tick(dt); acrossFlow.tick(dt); vkFlow.tick(dt); outFlow.tick(dt);
      vk.userData.tick(dt, t);
      dkMeter.userData.tick(dt, t + 0.6);
      dkServer.userData.tick(dt, t + 0.6);
      cage.rotation.y = Math.sin(t * 0.3) * 0.04;
      plate.position.y = -2.5 + Math.sin(t * 1.1) * 0.03;
    });

    render();
  }
};
