// Shared three.js scaffolding: one Stage per lesson, plus the small library of
// primitives (labels, panels, wires, flowing particles) the lessons draw with.
//
// The look is a studio-lit graphite "display": image-based light from a soft room
// (RoomEnvironment), a warm key with cool and warm rims, colour-true tone mapping,
// bevelled forms instead of sharp boxes, and soft contact shadows on a lit floor —
// the techniques polished three.js work leans on. QUALITY sizes it for the device.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

export { THREE };

// The 3D view is a graphite "display" inside a light page. Names are semantic
// history (lessons use PAL.cyan for data, PAL.violet for ciphertext); the values
// are muted so the scenes read as diagrams rather than neon.
export const PAL = {
  bg:      0x16171a,   // graphite
  cyan:    0x5ea1e6,   // data / plaintext — calm blue
  cyanDim: 0x2f5f8f,
  amber:   0xf0a04b,   // keys — same family as the page's orange accent
  violet:  0xa58bd8,   // ciphertext — soft plum
  red:     0xec5f59,
  green:   0x62c08a,
  steel:   0x3a3d44,
  slate:   0x26282d,
  ink:     0xebe9e4,
  muted:   0x86837b
};

/* ── Quality ───────────────────────────────────────────────────────────── */
// ?quality=low|medium|high forces a tier (and turns off adaptation, for testing).
const params = new URLSearchParams(location.search);
export const QUALITY = (() => {
  const forced = params.get('quality');
  if (['low', 'medium', 'high'].includes(forced)) return forced;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (navigator.connection?.saveData || (coarse && (cores <= 4 || mem <= 3))) return 'low';
  return coarse ? 'medium' : 'high';
})();
// Measured (software renderer, L01): image-based light and the contact-shadow pass
// were the two biggest per-pixel costs. Shadows are blurred anyway, so 256² refreshed
// every few frames looks the same; the lowest tier drops the environment map too.
const TIERS = {
  high:   { dpr: 2,   shadowRes: 256, shadowEvery: 2, env: true },
  medium: { dpr: 1.5, shadowRes: 256, shadowEvery: 3, env: true },
  low:    { dpr: 1,   shadowRes: 128, shadowEvery: 8, env: false }
};
const ADAPTIVE = !params.get('quality');
const GFX_KEY = 'cryptolab.gfx';
// Downgrades found on one lesson carry to the next, so a slow phone settles once.
const gfx = (() => {
  const base = { ...TIERS[QUALITY] };
  if (!ADAPTIVE) return base;
  try { return { ...base, ...JSON.parse(sessionStorage.getItem(GFX_KEY) || '{}') }; } catch { return base; }
})();

/* ── Stage ─────────────────────────────────────────────────────────────── */
export class Stage {
  constructor(container, opts = {}) {
    this.el = container;
    this.opts = opts;
    this.disposed = false;
    this._ticks = [];
    this._trash = [];

    this.scene = new THREE.Scene();
    this.scene.background = studioBackdrop();
    this.scene.fog = new THREE.Fog(PAL.bg, opts.fogNear ?? 32, opts.fogFar ?? 88);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
    this.camera.position.set(...(opts.camera || [0, 4.4, 12]));

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, gfx.dpr));
    // Linear, not filmic: compared side by side on L09, ACES/AgX/Reinhard all washed the
    // semantic colours (blue data, amber keys, green OK) towards pastel or mud.
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    // resize() passes updateStyle=false, so CSS must size the canvas. Without this the
    // canvas is drawn at devicePixelRatio × its container and spills over the side panel.
    Object.assign(this.renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
    container.appendChild(this.renderer.domElement);

    // Image-based light: a soft studio room that every standard material reflects.
    if (gfx.env) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment(this.renderer);
      this.scene.environment = pmrem.fromScene(room, 0.04).texture;
      room.dispose();
      pmrem.dispose();
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = opts.minDistance ?? 3;
    this.controls.maxDistance = opts.maxDistance ?? 40;
    this.controls.maxPolarAngle = Math.PI * 0.86;
    this.controls.target.set(...(opts.target || [0, 0.6, 0]));

    // Sky fill (it carries the ambient light when there's no environment map), a warm
    // key, and a cool rim from back-left with a warm one from back-right.
    this.scene.add(new THREE.HemisphereLight(0xf3efe6, 0x101113, gfx.env ? 0.45 : 1.3));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
    key.position.set(4, 10, 7);
    const rimCool = new THREE.DirectionalLight(PAL.cyan, 1.2);
    rimCool.position.set(-8, 3, -6);
    const rimWarm = new THREE.DirectionalLight(PAL.amber, 0.7);
    rimWarm.position.set(8, 2, -5);
    this.scene.add(key, rimCool, rimWarm);

    this.floorY = opts.gridY ?? -2.2;
    if (opts.grid !== false) {
      const floor = makeFloor(opts.gridSize ?? 44);
      floor.position.y = this.floorY;
      this.scene.add(floor);
    }

    this.clock = new THREE.Clock();
    this._frame = 0;
    this._born = performance.now();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  add(...objs) { objs.forEach(o => { this.scene.add(o); this._trash.push(o); }); return objs[0]; }
  onTick(fn) { this._ticks.push(fn); return fn; }

  /**
   * Call once the lesson has built its scene. Fits a soft contact-shadow catcher
   * under whatever was added, so floating diagrams sit in a space instead of a void.
   */
  finish() {
    if (this._contact || this.opts.grid === false) return;
    const box = new THREE.Box3(), b = new THREE.Box3();
    this.scene.updateMatrixWorld(true);
    this.scene.traverse(o => {
      if (!o.isMesh || o.userData.noFit || o.userData.noShadow || !o.geometry) return;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    });
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const height = Math.max(2, box.max.y - this.floorY + 0.5);
    this._contact = makeContactShadow(this.renderer, size.x + 4, size.z + 4, height, gfx.shadowRes);
    this._contact.group.position.set(centre.x, this.floorY + 0.01, centre.z);
    this.scene.add(this._contact.group);
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _loop(now) {
    if (this.disposed) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    for (const fn of this._ticks) { try { fn(dt, t); } catch (e) { console.error(e); } }
    this.controls.update();
    if (this._contact && this._frame % gfx.shadowEvery === 0) this._contact.update(this.scene);
    this._frame++;
    this.renderer.render(this.scene, this.camera);
    this._monitor(now);
  }

  /** If frames are slow, step quality down: resolution first, then shadow updates. */
  _monitor(now) {
    if (!ADAPTIVE || now - this._born < 2500) { this._last = now; return; }
    const step = Math.min(250, now - (this._last ?? now));
    this._last = now;
    this._acc = (this._acc || 0) + step;
    this._n = (this._n || 0) + 1;
    if (this._acc < 3000) return;
    const avg = this._acc / this._n;
    this._acc = this._n = 0;
    if (avg < 40) return;                       // ~25 fps or better: leave it
    if (gfx.dpr > 1) {
      gfx.dpr = Math.max(1, gfx.dpr - 0.5);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, gfx.dpr));
      this.resize();
    } else if (gfx.shadowEvery < 16) {
      gfx.shadowEvery *= 2;
    } else return;
    try { sessionStorage.setItem(GFX_KEY, JSON.stringify({ dpr: gfx.dpr, shadowEvery: gfx.shadowEvery })); } catch {}
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.controls.dispose();
    this._contact?.dispose();
    this.scene.environment?.dispose();
    if (this.scene.background?.isTexture) this.scene.background.dispose();
    this.scene.traverse(o => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
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
function disposeMat(m) {
  if (m.map && !m.map.userData.shared) m.map.dispose();
  if (m.emissiveMap && !m.emissiveMap.userData.shared) m.emissiveMap.dispose();
  m.dispose();
}

/** Radial vignette behind everything: a lit centre falling off to the edges. */
function studioBackdrop() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 210, 20, 256, 256, 400);
  grad.addColorStop(0, '#24262b');
  grad.addColorStop(0.55, '#18191c');
  grad.addColorStop(1, '#0f1012');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A lit pool on the floor with a faint drafting grid that fades out radially. */
function makeFloor(size) {
  const N = 1024, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const pool = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  pool.addColorStop(0, 'rgba(255,246,232,0.11)');
  pool.addColorStop(0.4, 'rgba(255,246,232,0.045)');
  pool.addColorStop(1, 'rgba(255,246,232,0)');
  g.fillStyle = pool;
  g.fillRect(0, 0, N, N);

  const grid = document.createElement('canvas');
  grid.width = grid.height = N;
  const gg = grid.getContext('2d');
  const step = N / size;
  for (let i = 0; i <= size; i++) {
    const p = Math.round(i * step) + 0.5;
    gg.strokeStyle = i % 5 === 0 ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.022)';
    gg.lineWidth = 1;
    gg.beginPath(); gg.moveTo(p, 0); gg.lineTo(p, N); gg.moveTo(0, p); gg.lineTo(N, p); gg.stroke();
  }
  const mask = gg.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.35, 'rgba(0,0,0,0.45)');
  mask.addColorStop(0.7, 'rgba(0,0,0,0)');
  gg.globalCompositeOperation = 'destination-in';
  gg.fillStyle = mask;
  gg.fillRect(0, 0, N, N);
  g.drawImage(grid, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
  );
  floor.renderOrder = -1;
  floor.userData.noFit = floor.userData.noShadow = true;
  return floor;
}

/**
 * Soft contact shadows, after three.js' webgl_shadow_contact example: render the
 * scene's depth from the floor looking up, darken by closeness, blur, and lay the
 * result on the floor. Independent of lights, and kind to floating objects.
 */
function makeContactShadow(renderer, width, depth, height, res) {
  const group = new THREE.Group();
  group.userData.noFit = group.userData.noShadow = true;
  const rt = new THREE.WebGLRenderTarget(res, res);
  const rtBlur = new THREE.WebGLRenderTarget(res, res);
  rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;

  const planeGeo = new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2);
  const plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
    map: rt.texture, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, fog: false
  }));
  plane.renderOrder = 0;
  plane.scale.y = -1;                // the texture comes out flipped
  const blurPlane = new THREE.Mesh(planeGeo);
  blurPlane.visible = false;
  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, height);
  cam.rotation.x = Math.PI / 2;      // look up from the floor
  group.add(plane, blurPlane, cam);

  const depthMat = new THREE.MeshDepthMaterial();
  depthMat.userData.darkness = { value: 1.7 };
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.darkness = depthMat.userData.darkness;
    shader.fragmentShader = 'uniform float darkness;\n' + shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );'
    );
  };
  depthMat.depthTest = depthMat.depthWrite = false;
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
  hBlur.depthTest = vBlur.depthTest = false;

  const blur = (amount) => {
    blurPlane.visible = true;
    blurPlane.material = hBlur;
    hBlur.uniforms.tDiffuse.value = rt.texture;
    hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(rtBlur);
    renderer.render(blurPlane, cam);
    blurPlane.material = vBlur;
    vBlur.uniforms.tDiffuse.value = rtBlur.texture;
    vBlur.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(rt);
    renderer.render(blurPlane, cam);
    blurPlane.visible = false;
  };

  const hidden = [];
  return {
    group,
    update(scene) {
      // Only solid things cast: no labels, glows, lines, particles or glass.
      scene.traverse(o => {
        if (!o.visible) return;
        const m = o.material;
        if (o === group || o.userData.noShadow || o.isSprite || o.isPoints || o.isLine ||
            (o.isMesh && m && !Array.isArray(m) && m.transparent && m.opacity < 0.6)) {
          o.visible = false;
          hidden.push(o);
        }
      });
      const bg = scene.background, clearAlpha = renderer.getClearAlpha();
      scene.background = null;
      scene.overrideMaterial = depthMat;
      renderer.setClearAlpha(0);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = null;
      blur(3.2);
      blur(1.2);
      renderer.setRenderTarget(null);
      renderer.setClearAlpha(clearAlpha);
      scene.background = bg;
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
    },
    dispose() {
      rt.dispose(); rtBlur.dispose();
      depthMat.dispose(); hBlur.dispose(); vBlur.dispose();
    }
  };
}

/* ── Text ──────────────────────────────────────────────────────────────── */
// Same faces as the page (loaded from Google Fonts; main.js waits for them before the first lesson).
const FONT_MONO = '"IBM Plex Mono",ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace';
const FONT_SANS = '"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

function drawText(canvas, text, o) {
  const px = 80;
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
  } else {
    // A soft dark halo keeps loose labels legible over lit objects and glows.
    c.shadowColor = 'rgba(10,11,13,0.85)';
    c.shadowBlur = px * 0.22;
  }
  c.font = font;
  c.fillStyle = o.color || '#ebe9e4';
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
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const sp = new THREE.Sprite(mat);
  sp.renderOrder = 10;
  sp.userData.noShadow = true;
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
  drawText(canvas, text, { ...o, bg: o.bg ?? null });
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(o.height * canvas.width / canvas.height, o.height);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 9;
  m.userData.noShadow = true;
  m.setText = (t) => { drawText(canvas, t, o); tex.needsUpdate = true; };
  return m;
}

/* ── Building blocks ───────────────────────────────────────────────────── */
export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: opts.roughness ?? 0.42, metalness: opts.metalness ?? 0.18,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    envMapIntensity: opts.env ?? 0.9,
    transparent: opts.opacity != null, opacity: opts.opacity ?? 1, ...opts.extra
  });
}

// Rounded boxes are built once per size and shared: a strip of 22 tiles is one geometry.
const roundedCache = new Map();
export function roundedBox(w, h, d, radius, segments = 3) {
  const key = [w, h, d, radius, segments].map(n => +n.toFixed(4)).join('|');
  let g = roundedCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, segments, radius);
    g.userData.shared = true;
    roundedCache.set(key, g);
  }
  return g;
}

/**
 * A soft coloured rim light hugging an object's silhouette (fresnel, additive).
 * It replaces wireframe edges: same colour coding, without the neon outline look.
 */
export function makeRim(geometry, color, strength = 0.5, { power = 2.4, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: strength, side, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.rimPower = { value: power };
    s.vertexShader = 'varying vec3 vRimN;\nvarying vec3 vRimV;\n' + s.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n\tvRimN = normalize( normalMatrix * normal );\n\tvRimV = normalize( -mvPosition.xyz );');
    s.fragmentShader = 'uniform float rimPower;\nvarying vec3 vRimN;\nvarying vec3 vRimV;\n' + s.fragmentShader.replace(
      '#include <opaque_fragment>',
      'diffuseColor.a *= pow( 1.0 - abs( dot( normalize( vRimN ), normalize( vRimV ) ) ), rimPower );\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => `rim${power}`;
  const rim = new THREE.Mesh(geometry, m);
  rim.renderOrder = 2;
  rim.userData.noFit = rim.userData.noShadow = true;
  return rim;
}

/**
 * A bevelled box. children[0] is its rim light (lessons recolour it via
 * box.children[0].material.color for pass/fail states), unless opts.wire === false.
 */
export function makeBox(w, h, d, color, opts = {}) {
  const r = opts.radius ?? Math.min(Math.min(w, h, d) * 0.22, 0.12);
  const g = r > 0.004 ? roundedBox(w, h, d, r, opts.segments ?? 3) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat(color, opts));
  if (opts.wire !== false) m.add(makeRim(g, opts.wireColor ?? PAL.cyan, Math.min(1, (opts.wireOpacity ?? 0.34) * 1.8)));
  return m;
}

/** A glass housing — used for "engines", vaults, containers. children[0] is its rim. */
export function makeShell(w, h, d, color = PAL.cyan, opacity = 0.09) {
  const g = roundedBox(w, h, d, Math.min(Math.min(w, h, d) * 0.08, 0.16), 4);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color, transparent: true, opacity, roughness: 0.1, metalness: 0, depthWrite: false, envMapIntensity: 1.4
  }));
  m.userData.noShadow = true;
  m.add(makeRim(g, color, 0.5, { power: 3.2, side: THREE.DoubleSide }));
  return m;
}

export function makeLine(points, color = PAL.cyan, opacity = 0.7) {
  const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false }));
}

/** A dashed link between two points (PLC, RF, network), over a thin physical cable. */
export function makeConduit(a, b, color = PAL.cyan) {
  const pa = new THREE.Vector3(...a), pb = new THREE.Vector3(...b);
  const g = new THREE.BufferGeometry().setFromPoints([pa, pb]);
  const m = new THREE.LineDashedMaterial({ color, dashSize: 0.22, gapSize: 0.16,
    transparent: true, opacity: 0.85, toneMapped: false });
  const line = new THREE.Line(g, m);
  line.computeLineDistances();
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.LineCurve3(pa, pb), 1, 0.022, 8, false),
    mat(new THREE.Color(color).multiplyScalar(0.35), { roughness: 0.6, metalness: 0.3 })
  );
  cable.userData.noFit = true;
  line.add(cable);
  return line;
}

/* ── Particles ─────────────────────────────────────────────────────────── */
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.userData.shared = true;
  return glowTex;
}

/**
 * Glowing beads travelling along a path — the workhorse for showing data in motion.
 * One instanced draw for the beads and one for their halos, however many there are.
 * @returns object with .group, .path, .speed, .active, .setColor(c), .tick(dt)
 */
export function makeFlow(pathFn, count = 26, color = PAL.cyan, size = 0.12) {
  const group = new THREE.Group();
  const beadMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const beads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(size, 1), beadMat, count);
  beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
  beads.instanceColor.setUsage(THREE.DynamicDrawUsage);
  beads.frustumCulled = false;
  beads.userData.noShadow = beads.userData.noFit = true;

  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  haloGeo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const halo = new THREE.Points(haloGeo, new THREE.PointsMaterial({
    size: size * 6, map: glowTexture(), color, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }));
  halo.frustumCulled = false;
  halo.userData.noFit = true;
  group.add(beads, halo);

  const us = Array.from({ length: count }, (_, i) => i / count);
  const dummy = new THREE.Object3D(), c = new THREE.Color();
  const place = () => {
    for (let i = 0; i < count; i++) {
      const p = api.path(us[i]);
      const fade = Math.sin(us[i] * Math.PI), a = 0.2 + 0.8 * fade;
      dummy.position.set(p[0], p[1], p[2]);
      dummy.scale.setScalar(0.55 + 0.45 * fade);
      dummy.updateMatrix();
      beads.setMatrixAt(i, dummy.matrix);
      beads.setColorAt(i, c.setScalar(a));
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a * 0.55;
    }
    beads.instanceMatrix.needsUpdate = beads.instanceColor.needsUpdate = true;
    haloGeo.attributes.position.needsUpdate = haloGeo.attributes.color.needsUpdate = true;
  };
  const api = {
    group, parts: [], speed: 0.26, active: true, path: pathFn,
    setColor(v) { beadMat.color.set(v); halo.material.color.set(v); },
    tick(dt) {
      if (!api.active) return;
      for (let i = 0; i < count; i++) us[i] = (us[i] + dt * api.speed) % 1;
      place();
    }
  };
  // Lay the beads out on their path at once (not at the origin until the first tick).
  try { place(); } catch { /* path may depend on state the lesson sets up later */ }
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
 * A grid of small bevelled cubes representing bits, drawn as ONE instanced mesh
 * (L04's 256-bit digest was 256 draw calls). .set(bitString) lights them up, and
 * changed bits flash red so the avalanche effect is visible.
 *
 * cells[i] keeps the old per-cube API — lessons write cells[i].material.color /
 * .emissive / .emissiveIntensity — and those values are copied into the instance
 * buffers each frame.
 */
export function makeBitField(bits = 64, cols = 16, opts = {}) {
  const gap = opts.gap ?? 0.28, size = opts.size ?? 0.2;
  const rows = Math.ceil(bits / cols);
  const group = new THREE.Group();

  const geo = roundedBox(size, size, size, size * 0.2, 1).clone();   // own copy: carries per-field attributes
  geo.userData = {};   // clone() shares userData by reference; this copy is not shared
  const emissive = new THREE.InstancedBufferAttribute(new Float32Array(bits * 3), 3);
  emissive.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('instEmissive', emissive);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.12, envMapIntensity: 0.9 });
  material.onBeforeCompile = (s) => {
    s.vertexShader = 'attribute vec3 instEmissive;\nvarying vec3 vInstEmissive;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvInstEmissive = instEmissive;');
    s.fragmentShader = 'varying vec3 vInstEmissive;\n' +
      s.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vInstEmissive;');
  };
  material.customProgramCacheKey = () => 'bitfield';

  const mesh = new THREE.InstancedMesh(geo, material, bits);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bits * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  group.add(mesh);

  const cells = [];
  for (let i = 0; i < bits; i++) {
    cells.push({
      position: new THREE.Vector3((i % cols - (cols - 1) / 2) * gap, -(Math.floor(i / cols) - (rows - 1) / 2) * gap, 0),
      scale: new THREE.Vector3(1, 1, 1),
      material: { color: new THREE.Color(PAL.slate), emissive: new THREE.Color(0x000000), emissiveIntensity: 1 }
    });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Color();
  const sync = () => {
    for (let i = 0; i < bits; i++) {
      const cell = cells[i];
      mesh.setMatrixAt(i, m4.compose(cell.position, q, cell.scale));
      mesh.setColorAt(i, cell.material.color);
      e.copy(cell.material.emissive).multiplyScalar(cell.material.emissiveIntensity);
      emissive.setXYZ(i, e.r, e.g, e.b);
    }
    mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = emissive.needsUpdate = true;
  };
  mesh.onBeforeRender = sync;   // picks up whatever the lesson changed this frame

  let prev = '0'.repeat(bits);
  const flash = new Array(bits).fill(0);
  const api = {
    group, cells, mesh,
    set(str, { markChanges = true } = {}) {
      const s = String(str).padStart(bits, '0').slice(-bits);
      for (let i = 0; i < bits; i++) {
        const on = s[i] === '1';
        if (markChanges && s[i] !== prev[i]) flash[i] = 1;
        cells[i].material.color.setHex(on ? PAL.cyan : PAL.slate);
        cells[i].material.emissive.setHex(on ? PAL.cyanDim : 0x000000);
        cells[i].scale.setScalar(on ? 1.08 : 0.82);
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
  sync();
  return api;
}

/** Soft additive glow sprite, for lamps and status lights. */
export function makeGlow(color = PAL.cyan, size = 1.4) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  }));
  sp.scale.setScalar(size);
  sp.userData.noShadow = sp.userData.noFit = true;
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
