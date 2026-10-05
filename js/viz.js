// Reusable 3D props. Act III leans on the meter models heavily, so they live
// here rather than being rebuilt in four lessons.

import {
  THREE, PAL, makeBox, makeShell, makeLabel, makeTextPlane, makeGlow, makeLine, mat
} from './scene.js';

/* ── A row of character tiles ──────────────────────────────────────────── */
export function makeCharStrip(opts = {}) {
  const n = opts.max ?? 22;
  const w = opts.tile ?? 0.42, gap = opts.gap ?? 0.07;
  const group = new THREE.Group();
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const t = new THREE.Group();
    const box = makeBox(w, w, 0.14, opts.color ?? 0x16202e, {
      roughness: 0.55, wireColor: opts.wireColor ?? PAL.cyan, wireOpacity: 0.3
    });
    const face = makeTextPlane(' ', {
      height: w * 0.62, mono: true, color: opts.textColor ?? '#e6edf7', weight: 600
    });
    face.position.z = 0.081;
    t.add(box, face);
    t.position.x = (i - (n - 1) / 2) * (w + gap);
    t.userData = { box, face, idx: i };
    group.add(t);
    tiles.push(t);
  }
  const api = {
    group, tiles,
    set(text, { highlight = -1, color } = {}) {
      const s = String(text);
      for (let i = 0; i < n; i++) {
        const has = i < s.length;
        tiles[i].visible = has;
        if (!has) continue;
        const ch = s[i];
        const code = ch.charCodeAt(0);
        const printable = code >= 32 && code <= 126;
        tiles[i].userData.face.setText(printable ? ch : '·');
        const c = color ?? (printable ? (opts.color ?? 0x16202e) : 0x3a1f2a);
        tiles[i].userData.box.material.color.setHex(i === highlight ? PAL.amber : c);
        tiles[i].userData.box.material.emissive.setHex(i === highlight ? 0x5a3a10 : 0x000000);
      }
      // keep the strip centred whatever the length
      const len = Math.min(s.length, n);
      for (let i = 0; i < n; i++) tiles[i].position.x = (i - (len - 1) / 2) * (w + gap);
    },
    tick(dt, t) {
      tiles.forEach((tile, i) => {
        if (!tile.visible) return;
        tile.position.y = Math.sin(t * 2 + i * 0.4) * 0.018;
      });
    }
  };
  return api;
}

/* ── The cipher engine: a glowing box with churning internals ──────────── */
export function makeEngine(label = 'CIPHER', color = PAL.cyan, size = [2.2, 1.7, 1.5]) {
  const group = new THREE.Group();
  const shell = makeShell(size[0], size[1], size[2], color, 0.07);
  group.add(shell);

  const core = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(0.42, 0.035, 8, 40);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55
    }));
    r.rotation.set(i * 1.1, i * 0.7, 0);
    r.scale.setScalar(1 - i * 0.22);
    core.add(r);
    rings.push(r);
  }
  const heart = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3 })
  );
  core.add(heart, makeGlow(color, 1.7));
  group.add(core);

  const cap = makeLabel(label, { height: 0.2, mono: true, color: '#0a1416',
    bg: `#${new THREE.Color(color).getHexString()}`, weight: 700 });
  cap.position.set(0, size[1] / 2 + 0.22, 0);
  group.add(cap);

  let spin = 1;
  return {
    group, shell, core, caption: cap,
    setColor(c) {
      shell.material.color.setHex(c);
      shell.children[0].material.color.setHex(c);
      rings.forEach(r => r.material.color.setHex(c));
      heart.material.color.setHex(c);
      heart.material.emissive.setHex(c);
    },
    setSpin(v) { spin = v; },
    tick(dt, t) {
      core.rotation.y += dt * 0.7 * spin;
      rings.forEach((r, i) => { r.rotation.x += dt * (0.5 + i * 0.35) * spin; });
      heart.scale.setScalar(1 + Math.sin(t * 5) * 0.12 * spin);
      shell.material.opacity = 0.055 + Math.sin(t * 2) * 0.02;
    }
  };
}

/* ── A key ─────────────────────────────────────────────────────────────── */
export function makeKeyIcon(color = PAL.amber, label = null) {
  const group = new THREE.Group();
  const m = mat(color, { metalness: 0.75, roughness: 0.28, emissive: color, emissiveIntensity: 0.22 });
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.075, 10, 26), m);
  head.rotation.y = Math.PI / 2;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.78, 12), m);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.5;
  group.add(head, shaft);
  for (let i = 0; i < 3; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.17, 0.075), m);
    tooth.position.set(0.62 + i * 0.13, -0.11, 0);
    group.add(tooth);
  }
  group.add(makeGlow(color, 1.05));
  if (label) {
    const l = makeLabel(label, { height: 0.17, mono: true, color: '#cfe3ff' });
    l.position.set(0.35, 0.42, 0);
    group.add(l);
  }
  group.userData.tick = (dt, t) => {
    group.rotation.y = Math.sin(t * 0.8) * 0.28;
    group.position.y += Math.sin(t * 1.6) * 0.0012;
  };
  return group;
}

/* ── A padlock that opens and closes ───────────────────────────────────── */
export function makeLock(color = PAL.cyan) {
  const group = new THREE.Group();
  const body = makeBox(0.62, 0.5, 0.3, color, { metalness: 0.6, roughness: 0.35, wire: false });
  const shackle = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.045, 8, 22, Math.PI),
    mat(0xc8d6e8, { metalness: 0.85, roughness: 0.25 })
  );
  shackle.position.y = 0.25;
  group.add(body, shackle);
  let open = 0;
  return {
    group, body,
    setOpen(v) { open = v; shackle.position.y = 0.25 + v * 0.2; shackle.rotation.z = v * 0.5; },
    setColor(c) { body.material.color.setHex(c); },
    get open() { return open; }
  };
}

/* ── Yaka hardware ─────────────────────────────────────────────────────────
   MCU: the sealed meter high on the pole. CIU: the keypad indoors. ───────── */

export function makeMCU() {
  const group = new THREE.Group();

  const body = makeBox(1.9, 2.5, 0.95, 0x243449, { roughness: 0.62, metalness: 0.25,
    wireColor: PAL.cyan, wireOpacity: 0.22 });
  group.add(body);

  // LCD
  const screen = makeBox(1.35, 0.62, 0.06, 0x08110f, { wire: false, roughness: 0.3 });
  screen.position.set(0, 0.62, 0.5);
  const screenText = makeTextPlane('0.0 kWh', { height: 0.24, mono: true, color: '#7bffe8', weight: 700 });
  screenText.position.set(0, 0.62, 0.54);
  group.add(screen, screenText);

  // status lamps
  const lampMeshes = {};
  [['power', -0.5, PAL.green], ['relay', 0, PAL.cyan], ['tamper', 0.5, PAL.red]].forEach(([k, x, c]) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.15 }));
    l.position.set(x, 0.05, 0.5);
    const g = makeGlow(c, 0.55);
    g.position.copy(l.position);
    g.position.z += 0.05;
    g.material.opacity = 0.1;
    group.add(l, g);
    lampMeshes[k] = { mesh: l, glow: g, color: c };
  });

  // terminal cover + screws
  const cover = makeBox(1.9, 0.78, 0.5, 0x1b2738, { roughness: 0.7, wireOpacity: 0.18 });
  cover.position.set(0, -1.0, 0.28);
  group.add(cover);
  for (const x of [-0.7, 0.7]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10),
      mat(0x8fa3bd, { metalness: 0.9, roughness: 0.3 }));
    s.rotation.x = Math.PI / 2;
    s.position.set(x, -1.0, 0.55);
    group.add(s);
  }

  // seal wire
  const seal = makeLine([[-0.7, -1.0, 0.58], [0, -1.2, 0.62], [0.7, -1.0, 0.58]], PAL.amber, 0.65);
  group.add(seal);

  const cap = makeLabel('MCU · Measurement Control Unit', { height: 0.2, color: '#9fb0c8' });
  cap.position.set(0, 1.62, 0);
  group.add(cap);

  const sub = makeLabel('sealed · pole-mounted · holds the Decoder Key', {
    height: 0.15, color: '#647a99'
  });
  sub.position.set(0, 1.38, 0);
  group.add(sub);

  const api = {
    group, body, screenText, cover, seal, lamps: lampMeshes, caption: cap,
    setScreen(t) { screenText.setText(t); },
    setLamp(name, on, intensity = 1.6) {
      const l = lampMeshes[name];
      if (!l) return;
      l.mesh.material.emissiveIntensity = on ? intensity : 0.12;
      l.glow.material.opacity = on ? 0.85 : 0.08;
    },
    setCoverOpen(v) {
      cover.position.z = 0.28 + v * 0.9;
      cover.rotation.x = -v * 0.65;
      seal.material.opacity = 0.65 * (1 - v);
    },
    tick(dt, t) {
      const pulse = 0.6 + Math.abs(Math.sin(t * 2)) * 0.4;
      Object.values(lampMeshes).forEach(l => {
        if (l.glow.material.opacity > 0.3) l.glow.scale.setScalar(0.55 * pulse * 1.3);
      });
    }
  };
  api.setLamp('power', true, 1.2);
  return api;
}

export function makeCIU() {
  const group = new THREE.Group();
  const body = makeBox(1.5, 2.0, 0.36, 0x2c3c52, { roughness: 0.6,
    wireColor: PAL.violet, wireOpacity: 0.26 });
  group.add(body);

  const screen = makeBox(1.18, 0.5, 0.05, 0x07120f, { wire: false });
  screen.position.set(0, 0.66, 0.2);
  const screenText = makeTextPlane('READY', { height: 0.2, mono: true, color: '#7bffe8', weight: 700 });
  screenText.position.set(0, 0.66, 0.235);
  group.add(screen, screenText);

  // 4 x 4 keypad
  const keys = [];
  const glyphs = ['1','2','3','4','5','6','7','8','9','←','0','↵'];
  glyphs.forEach((g, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const k = new THREE.Group();
    const kb = makeBox(0.3, 0.22, 0.09, 0x415872, { roughness: 0.55, wire: false });
    const kt = makeTextPlane(g, { height: 0.13, mono: true, color: '#dbe7f7', weight: 700 });
    kt.position.z = 0.05;
    k.add(kb, kt);
    k.position.set((col - 1) * 0.37, 0.16 - row * 0.3, 0.2);
    k.userData = { base: 0.2, mesh: kb, glyph: g };
    group.add(k);
    keys.push(k);
  });

  const cap = makeLabel('CIU · Customer Interface Unit', { height: 0.19, color: '#9fb0c8' });
  cap.position.set(0, 1.34, 0);
  group.add(cap);

  const press = [];
  return {
    group, screenText, keys, caption: cap,
    setScreen(t) { screenText.setText(t); },
    /** Visually press the key showing `glyph`. */
    press(glyph) {
      const k = keys.find(x => x.userData.glyph === glyph);
      if (k) press.push({ k, t: 0 });
    },
    tick(dt) {
      for (let i = press.length - 1; i >= 0; i--) {
        const p = press[i];
        p.t += dt * 6;
        const d = Math.sin(Math.min(p.t, Math.PI));
        p.k.position.z = p.k.userData.base - d * 0.05;
        p.k.userData.mesh.material.color.setHex(d > 0.2 ? PAL.cyan : 0x415872);
        if (p.t >= Math.PI) {
          p.k.position.z = p.k.userData.base;
          p.k.userData.mesh.material.color.setHex(0x415872);
          press.splice(i, 1);
        }
      }
    }
  };
}

/** Utility pole with a crossarm, to hang the MCU on. */
export function makePole(height = 6) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.22, height, 12),
    mat(0x4a3a2c, { roughness: 0.92, metalness: 0.02 })
  );
  pole.position.y = height / 2 - 2.2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.13, 0.13),
    mat(0x4a3a2c, { roughness: 0.92 }));
  arm.position.y = height - 2.5;
  group.add(pole, arm);
  for (const x of [-1.05, 0, 1.05]) {
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.2, 10),
      mat(0x6d7a88, { roughness: 0.4 }));
    ins.position.set(x, height - 2.33, 0);
    group.add(ins);
  }
  return group;
}

/** A simple house shell for the CIU to live in. */
export function makeHouse() {
  const group = new THREE.Group();
  const walls = makeBox(4.2, 2.6, 3.2, 0x1d2a3c, {
    opacity: 0.22, wireColor: PAL.violet, wireOpacity: 0.4,
    extra: { side: THREE.DoubleSide, depthWrite: false }
  });
  walls.position.y = -0.9;
  const roofGeo = new THREE.ConeGeometry(3.2, 1.2, 4);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
    color: 0x2a3a52, roughness: 0.8, transparent: true, opacity: 0.4, side: THREE.DoubleSide
  }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.0;
  group.add(walls, roof);

  // a lamp inside that we can switch on when the relay closes
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0xfff0c2, emissive: 0xffdd88, emissiveIntensity: 0 }));
  bulb.position.set(1.1, 0.1, 0);
  const bglow = makeGlow(0xffd79a, 2.4);
  bglow.position.copy(bulb.position);
  bglow.material.opacity = 0;
  const light = new THREE.PointLight(0xffd79a, 0, 7);
  light.position.copy(bulb.position);
  group.add(bulb, bglow, light);

  return {
    group, walls,
    setPower(on, level = 1) {
      bulb.material.emissiveIntensity = on ? 1.7 * level : 0;
      bglow.material.opacity = on ? 0.8 * level : 0;
      light.intensity = on ? 9 * level : 0;
    }
  };
}

/** The 20-digit token, as five groups of four tiles. */
export function makeTokenDisplay(opts = {}) {
  const group = new THREE.Group();
  const w = opts.tile ?? 0.34;
  const tiles = [];
  for (let i = 0; i < 20; i++) {
    const g = Math.floor(i / 4);
    const t = new THREE.Group();
    const box = makeBox(w, w * 1.3, 0.1, 0x111c29, { wireColor: PAL.cyan, wireOpacity: 0.3 });
    const face = makeTextPlane('0', { height: w * 0.7, mono: true, color: '#e6edf7', weight: 700 });
    face.position.z = 0.06;
    t.add(box, face);
    t.position.x = (i - 9.5) * (w + 0.05) + g * 0.12 - 0.24;
    t.userData = { box, face };
    group.add(t);
    tiles.push(t);
  }
  return {
    group, tiles,
    set(digits, { from = 0, color = 0x111c29 } = {}) {
      const d = String(digits).padStart(20, '0').slice(-20);
      tiles.forEach((t, i) => {
        t.userData.face.setText(d[i]);
        t.userData.box.material.color.setHex(i >= from ? color : 0x111c29);
      });
    },
    highlight(fromIdx, toIdx, color = PAL.amber) {
      tiles.forEach((t, i) => {
        const on = i >= fromIdx && i <= toIdx;
        t.userData.box.material.emissive.setHex(on ? color : 0x000000);
        t.userData.box.material.emissiveIntensity = on ? 0.5 : 1;
      });
    },
    clearHighlight() {
      tiles.forEach(t => { t.userData.box.material.emissive.setHex(0x000000); });
    }
  };
}
