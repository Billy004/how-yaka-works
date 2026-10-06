// Reusable 3D props. Act III leans on the meter models heavily, so they live
// here rather than being rebuilt in four lessons.

import {
  THREE, PAL, makeBox, makeShell, makeLabel, makeTextPlane, makeGlow, makeLine, mat, roundedBox
} from './scene.js';

/* ── A row of character tiles ──────────────────────────────────────────── */
export function makeCharStrip(opts = {}) {
  const n = opts.max ?? 22;
  const w = opts.tile ?? 0.42, gap = opts.gap ?? 0.07;
  const group = new THREE.Group();
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const t = new THREE.Group();
    const box = makeBox(w, w, 0.14, opts.color ?? 0x23252a, {
      roughness: 0.55, wireColor: opts.wireColor ?? PAL.cyan, wireOpacity: 0.3
    });
    const face = makeTextPlane(' ', {
      height: w * 0.62, mono: true, color: opts.textColor ?? '#ebe9e4', weight: 600
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
        const c = color ?? (printable ? (opts.color ?? 0x23252a) : 0x3a1f2a);
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

/* ── The cipher engine: lettered rotors turning inside a glass case ────── */
// Rotor rims carry A–Z like an Enigma wheel: ink letters on ivory, plus an
// emissive copy so the letters pick up the engine's colour.
let rotorMaps = null;
function rotorTextures() {
  if (rotorMaps) return rotorMaps;
  const make = (bg, ink, tick) => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 1024, 128);
    const step = 1024 / 26;
    g.font = '600 46px "IBM Plex Mono", ui-monospace, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 26; i++) {
      const x = (i + 0.5) * step;
      g.fillStyle = tick;
      g.fillRect(Math.round(i * step), 0, 2, 128);
      g.save();
      g.translate(x, 64);
      g.rotate(Math.PI / 2);          // letters read upright on the rim facing the viewer
      g.fillStyle = ink;
      g.fillText(String.fromCharCode(65 + i), 0, 2);
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.userData.shared = true;
    return t;
  };
  rotorMaps = { map: make('#d9d3c7', '#2b2824', 'rgba(43,40,36,0.35)'), glow: make('#000', '#fff', 'rgba(0,0,0,0)') };
  return rotorMaps;
}

export function makeEngine(label = 'CIPHER', color = PAL.cyan, size = [2.2, 1.7, 1.5]) {
  const [W, H, D] = size;
  const group = new THREE.Group();
  const shell = makeShell(W, H, D, color, 0.07);
  group.add(shell);

  // the case sits on a machined plinth
  const plinth = makeBox(W * 1.04, 0.16, D * 1.04, 0x2a2c31, { wire: false, metalness: 0.55, roughness: 0.35 });
  plinth.position.y = -H / 2 - 0.08;
  group.add(plinth);

  const core = new THREE.Group();
  const { map, glow: glowMap } = rotorTextures();
  const R = Math.min(H, D) * 0.29, T = Math.min(W * 0.1, 0.24), pitch = T + 0.07;
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x9a948a, map, roughness: 0.55, metalness: 0.05,
    emissive: color, emissiveMap: glowMap, emissiveIntensity: 0.55, envMapIntensity: 0.8
  });
  const faceMat = mat(0x8f8b83, { metalness: 0.85, roughness: 0.32 });
  const rotorGeo = new THREE.CylinderGeometry(R, R, T, 64, 1).rotateZ(Math.PI / 2);
  const rotors = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(rotorGeo, [rimMat, faceMat, faceMat]);
    r.position.x = (i - 1) * pitch;
    r.rotation.x = i * 1.3;
    core.add(r);
    rotors.push(r);
  }
  const span = pitch * 2 + T;
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, span + 0.5, 20).rotateZ(Math.PI / 2), faceMat);
  core.add(axle);
  // bearing posts from the plinth up to the axle
  for (const s of [-1, 1]) {
    const post = makeBox(0.1, H / 2, 0.22, 0x3a3c42, { wire: false, metalness: 0.6, roughness: 0.35 });
    post.position.set(s * (span / 2 + 0.16), -H / 4, 0);
    core.add(post);
  }
  const halo = makeGlow(color, Math.max(1.6, R * 4));
  halo.position.z = -D * 0.25;
  halo.material.opacity = 0.35;
  core.add(halo);
  group.add(core);

  const cap = makeLabel(label, { height: 0.2, mono: true, color: '#0a1416',
    bg: `#${new THREE.Color(color).getHexString()}`, weight: 700 });
  cap.position.set(0, H / 2 + 0.22, 0);
  group.add(cap);

  let spin = 1;
  return {
    group, shell, core, caption: cap,
    setColor(c) {
      shell.material.color.setHex(c);
      shell.children[0].material.color.setHex(c);
      rimMat.emissive.setHex(c);
      halo.material.color.setHex(c);
    },
    setSpin(v) { spin = v; },
    tick(dt, t) {
      // neighbouring rotors turn at different rates and directions, like stepping wheels
      rotors.forEach((r, i) => { r.rotation.x += dt * (0.5 + i * 0.45) * (i % 2 ? -1 : 1) * spin; });
      rimMat.emissiveIntensity = 0.35 + 0.25 * spin + Math.sin(t * 3) * 0.08 * spin;
      shell.material.opacity = 0.055 + Math.sin(t * 2) * 0.02;
    }
  };
}

/* ── A key ─────────────────────────────────────────────────────────────── */
// Bevelled bow, shaft and stepped bit, in polished metal that picks up the room light.
let keyGeos = null;
function keyGeometries() {
  if (keyGeos) return keyGeos;
  const bow = new THREE.Shape();
  bow.absarc(0, 0, 0.27, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.12, 0, Math.PI * 2, true);
  bow.holes.push(hole);
  const bit = new THREE.Shape();
  [[0, 0], [0.3, 0], [0.3, -0.17], [0.24, -0.17], [0.24, -0.1], [0.17, -0.1], [0.17, -0.2],
   [0.1, -0.2], [0.1, -0.12], [0.04, -0.12], [0.04, -0.16], [0, -0.16]]
    .forEach(([x, y], i) => i ? bit.lineTo(x, y) : bit.moveTo(x, y));
  const bevel = (depth, size) => ({ depth, bevelEnabled: true, bevelThickness: size, bevelSize: size, bevelSegments: 3, curveSegments: 40 });
  const share = (g) => { g.userData.shared = true; return g; };
  keyGeos = {
    bow: share(new THREE.ExtrudeGeometry(bow, bevel(0.05, 0.022)).translate(0, 0, -0.025)),
    bit: share(new THREE.ExtrudeGeometry(bit, bevel(0.04, 0.012)).translate(0, 0, -0.02)),
    shaft: share(new THREE.CylinderGeometry(0.052, 0.052, 0.8, 24).rotateZ(Math.PI / 2)),
    collar: share(new THREE.CylinderGeometry(0.085, 0.085, 0.09, 24).rotateZ(Math.PI / 2)),
    tip: share(new THREE.SphereGeometry(0.052, 16, 12))
  };
  return keyGeos;
}

export function makeKeyIcon(color = PAL.amber, label = null) {
  const group = new THREE.Group();
  const m = mat(color, { metalness: 1, roughness: 0.3, emissive: color, emissiveIntensity: 0.12, env: 1.25 });
  const k = keyGeometries();
  const bow = new THREE.Mesh(k.bow, m);
  const collar = new THREE.Mesh(k.collar, m);
  collar.position.x = 0.32;
  const shaft = new THREE.Mesh(k.shaft, m);
  shaft.position.x = 0.7;
  const tip = new THREE.Mesh(k.tip, m);
  tip.position.x = 1.1;
  const bit = new THREE.Mesh(k.bit, m);
  bit.position.set(0.76, -0.02, 0);
  const body = new THREE.Group();          // scaled to the old key's footprint, so layouts hold
  body.scale.setScalar(0.84);
  body.add(bow, collar, shaft, tip, bit);
  group.add(body);
  const glow = makeGlow(color, 1.05);
  glow.material.opacity = 0.4;
  group.add(glow);
  if (label) {
    const l = makeLabel(label, { height: 0.17, mono: true, color: '#d2e3f5' });
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
    new THREE.TorusGeometry(0.19, 0.045, 16, 40, Math.PI),
    mat(0xd6d3cc, { metalness: 1, roughness: 0.22, env: 1.2 })
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

/**
 * A sealed cage of steel bars around a box (w × h × d), drawn as one instanced mesh.
 * Says "locked away" without the triangulated-wireframe look.
 */
export function makeCage(w, h, d, color = PAL.red) {
  const bars = [];                                   // [x, y, z, length, axis, radius]
  const R = 0.034;
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) bars.push([x, 0, z, h, 'y', R]);
  for (const y of [-h / 2, h / 2]) {
    for (const z of [-d / 2, d / 2]) bars.push([0, y, z, w, 'x', R]);
    for (const x of [-w / 2, w / 2]) bars.push([x, y, 0, d, 'z', R]);
  }
  const nx = Math.max(3, Math.round(w / 0.34)), nz = Math.max(2, Math.round(d / 0.34));
  for (let i = 1; i < nx; i++) for (const z of [-d / 2, d / 2]) bars.push([-w / 2 + i * w / nx, 0, z, h, 'y', R * 0.7]);
  for (let i = 1; i < nz; i++) for (const x of [-w / 2, w / 2]) bars.push([x, 0, -d / 2 + i * d / nz, h, 'y', R * 0.7]);

  const steel = mat(0x4a4c52, { metalness: 0.9, roughness: 0.32, emissive: color, emissiveIntensity: 0.12, env: 1.2 });
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12), steel, bars.length);
  const o = new THREE.Object3D();
  bars.forEach(([x, y, z, len, axis, r], i) => {
    o.position.set(x, y, z);
    o.rotation.set(axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
    o.scale.set(r, len + r * 2, r);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  return mesh;
}

/* ── Yaka hardware ─────────────────────────────────────────────────────────
   MCU: the sealed meter high on the pole. CIU: the keypad indoors. ───────── */

export function makeMCU() {
  const group = new THREE.Group();

  const body = makeBox(1.9, 2.5, 0.95, 0x30333a, { roughness: 0.62, metalness: 0.25,
    wireColor: PAL.cyan, wireOpacity: 0.22 });
  group.add(body);

  // LCD
  const screen = makeBox(1.35, 0.62, 0.06, 0x08110f, { wire: false, roughness: 0.3 });
  screen.position.set(0, 0.62, 0.5);
  const screenText = makeTextPlane('0.0 kWh', { height: 0.24, mono: true, color: '#a9cdf2', weight: 700 });
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
  const cover = makeBox(1.9, 0.78, 0.5, 0x282a30, { roughness: 0.7, wireOpacity: 0.18 });
  cover.position.set(0, -1.0, 0.28);
  group.add(cover);
  for (const x of [-0.7, 0.7]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10),
      mat(0xa19e96, { metalness: 0.9, roughness: 0.3 }));
    s.rotation.x = Math.PI / 2;
    s.position.set(x, -1.0, 0.55);
    group.add(s);
  }

  // seal wire
  const seal = makeLine([[-0.7, -1.0, 0.58], [0, -1.2, 0.62], [0.7, -1.0, 0.58]], PAL.amber, 0.65);
  group.add(seal);

  const cap = makeLabel('MCU · Measurement Control Unit', { height: 0.2, color: '#b3b0a8' });
  cap.position.set(0, 1.62, 0);
  group.add(cap);

  const sub = makeLabel('sealed · pole-mounted · holds the Decoder Key', {
    height: 0.15, color: '#86837b'
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
  const body = makeBox(1.5, 2.0, 0.36, 0x383b43, { roughness: 0.6,
    wireColor: PAL.violet, wireOpacity: 0.26 });
  group.add(body);

  const screen = makeBox(1.18, 0.5, 0.05, 0x07120f, { wire: false });
  screen.position.set(0, 0.66, 0.2);
  const screenText = makeTextPlane('READY', { height: 0.2, mono: true, color: '#a9cdf2', weight: 700 });
  screenText.position.set(0, 0.66, 0.235);
  group.add(screen, screenText);

  // 4 x 4 keypad
  const keys = [];
  const glyphs = ['1','2','3','4','5','6','7','8','9','←','0','↵'];
  glyphs.forEach((g, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const k = new THREE.Group();
    const kb = makeBox(0.3, 0.22, 0.09, 0x4d5059, { roughness: 0.55, wire: false });
    const kt = makeTextPlane(g, { height: 0.13, mono: true, color: '#e3e1dc', weight: 700 });
    kt.position.z = 0.05;
    k.add(kb, kt);
    k.position.set((col - 1) * 0.37, 0.16 - row * 0.3, 0.2);
    k.userData = { base: 0.2, mesh: kb, glyph: g };
    group.add(k);
    keys.push(k);
  });

  const cap = makeLabel('CIU · Customer Interface Unit', { height: 0.19, color: '#b3b0a8' });
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
        p.k.userData.mesh.material.color.setHex(d > 0.2 ? PAL.cyan : 0x4d5059);
        if (p.t >= Math.PI) {
          p.k.position.z = p.k.userData.base;
          p.k.userData.mesh.material.color.setHex(0x4d5059);
          press.splice(i, 1);
        }
      }
    }
  };
}

/** Stripes for wood grain and corrugated iron, used as a bump map. */
function stripeTexture(n, soft, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 16;
  const g = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const v = soft ? 128 + Math.sin(x / 256 * Math.PI * 2 * n) * 60 + (Math.random() - 0.5) * 40
                   : 128 + Math.sin(x / 256 * Math.PI * 2 * n) * 127;
    g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
    g.fillRect(x, 0, 1, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  return t;
}

/** Utility pole with a crossarm and porcelain insulators, to hang the MCU on. */
export function makePole(height = 6) {
  const group = new THREE.Group();
  const wood = mat(0x5a4532, { roughness: 0.88, metalness: 0, extra: { bumpMap: stripeTexture(9, true), bumpScale: 1.5 } });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, height, 24), wood);
  pole.position.y = height / 2 - 2.2;
  const arm = makeBox(2.6, 0.14, 0.14, 0x5a4532, { wire: false, roughness: 0.88, metalness: 0 });
  arm.position.y = height - 2.5;
  group.add(pole, arm);
  const porcelain = mat(0xece8df, { roughness: 0.18, metalness: 0, env: 1.1 });
  for (const x of [-1.05, 0, 1.05]) {
    const ins = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.24, 16), porcelain);
    ins.add(stem);
    for (let i = 0; i < 2; i++) {               // skirts
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.05, 20), porcelain);
      skirt.position.y = -0.06 + i * 0.09;
      ins.add(skirt);
    }
    ins.position.set(x, height - 2.3, 0);
    group.add(ins);
  }
  return group;
}

/**
 * A cutaway house: floor, plaster walls with windows, an iron-sheet roof (as on
 * most Ugandan homes), front wall cut away so the CIU and the lamp inside show.
 * Footprint matches the old 4.2 × 2.6 × 3.2 shell, walls centred at y = -0.9.
 */
export function makeHouse() {
  const group = new THREE.Group();
  const plaster = mat(0x4d4842, { roughness: 0.92, metalness: 0, env: 0.6 });
  const walls = new THREE.Group();
  const W = 4.2, H = 2.6, D = 3.2, t = 0.14, y0 = -0.9;
  const slab = makeBox(W + 0.3, 0.16, D + 0.3, 0x4a4640, { wire: false, roughness: 0.95, metalness: 0 });
  slab.position.y = y0 - H / 2 - 0.08;
  const back = new THREE.Mesh(roundedBox(W, H, t, 0.03, 2), plaster);
  back.position.set(0, y0, -D / 2 + t / 2);
  const knee = new THREE.Mesh(roundedBox(W, 0.42, t, 0.03, 2), plaster);   // the cut-away front
  knee.position.set(0, y0 - H / 2 + 0.21, D / 2 - t / 2);
  walls.add(back, knee);

  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x1c2026, roughness: 0.15, metalness: 0.2, emissive: 0xffc777, emissiveIntensity: 0
  });
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(roundedBox(t, H, D, 0.03, 2), plaster);
    side.position.set(s * (W / 2 - t / 2), y0, 0);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), windowMat);
    win.position.set(s * (W / 2 + 0.04), y0 + 0.25, 0.2);     // just proud of its frame
    win.rotation.y = s * Math.PI / 2;
    const frame = makeBox(0.05, 0.86, 1.06, 0x3b3833, { wire: false, roughness: 0.7 });
    frame.position.set(s * (W / 2 + 0.01), y0 + 0.25, 0.2);
    walls.add(side, win, frame);
  }

  // Gable ends and a corrugated iron roof.
  const ridge = 1.15, eaveY = y0 + H / 2;
  const gable = new THREE.Shape();
  gable.moveTo(-D / 2, 0); gable.lineTo(D / 2, 0); gable.lineTo(0, ridge); gable.lineTo(-D / 2, 0);
  const gableGeo = new THREE.ExtrudeGeometry(gable, { depth: t, bevelEnabled: false });
  for (const s of [-1, 1]) {
    const g = new THREE.Mesh(gableGeo, plaster);
    g.rotation.y = Math.PI / 2;
    g.position.set(s * (W / 2) - (s > 0 ? t : 0), eaveY, 0);
    walls.add(g);
  }
  const iron = mat(0x5c6168, { roughness: 0.5, metalness: 0.7, env: 0.75,
    extra: { bumpMap: stripeTexture(28, false), bumpScale: 2.5, side: THREE.DoubleSide } });
  const slope = Math.hypot(D / 2 + 0.2, ridge), pitch = Math.atan2(ridge, D / 2 + 0.2);
  for (const s of [-1, 1]) {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.05, slope), iron);
    sheet.position.set(0, eaveY + ridge / 2 + 0.03, s * (D / 4 + 0.05));
    sheet.rotation.x = s * pitch;
    walls.add(sheet);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, W + 0.5, 12).rotateZ(Math.PI / 2), iron);
  cap.position.y = eaveY + ridge + 0.04;
  walls.add(cap);
  group.add(slab, walls);

  // a lamp inside that we can switch on when the relay closes
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff0c2, emissive: 0xffdd88, emissiveIntensity: 0 }));
  bulb.position.set(1.1, 0.1, 0);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, eaveY - 0.1, 6), mat(0x1c1c1c));
  cord.position.set(1.1, (eaveY + 0.1) / 2 + 0.05, 0);
  const bglow = makeGlow(0xffd79a, 2.4);
  bglow.position.copy(bulb.position);
  bglow.material.opacity = 0;
  const light = new THREE.PointLight(0xffd79a, 0, 7);
  light.position.copy(bulb.position);
  group.add(bulb, cord, bglow, light);

  return {
    group, walls,
    setPower(on, level = 1) {
      bulb.material.emissiveIntensity = on ? 1.7 * level : 0;
      bglow.material.opacity = on ? 0.8 * level : 0;
      light.intensity = on ? 9 * level : 0;
      windowMat.emissiveIntensity = on ? 0.9 * level : 0;
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
    const box = makeBox(w, w * 1.3, 0.1, 0x1e2024, { wireColor: PAL.cyan, wireOpacity: 0.3 });
    const face = makeTextPlane('0', { height: w * 0.7, mono: true, color: '#ebe9e4', weight: 700 });
    face.position.z = 0.06;
    t.add(box, face);
    t.position.x = (i - 9.5) * (w + 0.05) + g * 0.12 - 0.24;
    t.userData = { box, face };
    group.add(t);
    tiles.push(t);
  }
  return {
    group, tiles,
    set(digits, { from = 0, color = 0x1e2024 } = {}) {
      const d = String(digits).padStart(20, '0').slice(-20);
      tiles.forEach((t, i) => {
        t.userData.face.setText(d[i]);
        t.userData.box.material.color.setHex(i >= from ? color : 0x1e2024);
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
