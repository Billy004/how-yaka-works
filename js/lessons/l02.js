import { PAL, THREE, makeLabel, makeBox, makeShell, makeGlow, makeConduit, Timeline, easeInOut }
  from '../scene.js';
import { makeKeyIcon, makeLock } from '../viz.js';
import { keyFromPhrase, blockHex } from '../crypto/cipher.js';
import { esc } from '../ui.js';

export default {
  id: 'l02', act: 1, num: 2,
  title: 'One shared key',
  subtitle: 'Symmetric encryption: both sides hold the same secret — which is its strength and its problem.',
  stageOpts: { camera: [0, 3.2, 12], target: [0, 0.3, 0], gridY: -2.6 },

  learn: `
    <h3>Same key, both ends</h3>
    <p>In <strong>symmetric</strong> encryption there is exactly one key. The sender locks with it,
    the receiver unlocks with it. AES is the symmetric cipher protecting your phone's storage,
    your Wi-Fi, and most of the data moving across the internet right now.</p>
    <p>It is fast — a modern processor encrypts gigabytes per second — and it is what Yaka uses.</p>

    <h3>The catch: how did they both get the key?</h3>
    <p>If the two parties can already talk securely, they don't need encryption. If they can't,
    how do they agree on a key without an eavesdropper hearing it? This is the
    <strong>key distribution problem</strong>, and it is the single hardest part of symmetric
    cryptography.</p>

    <div class="callout"><p>Watch the box travel across the channel below. The eavesdropper sees
    every byte of it and learns nothing. But if the key itself ever crossed that channel, the whole
    scheme would collapse.</p></div>

    <h3>How Yaka dodges it</h3>
    <p>A Yaka meter never receives its key over any channel. The key is put into the meter's memory
    when the meter is commissioned, and the vending system <em>re-derives the same key</em> from a
    master secret it already holds. Nothing secret is ever transmitted. We build exactly this in
    <strong>Lesson 7</strong>.</p>

    <h3>Try this</h3>
    <ol>
      <li>Press <strong>Send</strong> with both keys matching — the lock opens.</li>
      <li>Change the meter's key by one character and send again — the lock stays shut.
      There is no partial credit in cryptography.</li>
      <li>Press <strong>Let the eavesdropper try</strong>. They have the ciphertext and unlimited
      patience, and it does not help.</li>
    </ol>
  `,

  build({ stage, ui }) {
    const tl = new Timeline(stage);

    // ── Two endpoints ──────────────────────────────────────────────────
    const makeParty = (x, title, sub, color) => {
      const g = new THREE.Group();
      g.position.set(x, 0, 0);
      const pad = makeBox(2.8, 0.3, 2.0, 0x282a30, { wireColor: color, wireOpacity: 0.35 });
      pad.position.y = -1.3;
      const tower = makeShell(1.7, 2.0, 1.2, color, 0.08);
      tower.position.y = -0.15;
      const t1 = makeLabel(title, { height: 0.24, color: '#ffffff', weight: 700 });
      t1.position.y = 1.3;
      const t2 = makeLabel(sub, { height: 0.17, color: '#a19e96' });
      t2.position.y = 1.02;
      g.add(pad, tower, t1, t2);
      stage.add(g);
      return g;
    };

    const vendor = makeParty(-4.6, 'VENDING SERVER', 'holds the key', PAL.cyan);
    const meter  = makeParty(4.6, 'METER', 'holds the key', PAL.green);

    const keyA = makeKeyIcon(PAL.amber);
    keyA.position.set(-4.9, -0.1, 0.9); keyA.scale.setScalar(0.85);
    const keyB = makeKeyIcon(PAL.amber);
    keyB.position.set(4.3, -0.1, 0.9); keyB.scale.setScalar(0.85);
    stage.add(keyA, keyB);

    // ── The channel ────────────────────────────────────────────────────
    const channel = makeConduit([-3.4, -0.1, 0], [3.4, -0.1, 0], PAL.steel);
    stage.add(channel);
    const chLabel = makeLabel('UNTRUSTED CHANNEL  ·  anyone can read what crosses here',
      { height: 0.17, mono: true, color: '#86837b' });
    chLabel.position.set(0, -0.7, 0);
    stage.add(chLabel);

    // eavesdropper
    const eve = new THREE.Group();
    const eyeBall = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 18),
      new THREE.MeshStandardMaterial({ color: 0x2a1a24, roughness: 0.4 }));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 14),
      new THREE.MeshStandardMaterial({ color: PAL.red, emissive: PAL.red, emissiveIntensity: 1.1 }));
    pupil.position.z = 0.22;
    eve.add(eyeBall, pupil, makeGlow(PAL.red, 1.1));
    eve.position.set(0, -2.0, 1.3);
    const eveLabel = makeLabel('eavesdropper', { height: 0.17, mono: true, color: '#f3a19c' });
    eveLabel.position.set(0, -2.5, 1.3);
    stage.add(eve, eveLabel);

    // ── The travelling box ─────────────────────────────────────────────
    const parcel = new THREE.Group();
    const crate = makeBox(0.9, 0.7, 0.7, 0x30333a, { wireColor: PAL.amber, wireOpacity: 0.7 });
    const lock = makeLock(PAL.amber);
    lock.group.position.set(0, 0, 0.42);
    lock.group.scale.setScalar(0.6);
    const parcelText = makeLabel('', { height: 0.2, mono: true, color: '#ffd9a0' });
    parcelText.position.y = 0.72;
    parcel.add(crate, lock.group, parcelText);
    parcel.visible = false;
    stage.add(parcel);

    // ── State ──────────────────────────────────────────────────────────
    let phraseA = 'umeme-2024', phraseB = 'umeme-2024';
    let payload = '45.0 kWh for meter 04122334455';

    const keysMatch = () => phraseA === phraseB;

    const syncKeys = () => {
      const kA = keyFromPhrase(phraseA), kB = keyFromPhrase(phraseB);
      rKeyA.set(blockHex(kA));
      rKeyB.set(blockHex(kB), keysMatch() ? 'ok' : 'err');
      rMatch.set(keysMatch() ? 'IDENTICAL — they can talk' : 'DIFFERENT — they cannot',
                 keysMatch() ? 'ok' : 'err');
      const c = keysMatch() ? PAL.amber : PAL.red;
      keyB.traverse(o => { if (o.material?.color && o.type === 'Mesh') o.material.color.setHex(c); });
      ui.data({
        'vendor phrase': JSON.stringify(phraseA),
        'meter phrase': JSON.stringify(phraseB),
        'vendor key (64-bit)': blockHex(kA),
        'meter key (64-bit)': blockHex(kB),
        'match': keysMatch() ? 'yes' : 'no',
        'payload': JSON.stringify(payload),
        'note': 'A one-character difference gives a completely unrelated key.'
      });
    };

    let busy = false;
    const send = () => {
      if (busy) return;
      busy = true;
      log.add('Vendor locks the payload with its key…', 'cy');
      parcel.visible = true;
      parcel.position.set(-4.6, -0.1, 0);
      parcelText.setText('locked');
      lock.setOpen(0);
      lock.setColor(PAL.amber);
      crate.children[0].material.color.setHex(PAL.amber);

      tl.run(2.4, (u) => {
        const e = easeInOut(u);
        parcel.position.x = -4.6 + e * 9.2;
        parcel.position.y = -0.1 + Math.sin(u * Math.PI) * 0.55;
        parcel.rotation.y = u * Math.PI * 1.5;
        if (u > 0.42 && u < 0.58) pupil.material.emissiveIntensity = 2.6;
        else pupil.material.emissiveIntensity = 1.1;
      }, () => {
        log.add('Eavesdropper saw the whole thing and learned nothing.', 'am');
        if (keysMatch()) {
          log.add('Meter applies its key → lock opens.', 'ok');
          lock.setColor(PAL.green);
          crate.children[0].material.color.setHex(PAL.green);
          tl.run(0.6, (u) => lock.setOpen(u), () => {
            parcelText.setText(payload);
            rResult.set('OPENED — ' + esc(payload), 'ok');
            busy = false;
          });
        } else {
          log.add('Meter applies its key → nothing happens. Token rejected.', 'err');
          lock.setColor(PAL.red);
          crate.children[0].material.color.setHex(PAL.red);
          parcelText.setText('still locked');
          rResult.set('REJECTED — the keys do not match', 'err');
          tl.run(0.5, (u) => { parcel.position.x = 4.6 + Math.sin(u * 30) * 0.12 * (1 - u); },
            () => { busy = false; });
        }
      });
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('The shared secret');
    ui.text({ label: 'Vendor key phrase', value: phraseA,
      onInput: (v) => { phraseA = v; syncKeys(); } });
    const ctlB = ui.text({ label: 'Meter key phrase', value: phraseB,
      onInput: (v) => { phraseB = v; syncKeys(); } });
    const rKeyA  = ui.readout('Vendor key', '—');
    const rKeyB  = ui.readout('Meter key', '—');
    const rMatch = ui.readout('Comparison', '—');

    ui.section('Send a token across');
    ui.text({ label: 'Payload', value: payload, mono: false,
      onInput: (v) => { payload = v; syncKeys(); } });
    ui.button('▶  Send across the channel', send);
    const rResult = ui.readout('Result at the meter', '—');

    ui.section('Attack');
    ui.button('Let the eavesdropper try', () => {
      log.add('Eavesdropper has the ciphertext and no key.', 'am');
      log.add('Brute force over a 64-bit key: 1.8 × 10^19 guesses.', 'am');
      log.add('At 1 billion guesses/second that is ~584 years.', 'err');
      rResult.set('Eavesdropper still has nothing.', 'am');
    }, { variant: 'warn' });
    ui.button('Break the meter\'s key', () => ctlB.set(phraseA + 'x'), { variant: 'danger' });
    ui.button('Re-sync both keys', () => ctlB.set(phraseA), { variant: 'ghost' });

    ui.section('Log');
    const log = ui.log();

    stage.onTick((dt, t) => {
      keyA.userData.tick(dt, t);
      keyB.userData.tick(dt, t + 0.7);
      lock.group.rotation.y = Math.sin(t * 1.4) * 0.3;
      eve.rotation.z = Math.sin(t * 0.9) * 0.1;
      if (parcel.visible && !busy) parcel.position.y = -0.1 + Math.sin(t * 2) * 0.05;
    });

    syncKeys();
    log.add('Both sides start with the same key.', 'ok');
  }
};
