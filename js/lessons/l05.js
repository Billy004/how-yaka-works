import { PAL, THREE, makeLabel, makeShell, makeGlow, makeFlow, arcPath, linePath, makeBox }
  from '../scene.js';
import { makeKeyIcon } from '../viz.js';
import { makeKeyPair, randomKeyPair, encryptString, decryptString, factor, PRIMES } from '../crypto/rsa.js';
import { showRaw, esc } from '../ui.js';

export default {
  id: 'l05', act: 2, num: 5,
  title: 'Two keys instead of one',
  subtitle: 'Public-key cryptography: publish one half of the pair, and the distribution problem disappears.',
  stageOpts: { camera: [0, 2.6, 12.5], target: [0, 0.2, 0], gridY: -3.2 },

  learn: `
    <h3>The trick</h3>
    <p>Generate <em>two</em> mathematically linked keys. Anything locked with one can only be
    opened by the other. Then <strong>publish one of them</strong>.</p>
    <ul>
      <li><strong>Public key</strong> — hand it to anybody, print it on a billboard. Used to
      encrypt messages <em>to</em> you, or to verify signatures <em>from</em> you.</li>
      <li><strong>Private key</strong> — never leaves your machine. Used to decrypt what was sent
      to you, and to sign what you send.</li>
    </ul>
    <p>Lesson 2's problem — getting a shared secret to the other side — is gone. Nothing secret
    ever travels.</p>

    <h3>What makes it work</h3>
    <p>Some operations are easy one way and brutally hard backwards. Multiplying two large primes
    is instant. Taking the product and recovering the primes is not. RSA builds a key pair on
    exactly that gap:</p>
    <table class="kv">
      <tr><td><code>n = p × q</code></td><td>the modulus, public</td></tr>
      <tr><td><code>φ = (p−1)(q−1)</code></td><td>kept secret</td></tr>
      <tr><td><code>e</code></td><td>public exponent</td></tr>
      <tr><td><code>d = e⁻¹ mod φ</code></td><td>private exponent — needs φ, which needs p and q</td></tr>
    </table>
    <p>Encrypt: <code>c = mᵉ mod n</code>. Decrypt: <code>m = cᵈ mod n</code>. That is the
    whole algorithm, and the scene below is running it for real on your message.</p>

    <div class="callout rd"><p>The keys here are about 20 bits, so the <strong>Factor the
    modulus</strong> button breaks them in milliseconds. Real RSA uses 2048 bits — the same attack
    would take longer than the universe has existed. Key size is the <em>only</em> thing standing
    between those two outcomes.</p></div>

    <h3>The cost</h3>
    <p>Asymmetric encryption is hundreds of times slower than symmetric. So it is almost never used
    for bulk data. Instead it is used to <em>agree a symmetric key</em>, and then AES does the work.
    That is what happens every time you open an <code>https://</code> page.</p>
    <p>And it is why Yaka does <strong>not</strong> use it — a meter has a cheap microcontroller and
    an offline keypad. The next two lessons show what it uses instead.</p>
  `,

  build({ stage, ui }) {
    // ── Owner (right) with a vault ─────────────────────────────────────
    const owner = new THREE.Group();
    owner.position.set(4.3, 0, 0);
    const vault = makeShell(2.1, 2.3, 1.6, PAL.green, 0.08);
    const ownerLabel = makeLabel('OWNER', { height: 0.24, color: '#ffffff', weight: 700 });
    ownerLabel.position.y = 1.55;
    const ownerSub = makeLabel('keeps the private key', { height: 0.17, color: '#8fa3bd' });
    ownerSub.position.y = 1.28;
    owner.add(vault, ownerLabel, ownerSub);
    const privKey = makeKeyIcon(PAL.green, 'PRIVATE');
    privKey.scale.setScalar(0.9);
    owner.add(privKey);
    stage.add(owner);

    // ── The published public key, copied to three senders ──────────────
    const senders = [];
    [[-5.2, 1.9], [-5.8, -0.1], [-5.2, -2.1]].forEach(([x, y], i) => {
      const g = new THREE.Group();
      g.position.set(x, y, 0);
      const b = makeBox(1.0, 0.8, 0.8, 0x1b2738, { wireColor: PAL.cyan, wireOpacity: 0.4 });
      const l = makeLabel(['SENDER A', 'SENDER B', 'SENDER C'][i], { height: 0.16, color: '#9fb0c8' });
      l.position.y = 0.66;
      const pk = makeKeyIcon(PAL.cyan);
      pk.scale.setScalar(0.42);
      pk.position.set(-0.1, -0.62, 0.2);
      g.add(b, l, pk);
      g.userData.pk = pk;
      stage.add(g);
      senders.push(g);
    });

    const pubKey = makeKeyIcon(PAL.cyan, 'PUBLIC');
    pubKey.position.set(-0.4, 2.6, 0);
    pubKey.scale.setScalar(1.05);
    stage.add(pubKey);
    const pubNote = makeLabel('published — anyone may have a copy', { height: 0.18, color: '#7bffe8' });
    pubNote.position.set(0, 3.3, 0);
    stage.add(pubNote);

    // tether showing the pair is linked
    const tether = makeFlow(arcPath([0.1, 2.5, 0], [4.0, 0.1, 0], 0.7), 16, PAL.violet, 0.055);
    tether.speed = 0.22;
    stage.add(tether.group);
    const tetherLabel = makeLabel('mathematically linked · n = p × q',
      { height: 0.17, mono: true, color: '#b9a4f5' });
    tetherLabel.position.set(2.4, 2.1, 0);
    stage.add(tetherLabel);

    // distribution rays
    senders.forEach((s) => {
      const f = makeFlow(arcPath([-0.5, 2.5, 0], [s.position.x + 0.2, s.position.y - 0.5, 0], 0.5),
        7, PAL.cyan, 0.05);
      f.speed = 0.3;
      stage.add(f.group);
      s.userData.flow = f;
    });

    // the message in flight
    const msgFlow = makeFlow(arcPath([-4.6, -0.1, 0.4], [3.4, 0.1, 0.4], 1.5), 18, PAL.amber, 0.08);
    msgFlow.speed = 0.3;
    msgFlow.active = false;
    stage.add(msgFlow.group);
    const msgLabel = makeLabel('', { height: 0.2, mono: true, color: '#ffd9a0' });
    msgLabel.position.set(-0.6, 1.5, 0.4);
    stage.add(msgLabel);

    const vaultGlow = makeGlow(PAL.green, 2.6);
    vaultGlow.position.copy(owner.position);
    vaultGlow.material.opacity = 0.18;
    stage.add(vaultGlow);

    // ── State ──────────────────────────────────────────────────────────
    let kp = makeKeyPair(1013, 1019);
    let msg = 'Buy 50 units';

    const showKeys = () => {
      rPub.set(`n = ${kp.n}\ne = ${kp.e}`);
      rPriv.set(`n = ${kp.n}\nd = ${kp.d}`);
      rSize.set(`${kp.bits}-bit modulus  ·  real RSA uses 2048+`, kp.bits < 32 ? 'am' : 'ok');
      ui.data({
        'p (secret)': String(kp.p),
        'q (secret)': String(kp.q),
        'n = p·q (public)': String(kp.n),
        'phi = (p-1)(q-1)': String(kp.phi),
        'e (public)': String(kp.e),
        'd = e^-1 mod phi': String(kp.d),
        'modulus size': `${kp.bits} bits`,
        'public key': `(n=${kp.n}, e=${kp.e})`,
        'private key': `(n=${kp.n}, d=${kp.d})`
      });
    };

    const runRound = () => {
      const cipher = encryptString(msg, kp.pub);
      const back = decryptString(cipher, kp.priv);
      msgFlow.active = true;
      msgLabel.setText(cipher.slice(0, 4).map(String).join(' ') + (cipher.length > 4 ? ' …' : ''));
      rCipher.set(cipher.map(String).join(' '));
      rPlain.set(esc(showRaw(back)), back === msg ? 'ok' : 'err');
      log.add(`Sender encrypts "${msg}" with the PUBLIC key`, 'cy');
      log.add(`${cipher.length} numbers cross the network in the open`, '');
      log.add(`Owner decrypts with the PRIVATE key → "${back}"`, back === msg ? 'ok' : 'err');
      ui.data({
        'plaintext': JSON.stringify(msg),
        'per char': 'c = m^e mod n',
        'ciphertext': cipher.map(String).join(' '),
        'decrypt': 'm = c^d mod n',
        'recovered': JSON.stringify(back),
        'round trip': back === msg ? 'exact' : 'FAILED',
        'first char': `"${msg[0]}" = ${msg.codePointAt(0)} → ${cipher[0]} → ${Number(
          decryptString([cipher[0]], kp.priv).codePointAt(0))}`
      });
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('Key pair');
    ui.buttonRow([
      { label: 'Generate new pair', onClick: () => { kp = randomKeyPair(); showKeys(); log.add('New key pair generated.', 'cy'); } },
      { label: 'Small & weak', variant: 'warn', onClick: () => { kp = makeKeyPair(1009, 1013); showKeys(); } }
    ]);
    const rPub  = ui.readout('Public key — give this away', '—');
    const rPriv = ui.readout('Private key — never share', '—');
    const rSize = ui.readout('Strength', '—');

    ui.section('Send a message');
    ui.text({ label: 'Message', value: msg, mono: false, maxlength: 18,
      onInput: (v) => { msg = v.slice(0, 18); } });
    ui.button('▶  Encrypt with public → decrypt with private', runRound);
    const rCipher = ui.readout('Ciphertext (one number per character)', '—');
    const rPlain  = ui.readout('What the owner reads', '—');

    ui.section('Attack the key');
    ui.button('Factor the modulus', () => {
      log.add(`Attacking n = ${kp.n} by trial division…`, 'am');
      const f = factor(kp.n);
      if (!f) { log.add('Gave up — too large for this browser.', 'ok'); return; }
      const phi = (f.p - 1n) * (f.q - 1n);
      log.add(`Found p=${f.p}, q=${f.q} in ${f.steps} steps (${f.ms.toFixed(1)} ms)`, 'err');
      log.add('φ recovered → d recovered → private key is broken.', 'err');
      rPriv.set(`n = ${kp.n}\nd = ${kp.d}   ← RECOVERED BY THE ATTACKER`, 'err');
      ui.data({
        'attacked n': String(kp.n),
        'recovered p': String(f.p),
        'recovered q': String(f.q),
        'trial divisions': String(f.steps),
        'time taken': `${f.ms.toFixed(2)} ms`,
        'recovered phi': String(phi),
        'verdict': 'A 20-bit modulus falls instantly.',
        'scale up': 'RSA-2048 has ~2^1024 candidate factors. No computer that exists or is ' +
                    'planned will do this before the sun burns out.',
        'the lesson': 'The algorithm is not what protects you. The key size is.'
      });
    }, { variant: 'danger' });
    ui.note('Then read the <strong>Data</strong> tab.');

    ui.section('Log');
    const log = ui.log();

    stage.onTick((dt, t) => {
      pubKey.userData.tick(dt, t);
      privKey.userData.tick(dt, t + 1.2);
      privKey.position.y = Math.sin(t * 1.3) * 0.08;
      tether.tick(dt);
      msgFlow.tick(dt);
      senders.forEach((s, i) => {
        s.userData.flow.tick(dt);
        s.userData.pk.rotation.y = t * 0.6 + i;
        s.position.z = Math.sin(t * 0.8 + i * 1.4) * 0.12;
      });
      vaultGlow.material.opacity = 0.14 + Math.sin(t * 1.7) * 0.05;
      vault.material.opacity = 0.06 + Math.sin(t * 1.7) * 0.025;
    });

    showKeys();
    log.add('Public key published. Private key stays in the vault.', 'ok');
  }
};
