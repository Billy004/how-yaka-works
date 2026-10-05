import { PAL, THREE, makeLabel, makeBitField, makeGlow, makeFlow, linePath, mat } from '../scene.js';
import { makeCharStrip } from '../viz.js';
import { sha256, bitDistance } from '../crypto/sha256.js';

export default {
  id: 'l04', act: 1, num: 4,
  title: 'Hashing: the one-way door',
  subtitle: 'Any amount of data in, a fixed fingerprint out — and no way back.',
  stageOpts: { camera: [0, 0.4, 11.5], target: [0, -0.2, 0], gridY: -5.4 },

  learn: `
    <h3>Not encryption — a fingerprint</h3>
    <p>A <strong>hash function</strong> takes input of any length and produces a fixed-size
    <strong>digest</strong>. SHA-256 always gives 256 bits, whether you feed it one letter or a
    feature film. There is no key, and crucially <em>there is no way back</em>.</p>

    <h3>The three properties that matter</h3>
    <table class="kv">
      <tr><td>Deterministic</td><td>The same input always gives the same digest. Always.</td></tr>
      <tr><td>One-way</td><td>Given a digest, you cannot compute the input. The only attack is
      guessing inputs until one matches.</td></tr>
      <tr><td>Collision-resistant</td><td>Finding two different inputs with the same digest is
      computationally infeasible.</td></tr>
    </table>

    <h3>Avalanche, again</h3>
    <p>Change one character — even one bit — and roughly half the 256 output bits flip. That is
    what makes a hash a useful <em>integrity check</em>: if a single byte of a message is altered
    in transit, the digest is unrecognisably different, and the tampering is obvious.</p>

    <div class="callout cy"><p>Hashes are why you never need to store a password. Store the digest.
    When someone logs in, hash what they typed and compare digests. A stolen database gives the
    thief fingerprints, not passwords.</p></div>

    <h3>Where this leads</h3>
    <p>Hashing on its own proves <em>nothing changed</em>. It does not prove <em>who</em> sent it —
    an attacker who alters a message can simply recompute the digest. Pair a hash with a private
    key and you get a <strong>digital signature</strong>, which proves both. That is Lesson 6.</p>

    <p>In Act III you will meet the Yaka token's <strong>CRC</strong>, a much smaller relative of a
    hash. It catches typos on a keypad, not attackers — the encryption does the security work.</p>
  `,

  build({ stage, ui }) {
    const input = makeCharStrip({ max: 26, tile: 0.3, gap: 0.05, color: 0x16202e });
    input.group.position.set(0, 3.6, 0);
    stage.add(input.group);
    const inLabel = makeLabel('INPUT — any length at all', { height: 0.2, color: '#9fb0c8' });
    inLabel.position.set(0, 4.15, 0);
    stage.add(inLabel);

    // funnel
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 0.45, 2.2, 28, 1, true),
      new THREE.MeshStandardMaterial({
        color: PAL.cyan, transparent: true, opacity: 0.13,
        side: THREE.DoubleSide, roughness: 0.3, metalness: 0.4
      })
    );
    funnel.position.y = 1.9;
    const funnelWire = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 0.45, 2.2, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: PAL.cyan, wireframe: true, transparent: true, opacity: 0.16 })
    );
    funnelWire.position.y = 1.9;
    stage.add(funnel, funnelWire);

    const throat = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 32),
      new THREE.MeshBasicMaterial({ color: PAL.cyan }));
    throat.rotation.x = Math.PI / 2;
    throat.position.y = 0.78;
    const throatGlow = makeGlow(PAL.cyan, 1.8);
    throatGlow.position.set(0, 0.78, 0);
    stage.add(throat, throatGlow);

    const oneWay = makeLabel('SHA-256  ·  one way only', { height: 0.19, mono: true, color: '#7bffe8' });
    oneWay.position.set(2.4, 0.9, 0);
    stage.add(oneWay);

    const inFlow = makeFlow(linePath([0, 3.2, 0], [0, 0.9, 0]), 20, PAL.cyan, 0.06);
    inFlow.speed = 0.5;
    const outFlow = makeFlow(linePath([0, 0.65, 0], [0, -0.6, 0]), 8, PAL.violet, 0.06);
    outFlow.speed = 0.5;
    stage.add(inFlow.group, outFlow.group);

    // 256-bit digest
    const field = makeBitField(256, 16, { gap: 0.185, size: 0.125 });
    field.group.position.set(0, -2.1, 0);
    stage.add(field.group);
    const outLabel = makeLabel('DIGEST — always exactly 256 bits', { height: 0.2, color: '#c9a8e8' });
    outLabel.position.set(0, -3.75, 0);
    stage.add(outLabel);

    // ── State ──────────────────────────────────────────────────────────
    let msg = 'Yaka token for meter 04122334455';
    let prevBytes = null;

    const render = (announceDiff = true) => {
      const h = sha256(msg);
      const bits = [...h.bytes].map(b => b.toString(2).padStart(8, '0')).join('');
      field.set(bits);

      input.set(msg.slice(0, 26));

      let diffTxt = '—', kind = '';
      if (prevBytes && announceDiff) {
        const d = bitDistance(prevBytes, h.bytes);
        diffTxt = `${d} of 256 bits  ·  ${(d / 256 * 100).toFixed(1)}%`;
        kind = d === 0 ? '' : (d > 100 && d < 156) ? 'ok' : 'am';
        if (d === 0) diffTxt = 'identical — same input, same digest';
      }
      rDiff.set(diffTxt, kind);
      prevBytes = h.bytes;

      rHex.set(h.hex.match(/.{16}/g).join('<br>'));
      rLen.set(`input ${new TextEncoder().encode(msg).length} bytes  →  digest 32 bytes`);
      bitsOut.set(bits.slice(0, 64));

      ui.data({
        'input': JSON.stringify(msg),
        'input bytes': String(new TextEncoder().encode(msg).length),
        'sha-256': h.hex,
        'digest bytes': '32 (fixed, always)',
        'first 64 bits': bits.slice(0, 64).match(/.{8}/g).join(' '),
        'compression rounds': '64 per 512-bit block',
        'note': 'Computed in-page by js/crypto/sha256.js — no library, no network.'
      });
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('Input');
    const msgCtl = ui.textarea({
      label: 'Message <span class="hint">— any length</span>', value: msg, rows: 3,
      onInput: (v) => { msg = v; render(); }
    });
    ui.buttonRow([
      { label: 'Add a full stop', variant: 'ghost', onClick: () => msgCtl.set(msg + '.') },
      { label: 'Change one letter', variant: 'ghost', onClick: () => {
          if (!msg.length) return;
          const i = Math.floor(Math.random() * msg.length);
          const c = msg[i];
          const swapped = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
          msgCtl.set(msg.slice(0, i) + (swapped === c ? (c === 'a' ? 'b' : 'a') : swapped) + msg.slice(i + 1));
        } }
    ]);

    ui.section('Digest');
    const rHex = ui.readout('SHA-256', '—');
    const rLen = ui.readout('Sizes', '—');
    const rDiff = ui.readout('Bits changed since your last edit', '—');

    ui.section('First 64 bits');
    const bitsOut = ui.bits(null, 64);

    ui.section('Probe it');
    ui.button('Hash the same thing again', () => {
      render(true);
      rDiff.set('identical — hashing is deterministic', 'ok');
    }, { variant: 'ghost' });

    ui.button('Try to reverse the digest', () => {
      rDiff.set('Impossible by design.', 'err');
      ui.data({
        'goal': 'find an input whose SHA-256 equals the digest above',
        'method': 'the only known approach is to guess inputs and hash them',
        'search space': '2^256 ≈ 1.16 × 10^77 possible digests',
        'comparison': 'roughly the number of atoms in a billion billion Milky Ways',
        'at 10^12 hashes/sec': '~3.7 × 10^57 years',
        'age of the universe': '1.4 × 10^10 years',
        'conclusion': 'A hash is not "hard to reverse". It is not reversible. The information is gone.'
      });
    }, { variant: 'danger' });
    ui.note('Open the <strong>Data</strong> tab after pressing that.');

    ui.button('Show a collision attempt', () => {
      const a = sha256(msg), b = sha256(msg + ' ');
      rHex.set(`${a.hex.slice(0, 32)}…<br>${b.hex.slice(0, 32)}…`);
      rDiff.set(`${bitDistance(a.bytes, b.bytes)} of 256 bits differ — from adding one space`, 'ok');
    }, { variant: 'warn' });

    stage.onTick((dt, t) => {
      input.tick(dt, t);
      field.tick(dt);
      inFlow.tick(dt); outFlow.tick(dt);
      funnelWire.rotation.y += dt * 0.15;
      throat.rotation.z = t * 1.2;
      field.group.rotation.y = Math.sin(t * 0.28) * 0.07;
    });

    render(false);
  }
};
