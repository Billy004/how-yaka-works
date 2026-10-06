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
   The CIU, MCU, pole, house and ground are modelled in hardware.js; re-exported
   here so lessons keep importing them from viz.js. ───────────────────────── */
export { makeMCU, makeCIU, makePole, makeHouse, makeGround, makeSite, makeCable, makeBanana, sagPoints } from './hardware.js';

export { makeTokenDisplay, makeChecklist, makePhone } from './hardware.js';
