import { PAL, THREE, makeLabel, makeShell, makeBox, makeGlow, makeFlow, linePath, arcPath,
  Timeline, easeInOut } from '../scene.js';
import { makeCharStrip, makeKeyIcon } from '../viz.js';
import { makeKeyPair, signNum, verifyNum, digestToNum } from '../crypto/rsa.js';
import { sha256 } from '../crypto/sha256.js';

export default {
  id: 'l06', act: 2, num: 6,
  title: 'Digital signatures',
  subtitle: 'Hash it, sign the hash with the private key — now anyone can prove who sent it and that nothing changed.',
  stageOpts: { camera: [0, 1.4, 13], target: [0, 0.1, 0], gridY: -3.6 },

  learn: `
    <h3>Encryption backwards</h3>
    <p>Encryption uses the <em>public</em> key to lock and the <em>private</em> key to unlock.
    Signing does the opposite: the private key locks, and anyone with the public key can unlock.
    That is useless for secrecy — everyone can open it — but it proves something else entirely:
    <strong>only the holder of the private key could have produced this</strong>.</p>

    <h3>The three steps</h3>
    <ol>
      <li><strong>Hash.</strong> Run the message through SHA-256. You now have a 256-bit digest
      that is unique to this exact message.</li>
      <li><strong>Sign.</strong> Apply the private key to the digest: <code>s = hᵈ mod n</code>.
      That result is the signature. Attach it to the message.</li>
      <li><strong>Verify.</strong> The receiver applies the public key to the signature
      (<code>h' = sᵉ mod n</code>) and separately hashes the message they received. If
      <code>h' = h</code>, both facts are proven at once.</li>
    </ol>

    <table class="kv">
      <tr><td>Authenticity</td><td>Only the private key could produce a signature that opens with
      this public key.</td></tr>
      <tr><td>Integrity</td><td>Change one byte of the message and the recomputed hash no longer
      matches.</td></tr>
      <tr><td>Non-repudiation</td><td>The signer cannot later deny it — nobody else could have
      signed it.</td></tr>
    </table>

    <div class="callout cy"><p>Press <strong>Sign</strong>, then <strong>Tamper in transit</strong>.
    The attacker can change the message freely — but cannot produce a matching signature without
    the private key, so the forgery is caught every time.</p></div>

    <h3>Why hash first?</h3>
    <p>Two reasons. RSA can only sign numbers smaller than <code>n</code>, and a hash compresses any
    message to a fixed small size. And signing the whole message directly would be slow and would
    leak structure. Hash first, sign the hash — universally.</p>

    <div class="callout"><p>This is textbook RSA signing. Real implementations add a padding scheme
    (RSA-PSS) or use elliptic curves (ECDSA, Ed25519) where signing is <em>not</em> encryption at
    all — a detail that plain-English explanations usually skip.</p></div>
  `,

  build({ stage, ui }) {
    const tl = new Timeline(stage);

    const makeSide = (x, title, sub, color) => {
      const g = new THREE.Group();
      g.position.set(x, 0, 0);
      const shell = makeShell(2.2, 2.6, 1.5, color, 0.07);
      const t1 = makeLabel(title, { height: 0.23, color: '#fff', weight: 700 });
      t1.position.y = 1.7;
      const t2 = makeLabel(sub, { height: 0.16, color: '#8fa3bd' });
      t2.position.y = 1.44;
      g.add(shell, t1, t2);
      stage.add(g);
      return g;
    };

    const signer   = makeSide(-4.8, 'SIGNER', 'has the private key', PAL.amber);
    const verifier = makeSide(4.8, 'VERIFIER', 'has only the public key', PAL.cyan);

    const privKey = makeKeyIcon(PAL.amber);
    privKey.scale.setScalar(0.62); privKey.position.set(-0.25, -0.55, 0.5);
    signer.add(privKey);
    const pubKey = makeKeyIcon(PAL.cyan);
    pubKey.scale.setScalar(0.62); pubKey.position.set(-0.25, -0.55, 0.5);
    verifier.add(pubKey);

    // message + signature in transit
    const strip = makeCharStrip({ max: 20, tile: 0.26, gap: 0.04 });
    strip.group.position.set(0, 2.1, 0);
    stage.add(strip.group);
    const stripLabel = makeLabel('MESSAGE — travels in the clear', { height: 0.18, color: '#9fb0c8' });
    stripLabel.position.set(0, 2.62, 0);
    stage.add(stripLabel);

    const seal = new THREE.Group();
    const sealRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 10, 36),
      new THREE.MeshStandardMaterial({ color: PAL.amber, emissive: PAL.amber,
        emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.3 }));
    const sealText = makeLabel('SIG', { height: 0.17, mono: true, color: '#0d0a04', weight: 800 });
    const sealGlow = makeGlow(PAL.amber, 1.5);
    seal.add(sealRing, sealText, sealGlow);
    seal.position.set(-4.8, -0.2, 0.6);
    seal.visible = false;
    stage.add(seal);
    const sealNum = makeLabel('', { height: 0.17, mono: true, color: '#ffd9a0' });
    sealNum.position.set(0, -0.62, 0);
    seal.add(sealNum);

    // the two digests compared at the verifier
    const cmp = new THREE.Group();
    cmp.position.set(4.8, -2.3, 0);
    const bar = (y, label, color) => {
      const g = new THREE.Group();
      g.position.y = y;
      const b = makeBox(2.6, 0.34, 0.16, 0x101a26, { wireColor: color, wireOpacity: 0.5 });
      const l = makeLabel(label, { height: 0.15, mono: true, color: '#8fa3bd' });
      l.position.set(-1.85, 0, 0);
      const v = makeLabel('—', { height: 0.17, mono: true, color: '#e6edf7' });
      v.position.set(0, 0, 0.12);
      g.add(b, l, v);
      cmp.add(g);
      return { group: g, box: b, value: v };
    };
    const barA = bar(0.3, 'from signature', PAL.amber);
    const barB = bar(-0.25, 'hashed here', PAL.cyan);
    const verdict = makeLabel('awaiting a message', { height: 0.26, color: '#ffffff', weight: 700 });
    verdict.material.color.set('#647a99');
    verdict.position.set(0, -0.95, 0);
    cmp.add(verdict);
    stage.add(cmp);

    const msgFlow = makeFlow(linePath([-3.5, 2.1, 0], [3.5, 2.1, 0]), 14, PAL.cyan, 0.055);
    msgFlow.speed = 0.28;
    const sigFlow = makeFlow(arcPath([-3.6, -0.2, 0.6], [3.6, -0.2, 0.6], -0.9), 12, PAL.amber, 0.055);
    sigFlow.speed = 0.28;
    sigFlow.active = false;
    stage.add(msgFlow.group, sigFlow.group);

    // attacker
    const attacker = new THREE.Group();
    attacker.position.set(0, 0.9, 1.6);
    const ab = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshStandardMaterial({ color: 0x3a1f2a, emissive: PAL.red, emissiveIntensity: 0.25 }));
    const al = makeLabel('attacker', { height: 0.15, mono: true, color: '#ff9aa4' });
    al.position.y = 0.5;
    attacker.add(ab, al);
    stage.add(attacker);

    // ── State ──────────────────────────────────────────────────────────
    const kp = makeKeyPair(1301, 1303);
    let message = 'Credit 50 units';
    let sent = null;     // { message, signature }

    const digestOf = (m) => digestToNum(sha256(m).bytes, kp.n);

    const setVerdict = (state) => {
      if (state === 'ok') {
        verdict.setText('✓  SIGNATURE VALID');
        verdict.material.color.set('#4ade80');
        barA.box.material.color.setHex(0x0f2a1c);
        barB.box.material.color.setHex(0x0f2a1c);
      } else if (state === 'bad') {
        verdict.setText('✗  SIGNATURE INVALID');
        verdict.material.color.set('#ff5d6c');
        barA.box.material.color.setHex(0x2d1117);
        barB.box.material.color.setHex(0x2d1117);
      } else {
        verdict.setText('awaiting a message');
        verdict.material.color.set('#647a99');
        barA.box.material.color.setHex(0x101a26);
        barB.box.material.color.setHex(0x101a26);
      }
    };

    const doVerify = () => {
      if (!sent) { log.add('Nothing has been sent yet.', 'am'); return; }
      const recovered = verifyNum(sent.signature, kp.pub);   // s^e mod n
      const computed  = digestOf(sent.message);              // hash what actually arrived
      const ok = recovered === computed;

      barA.value.setText(String(recovered));
      barB.value.setText(String(computed));
      setVerdict(ok ? 'ok' : 'bad');
      strip.set(sent.message, { color: ok ? 0x16202e : 0x3a1f2a });

      rVerify.set(ok
        ? 'VALID — signed by the private key, unchanged in transit'
        : 'INVALID — the message or the signature was altered', ok ? 'ok' : 'err');
      log.add(ok ? 'Verification passed.' : 'Verification FAILED — forgery detected.', ok ? 'ok' : 'err');

      ui.data({
        'message received': JSON.stringify(sent.message),
        'sha-256': sha256(sent.message).hex,
        'h  = digest mod n': String(computed),
        'signature s': String(sent.signature),
        "h' = s^e mod n": String(recovered),
        'e (public)': String(kp.e),
        'n': String(kp.n),
        'match': ok ? "h' == h  →  VALID" : "h' != h  →  INVALID",
        'proves': ok ? 'authenticity + integrity + non-repudiation' : 'the message is not what was signed'
      });
    };

    const doSign = () => {
      const h = digestOf(message);
      const s = signNum(h, kp.priv);
      sent = { message, signature: s };
      seal.visible = true;
      sigFlow.active = true;
      sealNum.setText(String(s));
      strip.set(message);
      rSig.set(String(s));
      rHash.set(sha256(message).hex.slice(0, 32) + '…\nmod n → ' + h);
      log.add(`Hashed the message, signed the hash with the private key.`, 'cy');

      seal.position.set(-4.8, -0.2, 0.6);
      tl.run(1.6, (u) => {
        const e = easeInOut(u);
        seal.position.x = -4.8 + e * 9.6;
      }, doVerify);
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('Compose');
    const msgCtl = ui.text({ label: 'Message to sign', value: message, mono: false, maxlength: 20,
      onInput: (v) => { message = v.slice(0, 20); strip.set(message); } });
    ui.button('✍  Hash it, sign it, send it', doSign);
    const rHash = ui.readout('Digest', '—');
    const rSig  = ui.readout('Signature  s = h^d mod n', '—');

    ui.section('At the other end');
    ui.button('Verify what arrived', doVerify, { variant: 'ghost' });
    const rVerify = ui.readout('Result', '—');

    ui.section('Attacks');
    ui.button('Tamper with the message in transit', () => {
      if (!sent) { log.add('Send something first.', 'am'); return; }
      sent.message = sent.message.replace(/\d+/, (n) => String(Number(n) + 450)) ;
      if (sent.message === message) sent.message += '!';
      log.add(`Attacker rewrote the message to "${sent.message}"`, 'err');
      strip.set(sent.message, { color: 0x3a1f2a });
      msgCtl.setQuiet(sent.message);
      doVerify();
    }, { variant: 'danger' });

    ui.button('Forge a signature without the private key', () => {
      if (!sent) { log.add('Send something first.', 'am'); return; }
      sent.signature = (sent.signature + 1n) % kp.n;
      log.add('Attacker guesses a signature value…', 'err');
      sealNum.setText(String(sent.signature));
      doVerify();
      ui.data({
        'attacker has': 'the message, the signature, the public key (n, e)',
        'attacker needs': 'd, to produce s such that s^e mod n equals the digest',
        'finding d requires': 'factoring n — see Lesson 5',
        'guessing s directly': `1 chance in ${kp.n} per attempt at this toy key size`,
        'at RSA-2048': 'roughly 1 chance in 10^616',
        'result': 'Forgery is detected. Every time.'
      });
    }, { variant: 'danger' });

    ui.button('Reset', () => {
      sent = null; seal.visible = false; sigFlow.active = false;
      setVerdict(null);
      barA.value.setText('—'); barB.value.setText('—');
      rVerify.set('—'); rSig.set('—'); rHash.set('—');
      msgCtl.set('Credit 50 units');
      log.clear();
      log.add('Reset.', '');
    }, { variant: 'ghost' });

    ui.section('Log');
    const log = ui.log();

    stage.onTick((dt, t) => {
      strip.tick(dt, t);
      msgFlow.tick(dt); sigFlow.tick(dt);
      privKey.userData.tick(dt, t);
      pubKey.userData.tick(dt, t + 1);
      if (seal.visible) { sealRing.rotation.z = t * 1.6; seal.position.y = -0.2 + Math.sin(t * 2) * 0.09; }
      attacker.rotation.y += dt * 0.9;
      attacker.position.y = 0.9 + Math.sin(t * 1.5) * 0.12;
    });

    strip.set(message);
    setVerdict(null);
    log.add('Signer holds the private key. Verifier holds only the public key.', '');
    ui.data({
      'key pair': `n = ${kp.n}, e = ${kp.e}, d = ${kp.d}`,
      'note': 'Press Sign to run the three steps for real.'
    });
  }
};
