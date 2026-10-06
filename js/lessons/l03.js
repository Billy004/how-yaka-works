import { PAL, THREE, makeLabel, makeBitField, makeGlow, makeFlow, linePath } from '../scene.js';
import {
  encryptBlock, decryptBlock, keyFromPhrase, fromBig, toBig,
  blockBits, blockHex, blockDistance, ROUNDS
} from '../crypto/cipher.js';

export default {
  id: 'l03', act: 1, num: 3,
  title: 'Inside a block cipher',
  subtitle: 'Rounds of substitution and diffusion, until one changed input bit changes half the output.',
  stageOpts: { camera: [0, 0.6, 12.5], target: [0, 0, 0], gridY: -5.2, maxDistance: 26 },

  learn: `
    <h3>Real ciphers work on blocks, not letters</h3>
    <p>Lesson 1's XOR cipher changed one output character per input character — it leaked the shape
    of the message. A real cipher takes a fixed <strong>block</strong> of bits (64 here, 128 in AES)
    and scrambles the whole block together, so every output bit depends on every input bit.</p>

    <h3>Two jobs, repeated</h3>
    <table class="kv">
      <tr><td>Confusion</td><td>Hide the relationship between key and ciphertext. Done with an
      <strong>S-box</strong> — a lookup table that replaces each byte with an unrelated one.</td></tr>
      <tr><td>Diffusion</td><td>Spread each input bit's influence across the whole block. Done by
      rotating and XOR-ing bits into new positions.</td></tr>
    </table>
    <p>Neither is enough alone. Doing both, over and over, is what makes a cipher strong. Each
    pass is a <strong>round</strong>. This cipher uses ${ROUNDS}; AES-128 uses 10.</p>

    <h3>The avalanche effect</h3>
    <p>The goal is that flipping <em>one</em> input bit flips about <strong>half</strong> of the
    output bits — 32 of our 64 — with no visible pattern. If an attacker could see that similar
    inputs give similar outputs, they could work backwards toward the key.</p>

    <div class="callout cy"><p>Drag the <strong>rounds</strong> slider from 1 upward and watch the
    red "changed bits" count climb. At one round the change barely spreads. By round 6 it is
    total. That climb is the entire security argument for a block cipher, visible in one control.</p></div>

    <h3>Feistel structure</h3>
    <p>The block is split into two halves, L and R. Each round computes
    <code>L' = R</code> and <code>R' = L XOR F(R, roundKey)</code>. The clever part: this is
    reversible <em>whatever</em> F does, so F can be as messy as you like. Decryption is the same
    machine run backwards — which is why the <strong>Decrypt</strong> button returns your exact
    input block.</p>

    <div class="callout"><p>This is a teaching cipher, not a production one. The real STS algorithm
    used by Yaka meters is a licensed design, but it is built from these same two moves.</p></div>
  `,

  build({ stage, ui }) {
    // ── Bit fields ─────────────────────────────────────────────────────
    const inField  = makeBitField(64, 16, { gap: 0.3, size: 0.2 });
    const outField = makeBitField(64, 16, { gap: 0.3, size: 0.2 });
    inField.group.position.set(0, 3.5, 0);
    outField.group.position.set(0, -3.5, 0);
    stage.add(inField.group, outField.group);

    const inLabel = makeLabel('INPUT BLOCK — 64 bits', { height: 0.2, color: '#b3b0a8' });
    inLabel.position.set(0, 4.35, 0);
    stage.add(inLabel);
    const outLabel = makeLabel('OUTPUT BLOCK', { height: 0.2, color: '#b3b0a8' });
    outLabel.position.set(0, -4.35, 0);
    stage.add(outLabel);

    // ── Round stack ────────────────────────────────────────────────────
    const roundGroup = new THREE.Group();
    const roundMeshes = [];
    const ringGeo = new THREE.TorusGeometry(0.85, 0.05, 8, 48);
    for (let i = 0; i < ROUNDS; i++) {
      const y = 2.0 - (i / (ROUNDS - 1)) * 4.0;
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: PAL.steel, transparent: true, opacity: 0.55
      }));
      r.rotation.x = Math.PI / 2;
      r.position.y = y;
      const lbl = makeLabel(`R${i + 1}`, { height: 0.15, mono: true, color: '#7f7c74' });
      lbl.position.set(1.45, y, 0);
      roundGroup.add(r, lbl);
      roundMeshes.push({ ring: r, label: lbl, y });
    }
    stage.add(roundGroup);

    const spine = makeFlow(linePath([0, 2.7, 0], [0, -2.7, 0]), 22, PAL.cyan, 0.07);
    spine.speed = 0.35;
    stage.add(spine.group);

    const core = makeGlow(PAL.cyan, 2.2);
    stage.add(core);

    // ── State ──────────────────────────────────────────────────────────
    let blockBig = 0x0123456789abcdefn;
    let key = keyFromPhrase('umeme-2024');
    let rounds = ROUNDS;
    let flipBit = 0;
    let dir = 'enc';

    const diffCells = (field, bitsA, bitsB) => {
      let n = 0;
      for (let i = 0; i < 64; i++) {
        if (bitsA[i] !== bitsB[i]) {
          n++;
          field.cells[i].material.color.setHex(PAL.red);
          field.cells[i].material.emissive.setHex(PAL.red);
          field.cells[i].material.emissiveIntensity = 1.5;
          field.cells[i].scale.setScalar(1.3);
        }
      }
      return n;
    };

    const render = () => {
      const blk = fromBig(blockBig & 0xFFFFFFFFFFFFFFFFn);
      const op = dir === 'enc' ? encryptBlock : decryptBlock;
      const out = op(blk, key, { rounds });

      // the same block with one bit flipped
      const flipped = fromBig((blockBig ^ (1n << BigInt(63 - flipBit))) & 0xFFFFFFFFFFFFFFFFn);
      const outFlipped = op(flipped, key, { rounds });

      const bIn = blockBits(blk), bOut = blockBits(out), bOut2 = blockBits(outFlipped);

      inField.set(bIn, { markChanges: false });
      // mark the bit we are flipping
      inField.cells[flipBit].material.color.setHex(PAL.amber);
      inField.cells[flipBit].material.emissive.setHex(PAL.amber);
      inField.cells[flipBit].material.emissiveIntensity = 1.8;
      inField.cells[flipBit].scale.setScalar(1.45);

      outField.set(bOut, { markChanges: false });
      const changed = diffCells(outField, bOut, bOut2);
      const share = changed / 64;

      outLabel.setText(dir === 'enc' ? 'CIPHERTEXT BLOCK' : 'DECRYPTED BLOCK');

      // round rings light up to the active round count
      roundMeshes.forEach((r, i) => {
        const on = i < rounds;
        r.ring.material.color.setHex(on ? PAL.cyan : PAL.steel);
        r.ring.material.opacity = on ? 0.85 : 0.25;
        r.ring.scale.setScalar(on ? 1 : 0.7);
      });
      spine.setColor(dir === 'enc' ? PAL.cyan : PAL.green);

      rOut.set(blockHex(out));
      rChanged.set(`${changed} of 64 bits  ·  ${(share * 100).toFixed(1)}%`,
        share > 0.4 && share < 0.6 ? 'ok' : share > 0.2 ? 'am' : 'err');
      rVerdict.set(
        share > 0.4 ? 'Strong — one bit in, half the block out.'
        : share > 0.2 ? 'Spreading, but an attacker could still see structure.'
        : 'Weak — the change barely moved. Add rounds.',
        share > 0.4 ? 'ok' : share > 0.2 ? 'am' : 'err');

      bitsOut.set(bOut);
      rRound.set(`${rounds} of ${ROUNDS}`);

      const back = decryptBlock(encryptBlock(blk, key, { rounds }), key, { rounds });
      rRound.set(`${rounds} of ${ROUNDS}  ·  round-trip ${
        toBig(back) === (blockBig & 0xFFFFFFFFFFFFFFFFn) ? 'exact ✓' : 'BROKEN ✗'}`);

      ui.data({
        'input': blockHex(blk),
        'input bits': bIn.match(/.{8}/g).join(' '),
        'key': blockHex(key),
        'rounds': String(rounds),
        'output': blockHex(out),
        'output bits': bOut.match(/.{8}/g).join(' '),
        'flip bit': `#${flipBit}`,
        'flipped in': blockHex(flipped),
        'flipped out': blockHex(outFlipped),
        'bits changed': `${changed} / 64 (${(share * 100).toFixed(1)}%)`,
        'round-trip': toBig(back) === (blockBig & 0xFFFFFFFFFFFFFFFFn) ? 'decrypt(encrypt(x)) === x' : 'FAILED'
      });
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('Input');
    const blkCtl = ui.text({
      label: 'Block <span class="hint">— 16 hex digits</span>',
      value: '0123456789abcdef', maxlength: 16,
      onInput: (v) => {
        const clean = v.replace(/[^0-9a-fA-F]/g, '').padEnd(16, '0').slice(0, 16);
        blockBig = BigInt('0x' + clean);
        blkCtl.bad(v.replace(/[^0-9a-fA-F]/g, '').length !== v.length);
        render();
      }
    });
    ui.text({ label: 'Key phrase', value: 'umeme-2024',
      onInput: (v) => { key = keyFromPhrase(v); render(); } });

    ui.section('The machine');
    ui.slider({ label: 'Rounds', min: 1, max: ROUNDS, value: ROUNDS,
      format: (v) => `${v}`, onInput: (v) => { rounds = v; render(); } });
    ui.chips({
      options: [{ label: 'Encrypt', value: 'enc' }, { label: 'Decrypt', value: 'dec' }],
      value: 'enc', onChange: (v) => { dir = v; render(); }
    });
    const rOut   = ui.readout('Output block', '—');
    const rRound = ui.readout('Rounds applied', '—');

    ui.section('Avalanche test');
    ui.slider({ label: 'Flip input bit #', min: 0, max: 63, value: 0,
      format: (v) => `#${v}`, onInput: (v) => { flipBit = v; render(); } });
    const rChanged = ui.readout('Output bits that changed', '—');
    const rVerdict = ui.readout('Verdict', '—');
    ui.note('Red cells in the 3D view are the output bits that flipped because of that single ' +
            'input-bit change.');

    ui.section('Output bits');
    const bitsOut = ui.bits(null, 64);

    ui.section('Presets');
    ui.buttonRow([
      { label: 'All zeros', variant: 'ghost', onClick: () => blkCtl.set('0000000000000000') },
      { label: 'All ones',  variant: 'ghost', onClick: () => blkCtl.set('ffffffffffffffff') }
    ]);
    ui.button('Sweep every bit and average the avalanche', () => {
      const blk = fromBig(blockBig);
      let total = 0;
      for (let i = 0; i < 64; i++) {
        const f = fromBig(blockBig ^ (1n << BigInt(63 - i)));
        total += blockDistance(encryptBlock(blk, key, { rounds }), encryptBlock(f, key, { rounds }));
      }
      const avg = total / 64;
      rVerdict.set(`Average over all 64 bits: ${avg.toFixed(1)} / 64 (${(avg / 64 * 100).toFixed(1)}%)`,
        avg > 28 ? 'ok' : 'am');
    }, { variant: 'warn' });

    stage.onTick((dt, t) => {
      inField.tick(dt); outField.tick(dt);
      spine.tick(dt);
      core.material.opacity = 0.25 + Math.sin(t * 3) * 0.1;
      roundMeshes.forEach((r, i) => {
        if (i < rounds) r.ring.rotation.z = t * (0.4 + i * 0.05);
      });
      inField.group.rotation.y = Math.sin(t * 0.3) * 0.06;
      outField.group.rotation.y = Math.sin(t * 0.3) * 0.06;
    });

    render();
  }
};
