// Shared three.js scaffolding: one Stage per lesson, plus the small library of
// primitives (labels, panels, wires, flowing particles) the lessons draw with.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export { THREE };

export const PAL = {
  bg:      0x080b11,
  cyan:    0x35e0d6,
  cyanDim: 0x1b8a86,
  amber:   0xffb347,
  violet:  0x8b7cf6,
  red:     0xff5d6c,
  green:   0x4ade80,
  steel:   0x2b3a52,
  slate:   0x1a2432,
  ink:     0xe6edf7,
  muted:   0x6b7d96
};

/* ── Stage ─────────────────────────────────────────────────────────────── */
export class Stage {
  constructor(container, opts = {}) {
    this.el = container;
    this.disposed = false;
    this._ticks = [];
    this._trash = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAL.bg);
    this.scene.fog = new THREE.Fog(PAL.bg, opts.fogNear ?? 32, opts.fogFar ?? 88);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
    this.camera.position.set(...(opts.camera || [0, 4.4, 12]));

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    // resize() passes updateStyle=false, so CSS must size the canvas. Without this the
    // canvas is drawn at devicePixelRatio × its container and spills over the side panel.
    Object.assign(this.renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = opts.minDistance ?? 3;
    this.controls.maxDistance = opts.maxDistance ?? 40;
    this.controls.maxPolarAngle = Math.PI * 0.86;
    this.controls.target.set(...(opts.target || [0, 0.6, 0]));

    this.scene.add(new THREE.AmbientLight(0x93b4d8, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(5, 9, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(PAL.cyan, 0.5);
    rim.position.set(-7, 3, -5);
    this.scene.add(rim);
    const fill = new THREE.PointLight(PAL.violet, 26, 34);
    fill.position.set(0, -4, 4);
    this.scene.add(fill);

    if (opts.grid !== false) {
      const grid = new THREE.GridHelper(opts.gridSize ?? 44, opts.gridDiv ?? 44, PAL.steel, 0x141d2b);
      grid.material.transparent = true;
      grid.material.opacity = 0.34;
      grid.position.y = opts.gridY ?? -2.2;
      this.scene.add(grid);
      this._trash.push(grid);
    }

    this.clock = new THREE.Clock();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  add(...objs) { objs.forEach(o => { this.scene.add(o); this._trash.push(o); }); return objs[0]; }
  onTick(fn) { this._ticks.push(fn); return fn; }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _loop() {
    if (this.disposed) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    for (const fn of this._ticks) { try { fn(dt, t); } catch (e) { console.error(e); } }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.controls.dispose();
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach(disposeMat); else if (m) disposeMat(m);
    });
    this.renderer.dispose();
    // Release the GL context now rather than at GC time; browsers cap live contexts at ~16.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this._ticks.length = 0;
  }
}
function disposeMat(m) { if (m.map) m.map.dispose(); m.dispose(); }

/* ── Text ──────────────────────────────────────────────────────────────── */
const FONT_MONO = '"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace';
const FONT_SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

function drawText(canvas, text, o) {
  const px = 72;
  const ctx = canvas.getContext('2d');
  const font = `${o.weight || 600} ${px}px ${o.mono ? FONT_MONO : FONT_SANS}`;
  ctx.font = font;
  const lines = String(text).split('\n');
  const wMax = Math.max(...lines.map(l => ctx.measureText(l).width));
  const padX = px * 0.42, padY = px * 0.3;
  canvas.width  = Math.max(8, Math.ceil(wMax + padX * 2));
  canvas.height = Math.ceil(lines.length * px * 1.28 + padY * 2);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  if (o.bg != null) {
    c.fillStyle = o.bg;
    const r = Math.min(18, canvas.height / 3);
    c.beginPath(); c.roundRect(0, 0, canvas.width, canvas.height, r); c.fill();
    if (o.border) { c.strokeStyle = o.border; c.lineWidth = 4; c.stroke(); }
  }
  c.font = font;
  c.fillStyle = o.color || '#e6edf7';
  c.textBaseline = 'middle';
  c.textAlign = o.align || 'center';
  const x = o.align === 'left' ? padX : o.align === 'right' ? canvas.width - padX : canvas.width / 2;
  lines.forEach((l, i) => c.fillText(l, x, padY + px * 0.64 + i * px * 1.28));
}

/**
 * A billboarded text label.
 * @returns {THREE.Sprite} with .setText(str) and .height (world units)
 */
export function makeLabel(text, opts = {}) {
  const o = { height: 0.34, ...opts };
  const canvas = document.createElement('canvas');
  drawText(canvas, text, o);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.renderOrder = 10;
  const apply = () => { sp.scale.set(o.height * canvas.width / canvas.height, o.height, 1); };
  apply();
  sp.setText = (t) => { drawText(canvas, t, o); tex.needsUpdate = true; apply(); };
  sp.setOpacity = (v) => { mat.opacity = v; };
  return sp;
}

/** Flat text on a plane — stays in the 3D plane instead of facing the camera. */
export function makeTextPlane(text, opts = {}) {
  const o = { height: 0.34, ...opts };
  const canvas = document.createElement('canvas');
  drawText(canvas, text, o);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(o.height * canvas.width / canvas.height, o.height);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 9;
  m.setText = (t) => { drawText(canvas, t, o); tex.needsUpdate = true; };
  return m;
}

/* ── Building blocks ───────────────────────────────────────────────────── */
export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: opts.roughness ?? 0.42, metalness: opts.metalness ?? 0.18,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.opacity != null, opacity: opts.opacity ?? 1, ...opts.extra
  });
}

export function makeBox(w, h, d, color, opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat(color, opts));
  if (opts.wire !== false) {
    const e = new THREE.LineSegments(
      new THREE.EdgesGeometry(g),
      new THREE.LineBasicMaterial({ color: opts.wireColor ?? PAL.cyan,
        transparent: true, opacity: opts.wireOpacity ?? 0.34 })
    );
    m.add(e);
  }
  return m;
}

/** A glowing wireframe slab — used for "engines", panels, containers. */
export function makeShell(w, h, d, color = PAL.cyan, opacity = 0.09) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false
  }));
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 })));
  return m;
}

export function makeLine(points, color = PAL.cyan, opacity = 0.7) {
  const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/** A dashed conduit between two points, for links (PLC, RF, network). */
export function makeConduit(a, b, color = PAL.cyan) {
  const pa = new THREE.Vector3(...a), pb = new THREE.Vector3(...b);
  const g = new THREE.BufferGeometry().setFromPoints([pa, pb]);
  const m = new THREE.LineDashedMaterial({ color, dashSize: 0.22, gapSize: 0.16,
    transparent: true, opacity: 0.8 });
  const line = new THREE.Line(g, m);
  line.computeLineDistances();
  return line;
}

/**
 * Particles travelling along a path — the workhorse for showing data in motion.
 * @returns object with .group, .setPath(fn), .speed, .active
 */
export function makeFlow(pathFn, count = 26, color = PAL.cyan, size = 0.12) {
  const geo = new THREE.SphereGeometry(size, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const group = new THREE.Group();
  const parts = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, material.clone());
    m.userData.u = i / count;
    group.add(m);
    parts.push(m);
  }
  const api = {
    group, parts, speed: 0.26, active: true, path: pathFn,
    setColor(c) { parts.forEach(p => p.material.color.set(c)); },
    tick(dt) {
      if (!api.active) return;
      for (const p of parts) {
        p.userData.u = (p.userData.u + dt * api.speed) % 1;
        const v = api.path(p.userData.u);
        p.position.set(v[0], v[1], v[2]);
        const fade = Math.sin(p.userData.u * Math.PI);
        p.material.opacity = 0.2 + 0.8 * fade;
        p.scale.setScalar(0.55 + 0.45 * fade);
      }
    }
  };
  return api;
}

/** Straight-line path helper for makeFlow. */
export const linePath = (a, b) => (u) => [
  a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u
];

/** Arc path between two points, bulging upward. */
export const arcPath = (a, b, lift = 1.2) => (u) => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u + Math.sin(u * Math.PI) * lift,
  a[2] + (b[2] - a[2]) * u
];

/**
 * A grid of small cubes representing bits. .set(bitString) lights them up,
 * and changed bits flash red so the avalanche effect is visible.
 */
export function makeBitField(bits = 64, cols = 16, opts = {}) {
  const gap = opts.gap ?? 0.28, size = opts.size ?? 0.2;
  const rows = Math.ceil(bits / cols);
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(size, size, size);
  const cells = [];
  for (let i = 0; i < bits; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: PAL.slate, emissive: 0x000000, roughness: 0.5, metalness: 0.2
    }));
    m.position.set((i % cols - (cols - 1) / 2) * gap,
                   -(Math.floor(i / cols) - (rows - 1) / 2) * gap, 0);
    group.add(m);
    cells.push(m);
  }
  let prev = '0'.repeat(bits);
  const flash = new Array(bits).fill(0);
  const api = {
    group, cells,
    set(str, { markChanges = true } = {}) {
      const s = String(str).padStart(bits, '0').slice(-bits);
      for (let i = 0; i < bits; i++) {
        const on = s[i] === '1';
        if (markChanges && s[i] !== prev[i]) flash[i] = 1;
        cells[i].material.color.setHex(on ? PAL.cyan : PAL.slate);
        cells[i].material.emissive.setHex(on ? PAL.cyanDim : 0x000000);
        cells[i].scale.setScalar(on ? 1.12 : 0.82);
      }
      prev = s;
    },
    tick(dt) {
      for (let i = 0; i < bits; i++) {
        if (flash[i] <= 0) continue;
        flash[i] = Math.max(0, flash[i] - dt * 1.5);
        if (flash[i] > 0) {
          cells[i].material.emissive.setHex(PAL.red);
          cells[i].material.emissiveIntensity = 0.35 + flash[i] * 2.4;
        } else {
          // flash over — put the cell back to whatever its bit says
          const on = prev[i] === '1';
          cells[i].material.emissive.setHex(on ? PAL.cyanDim : 0x000000);
          cells[i].material.emissiveIntensity = 1;
        }
      }
    }
  };
  return api;
}

/** Soft additive glow sprite, for lamps and status lights. */
export function makeGlow(color = PAL.cyan, size = 1.4) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  sp.scale.setScalar(size);
  return sp;
}

/* ── Small animation helpers ───────────────────────────────────────────── */
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** A tiny tween runner driven by stage.onTick. */
export class Timeline {
  constructor(stage) {
    this.items = [];
    stage.onTick((dt) => this.tick(dt));
  }
  /** run(duration, onProgress, onDone) */
  run(duration, onProgress, onDone) {
    this.items.push({ t: 0, d: duration, onProgress, onDone });
  }
  clear() { this.items.length = 0; }
  tick(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const u = clamp01(it.t / it.d);
      it.onProgress?.(u);
      if (u >= 1) { this.items.splice(i, 1); it.onDone?.(); }
    }
  }
}
