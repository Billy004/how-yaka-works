import { PAL, makeLabel, makeFlow, linePath } from '../scene.js';
import { makeCharStrip, makeEngine, makeKeyIcon } from '../viz.js';
import { xorString } from '../crypto/cipher.js';
import { showRaw, esc } from '../ui.js';

export default {
  id: 'l01', act: 1, num: 1,
  title: 'What encryption actually is',
  subtitle: 'Readable text goes in, unreadable text comes out — and a secret decides how.',
  stageOpts: { camera: [0, 1.2, 10.5], target: [0, 0, 0], gridY: -4.6 },

  learn: `
    <h3>The whole idea in one sentence</h3>
    <p>Encryption takes a message anyone can read (<strong>plaintext</strong>), mixes it with a
    <strong>key</strong>, and produces something nobody can read (<strong>ciphertext</strong>) —
    in a way that can be exactly undone by whoever holds the key.</p>

    <table class="kv">
      <tr><td>Plaintext</td><td>The original message. <code>Buy 50 units</code></td></tr>
      <tr><td>Key</td><td>The secret that controls the scrambling.</td></tr>
      <tr><td>Ciphertext</td><td>The scrambled output. Safe to send over anything.</td></tr>
      <tr><td>Decryption</td><td>Running the process backwards with the same key.</td></tr>
    </table>

    <h3>Why "scrambled" is not enough</h3>
    <p>Hiding a message by rearranging it is not encryption — anyone who works out the trick
    reads every message ever sent with it. Real encryption is designed so that the
    <em>method is public</em> and only the <em>key</em> is secret. This is
    <strong>Kerckhoffs's principle</strong>, and it is why the algorithms behind your bank card,
    and behind the Yaka meter on your wall, can be published openly without weakening them.</p>

    <div class="callout cy"><p>Everything in this course rests on that split:
    <strong>public method, secret key</strong>. Keep it in mind — in Act III it is exactly what
    lets a meter on a pole, with no internet connection, tell a genuine token from a fake one.</p></div>

    <h3>What you are looking at</h3>
    <p>The top row is your message, one tile per character. It falls into the cipher engine,
    where the key is applied, and comes out the bottom as ciphertext. Change the message or the
    key in <strong>Controls</strong> and watch the bottom row change.</p>

    <h3>Try this</h3>
    <ol>
      <li>Change one letter of the message. Notice only one output tile changes — this simple
      cipher leaks structure. Lesson 3 fixes that.</li>
      <li>Change one letter of the key. Notice the <em>whole</em> output changes.</li>
      <li>Press <strong>Decrypt</strong>. The same operation with the same key gives the message back.</li>
    </ol>
  `,

  build({ stage, ui }) {
    const plain  = makeCharStrip({ color: 0x23252a, wireColor: PAL.cyan });
    const cipher = makeCharStrip({ color: 0x2a2233, wireColor: PAL.violet, textColor: '#e6d6f5' });
    plain.group.position.y = 2.45;
    cipher.group.position.y = -2.45;
    stage.add(plain.group, cipher.group);

    const engine = makeEngine('XOR CIPHER', PAL.cyan, [2.6, 1.6, 1.4]);
    stage.add(engine.group);

    const key = makeKeyIcon(PAL.amber);
    key.position.set(-3.5, 0.1, 0.4);
    key.scale.setScalar(1.15);
    stage.add(key);
    const keyLabel = makeLabel('secret key', { height: 0.2, mono: true, color: '#ffd9a0' });
    keyLabel.position.set(-3.3, 0.85, 0.4);
    stage.add(keyLabel);

    const labIn  = makeLabel('PLAINTEXT — anyone can read this', { height: 0.2, color: '#b3b0a8' });
    labIn.position.set(0, 3.15, 0);
    const labOut = makeLabel('CIPHERTEXT — safe to send anywhere', { height: 0.2, color: '#cdb8e6' });
    labOut.position.set(0, -3.15, 0);
    stage.add(labIn, labOut);

    const inFlow  = makeFlow(linePath([0, 2.1, 0], [0, 0.85, 0]), 10, PAL.cyan, 0.075);
    const outFlow = makeFlow(linePath([0, -0.85, 0], [0, -2.1, 0]), 10, PAL.violet, 0.075);
    const keyFlow = makeFlow(linePath([-3.0, 0.1, 0.4], [-1.25, 0.1, 0.2]), 7, PAL.amber, 0.065);
    keyFlow.speed = 0.45;
    stage.add(inFlow.group, outFlow.group, keyFlow.group);

    let msg = 'Buy 50 units', k = 'yaka', mode = 'encrypt';

    const render = () => {
      const out = xorString(msg, k);
      const shown = mode === 'encrypt' ? out : xorString(out, k);
      plain.set(msg);
      cipher.set(mode === 'encrypt' ? showRaw(out) : shown,
                 { color: mode === 'encrypt' ? 0x2a2233 : 0x23252a });
      engine.setColor(mode === 'encrypt' ? PAL.cyan : PAL.green);
      engine.caption.setText(mode === 'encrypt' ? 'XOR CIPHER →' : '← XOR CIPHER');
      labOut.setText(mode === 'encrypt'
        ? 'CIPHERTEXT — safe to send anywhere'
        : 'RECOVERED PLAINTEXT — identical to the original');
      outFlow.setColor(mode === 'encrypt' ? PAL.violet : PAL.green);
      keyFlow.active = k.length > 0;
      engine.setSpin(k.length ? 1 : 0.1);

      rOut.set(out.length ? esc(showRaw(out)) : '—', k.length ? '' : 'err');
      rBytes.set(out.length
        ? [...out].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
        : '—');

      ui.data({
        'message': JSON.stringify(msg),
        'key': JSON.stringify(k),
        'plain hex': [...msg].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '),
        'key hex': [...k].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '),
        'cipher hex': [...out].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '),
        'operation': 'plain[i] XOR key[i mod keylen]',
        'recovered': JSON.stringify(xorString(out, k))
      });
    };

    ui.section('The message');
    ui.text({ label: 'Plaintext', value: msg, mono: false, maxlength: 22,
      onInput: (v) => { msg = v.slice(0, 22); render(); } });
    ui.text({ label: 'Key <span class="hint">— the only secret</span>', value: k, maxlength: 16,
      onInput: (v) => { k = v.slice(0, 16); render(); } });

    ui.section('Direction');
    ui.chips({
      options: [{ label: 'Encrypt →', value: 'encrypt' }, { label: '← Decrypt', value: 'decrypt' }],
      value: 'encrypt', onChange: (v) => { mode = v; render(); }
    });
    ui.callout('Notice that <strong>both directions are the same operation</strong>. XOR is its own ' +
               'inverse — apply it twice with the same key and you are back where you started.', 'cy');

    ui.section('Output');
    const rOut   = ui.readout('Ciphertext (· = unprintable byte)', '—');
    const rBytes = ui.readout('As raw bytes', '—');

    ui.section('Break it');
    ui.button('Use the wrong key to decrypt', () => {
      const wrong = k.slice(0, -1) + String.fromCharCode((k.charCodeAt(k.length - 1) || 97) + 1);
      const garbage = xorString(xorString(msg, k), wrong);
      rOut.set(esc(showRaw(garbage)), 'err');
      cipher.set(showRaw(garbage), { color: 0x3a1f2a });
      engine.setColor(PAL.red);
      ui.data({
        'correct key': JSON.stringify(k),
        'key used': JSON.stringify(wrong),
        'result': JSON.stringify(showRaw(garbage)),
        'verdict': 'One wrong character in the key destroys the entire message.'
      });
    }, { variant: 'danger' });
    ui.button('Reset', () => render(), { variant: 'ghost' });

    stage.onTick((dt, t) => {
      plain.tick(dt, t); cipher.tick(dt, t + 1.5);
      engine.tick(dt, t);
      inFlow.tick(dt); outFlow.tick(dt); keyFlow.tick(dt);
      key.userData.tick(dt, t);
    });

    render();
  }
};
