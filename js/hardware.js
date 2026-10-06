// The Yaka hardware, built as objects rather than diagrams: the keypad by the door (CIU),
// the sealed meter on the pole (MCU), the pole and its line, a Ugandan house in cutaway,
// and the red-earth plot they stand on.
//
// Same visual language as the landing page's keypad: off-white ABS with moulded bevels,
// a graphite LCD bezel around a sage reflective LCD, rubber keys that travel, one orange
// accent. Everything is procedural (canvas textures, extruded and lathed geometry), so
// there are no image files to load.

import { THREE, PAL, makeLabel, makeGlow, roundedBox, DETAIL } from './scene.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';
const SANS = '"IBM Plex Sans", system-ui, "Segoe UI", Arial, sans-serif';

/* ── Shared resources ──────────────────────────────────────────────────────
   Textures and geometries are built once per page and flagged `shared`, so a
   lesson's Stage.dispose() leaves them for the next lesson. ─────────────── */
const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const share = (x) => { x.userData.shared = true; return x; };

function canvasTexture(w, h, paint, { srgb = true, wrap = false, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

/** Small deterministic PRNG, so procedural textures look the same on every visit. */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/**
 * A moulded device body: a rounded rectangle extruded with a rolled front and back edge,
 * smooth-shaded across the bevel. Centred; the front face is at z = depth / 2.
 */
function deviceBody(w, h, depth, r, bevel) {
  const g = new THREE.ExtrudeGeometry(roundRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.002, r - bevel)), {
    depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 5, curveSegments: 14
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return toCreasedNormals(g, 0.7);
}

/** Points along a hanging cable between a and b (a parabola is close enough to a catenary). */
export function sagPoints(a, b, sag, n = 18) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = A.clone().lerp(B, u);
    p.y -= 4 * sag * u * (1 - u);
    pts.push(p);
  }
  return pts;
}

/**
 * A cable through the given points. Returns the mesh, its curve, and a path function
 * for makeFlow, so data can be drawn travelling along the real wire.
 */
export function makeCable(points, { radius = 0.028, color = 0x1d1d1f, roughness = 0.55, segments } = {}) {
  const pts = points.map(p => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const len = curve.getLength();
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, segments ?? Math.max(12, Math.round(len * 14)), radius, 8, false),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05, envMapIntensity: 0.6 })
  );
  mesh.castShadow = true;
  const v = new THREE.Vector3();
  return { mesh, curve, path: (u) => curve.getPointAt(Math.min(1, Math.max(0, u)), v).toArray() };
}

/* ── LCD ──────────────────────────────────────────────────────────────────
   The reflective sage LCD of the landing page's keypad, painted to a canvas. ── */
function paintLcd(g, W, H, s) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#bfcba2');
  bg.addColorStop(1, '#abb88c');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // inner shadow where the glass meets the bezel
  const edge = (x0, y0, x1, y1, a) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(0,0,0,${a})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  };
  edge(0, 0, 0, H * 0.16, 0.34);
  edge(0, 0, W * 0.025, 0, 0.22);
  edge(W, 0, W * 0.975, 0, 0.22);

  const ink = '#1c2513';
  g.fillStyle = ink;
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(28,37,19,0.18)';
  g.shadowOffsetX = g.shadowOffsetY = Math.max(1, W * 0.0028);
  const pad = W * 0.034;
  const small = (txt, x, y, align) => {
    if (!txt) return;
    g.globalAlpha = 0.78;
    g.font = `600 ${Math.round(H * 0.105)}px ${MONO}`;
    g.letterSpacing = `${Math.round(H * 0.008)}px`;
    g.textAlign = align;
    g.fillText(txt, x, y);
    g.globalAlpha = 1;
    g.letterSpacing = '0px';
  };
  small(s.top, pad, H * 0.19, 'left');
  small(s.topRight, W - pad, H * 0.19, 'right');
  small(s.foot, pad, H * 0.84, 'left');
  small(s.footRight, W - pad, H * 0.84, 'right');

  if (s.main) {
    let size = H * (s.mainSize ?? 0.34);
    g.font = `600 ${Math.round(size)}px ${MONO}`;
    let text = s.main + (s.cursor ? '_' : '');
    const unitSize = size * 0.46;
    const room = W - pad * 2 - (s.unit ? unitSize * 2.6 : 0);
    const wNeed = g.measureText(text).width;
    if (wNeed > room) { size *= room / wNeed; g.font = `600 ${Math.round(size)}px ${MONO}`; }
    g.textAlign = 'left';
    g.fillText(text, pad, H * 0.52);
    if (s.unit) {
      const x = pad + g.measureText(text).width + size * 0.25;
      g.font = `600 ${Math.round(unitSize)}px ${MONO}`;
      g.fillText(s.unit, x, H * 0.52 + size * 0.16);
    }
  }
  g.shadowColor = 'transparent';
  // glass reflection: a hard diagonal over the left third, as on the landing page
  g.fillStyle = 'rgba(255,255,255,0.17)';
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(W * 0.37, 0); g.lineTo(W * 0.37 - H * 0.53, H); g.lineTo(0, H);
  g.closePath();
  g.fill();
}

/**
 * A live LCD panel. setState() merges new fields and repaints on the next frame.
 * Lit very slightly (emissive) so it reads in shade, like a backlit reflective LCD.
 */
function makeLcdPanel(w, h, pxW, initial) {
  const pxH = Math.round(pxW * h / w);
  const canvas = document.createElement('canvas');
  canvas.width = pxW; canvas.height = pxH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // Unlit: a reflective LCD reads the same in shade, its glass sheen is painted in, and a basic
  // material is one of the cheapest shaders to compile (see Stage._warmUp).
  const material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.userData.noShadow = true;
  let state = { ...initial }, dirty = true;
  const paint = () => { if (!dirty) return; dirty = false; paintLcd(g, pxW, pxH, state); tex.needsUpdate = true; };
  paint();
  return {
    mesh,
    get state() { return state; },
    setState(patch) {
      const next = { ...state, ...patch };
      if (Object.keys(next).some(k => next[k] !== state[k])) { state = next; dirty = true; }
    },
    paint
  };
}

/* ── LED ───────────────────────────────────────────────────────────────── */
function makeLed(color, radius = 0.024) {
  const off = new THREE.Color(0xcac4b8);
  const on = new THREE.Color(color);
  const material = new THREE.MeshStandardMaterial({ color: off, roughness: 0.25, metalness: 0, emissive: on, emissiveIntensity: 0 });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2),
    material
  );
  mesh.scale.z = 0.55;
  const glow = makeGlow(color, radius * 9);
  glow.material.opacity = 0;
  glow.position.z = radius * 0.6;
  mesh.add(glow);
  let level = 0;
  return {
    mesh,
    set(v) {
      level = typeof v === 'number' ? v : (v ? 1 : 0);
      material.color.copy(level > 0 ? on : off).lerp(off, level > 0 ? 0.35 : 0);
      material.emissiveIntensity = level * 1.6;
      glow.material.opacity = level * 0.75;
    },
    get on() { return level > 0; }
  };
}

/* ── CIU: the keypad by the door ───────────────────────────────────────────
   Laid out from the landing page's CSS keypad (320 × 470 px → 1.36 × 2.0 units). ── */
const CIU = {
  W: 1.36, H: 2.0, DEPTH: 0.26, R: 0.17, BEVEL: 0.035,
  headY: 0.8725, leds: { ok: 0.406, low: 0.483, err: 0.559 },
  lcdY: 0.5665, bezel: [1.19, 0.408], lcd: [1.122, 0.34],
  keyW: 0.36, keyH: 0.221, keyD: 0.09, colX: 0.4067, rowY: [0.1755, -0.0923, -0.36, -0.6278]
};
CIU.FRONT = CIU.DEPTH / 2;
const GLYPHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '↵'];

/** One texture holds all twelve key legends: dark ink on the light keys, white on ← and ↵. */
function keyLegendAtlas() {
  return once('ciu-legends', () => share(canvasTexture(1024, 471, (g, W, H) => {
    const cw = W / 4, ch = H / 3;
    g.lineCap = g.lineJoin = 'round';
    GLYPHS.forEach((glyph, i) => {
      const cx = (i % 4 + 0.5) * cw, cy = (Math.floor(i / 4) + 0.5) * ch;
      if (glyph === '←' || glyph === '↵') {
        // the landing page's 24-unit SVG icons, scaled up
        g.save();
        g.translate(cx - 36, cy - 36);
        g.scale(3, 3);
        g.strokeStyle = glyph === '←' ? '#f3f1ec' : '#ffffff';
        g.lineWidth = 2.1;
        g.beginPath();
        if (glyph === '←') {
          g.moveTo(9, 6); g.lineTo(20, 6); g.lineTo(20, 18); g.lineTo(9, 18); g.lineTo(4, 12); g.closePath();
          g.moveTo(12.5, 9.5); g.lineTo(17.5, 14.5); g.moveTo(17.5, 9.5); g.lineTo(12.5, 14.5);
        } else {
          g.moveTo(19, 6); g.lineTo(19, 12); g.lineTo(6, 12); g.moveTo(10, 8); g.lineTo(6, 12); g.lineTo(10, 16);
        }
        g.stroke();
        g.restore();
      } else {
        g.fillStyle = '#2b2924';
        g.font = `600 70px ${SANS}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(glyph, cx, cy + 4);
      }
    });
  })));
}

function legendGeometry(i) {
  return once(`ciu-legend-${i}`, () => {
    const g = new THREE.PlaneGeometry(CIU.keyW, CIU.keyH);
    const col = i % 4, row = Math.floor(i / 4), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / 4, 1 - (row + 1 - uv.getY(k)) / 3);
    return share(g);
  });
}

/** Silkscreen on the front: the CIU mark, the moulded inner line and the meter-number plate. */
function ciuFaceTexture(drn) {
  return once(`ciu-face-${drn}`, () => share(canvasTexture(680, 1000, (g, W, H) => {
    const k = W / 320;                                        // landing-page px → canvas px
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 2.2;
    g.beginPath(); g.roundRect(7 * k, 7 * k, W - 14 * k, H - 14 * k, 23 * k); g.stroke();
    g.strokeStyle = 'rgba(120,110,90,0.13)';
    g.lineWidth = 1.6;
    g.beginPath(); g.roundRect(6 * k, 6 * k, W - 12 * k, H - 12 * k, 24 * k); g.stroke();

    g.fillStyle = '#8a857b';
    g.font = `600 ${Math.round(11.2 * k)}px ${MONO}`;
    g.letterSpacing = `${Math.round(2.2 * k)}px`;
    g.textBaseline = 'middle';
    g.fillText('CIU', 24 * k, 30 * k);
    g.letterSpacing = '0px';

    // the recessed meter plate
    const pw = 168 * k, ph = 25 * k, px = (W - pw) / 2, py = 425 * k;
    g.fillStyle = '#e6e2d9';
    g.beginPath(); g.roundRect(px, py, pw, ph, 6 * k); g.fill();
    const inner = g.createLinearGradient(0, py, 0, py + ph);
    inner.addColorStop(0, 'rgba(0,0,0,0.16)');
    inner.addColorStop(0.25, 'rgba(0,0,0,0)');
    inner.addColorStop(0.9, 'rgba(255,255,255,0)');
    inner.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.fillStyle = inner;
    g.beginPath(); g.roundRect(px, py, pw, ph, 6 * k); g.fill();
    g.fillStyle = '#6b675e';
    g.font = `500 ${Math.round(11.5 * k)}px ${MONO}`;
    g.letterSpacing = `${Math.round(0.7 * k)}px`;
    g.textAlign = 'center';
    g.fillText(`Meter ${drn.slice(0, 4)} ${drn.slice(4, 8)} ${drn.slice(8)}`, W / 2, py + ph / 2 + 1);
    g.letterSpacing = '0px';
  })));
}

function ciuStatus(main) {
  if (/kWh/i.test(main)) return 'CREDIT';
  if (/NO CREDIT/.test(main)) return 'SUPPLY OFF';
  if (/ACCEPT/.test(main)) return 'TOKEN OK';
  if (/REJECT|USED|INCOMPLETE/.test(main)) return 'TOKEN';
  if (/TAMPER/.test(main)) return 'ALARM';
  if (/ENTER/.test(main)) return 'TOKEN ENTRY';
  return 'READY';
}

/**
 * The customer's keypad. Same API as before (group, keys, caption, setScreen, press, tick)
 * plus setLed(), entry, and enableInput(stage, { onKey, onEnter }) to type on it in 3D.
 */
export function makeCIU({ drn = '04122334455', label = true } = {}) {
  const group = new THREE.Group();
  group.name = 'CIU';

  const abs = new THREE.MeshStandardMaterial({ color: 0xefebe3, roughness: 0.55, metalness: 0, envMapIntensity: 0.95 });
  const body = new THREE.Mesh(once('ciu-body', () => share(deviceBody(CIU.W, CIU.H, CIU.DEPTH, CIU.R, CIU.BEVEL))), abs);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  const face = new THREE.Mesh(
    once('ciu-face-geo', () => share(new THREE.PlaneGeometry(CIU.W, CIU.H))),
    new THREE.MeshStandardMaterial({ map: ciuFaceTexture(drn), transparent: true, roughness: 0.55, depthWrite: false })
  );
  face.position.z = CIU.FRONT + 0.0015;
  face.userData.noShadow = true;
  group.add(face);

  // graphite bezel and the LCD inside it
  const bezel = new THREE.Mesh(roundedBox(CIU.bezel[0], CIU.bezel[1], 0.03, 0.05, 3),
    new THREE.MeshStandardMaterial({ color: 0x2f2e2b, roughness: 0.5, metalness: 0.1 }));
  bezel.position.set(0, CIU.lcdY, CIU.FRONT + 0.004);
  group.add(bezel);
  const lcd = makeLcdPanel(CIU.lcd[0], CIU.lcd[1], 1024, { top: 'READY', topRight: 'PLC ▮▮▮', main: 'READY' });
  lcd.mesh.position.set(0, CIU.lcdY, CIU.FRONT + 0.0205);
  group.add(lcd.mesh);

  const leds = { ok: makeLed(0x36b86a, 0.026), low: makeLed(0xf2a51e, 0.026), err: makeLed(0xe3412b, 0.026) };
  for (const [name, led] of Object.entries(leds)) {
    led.mesh.position.set(CIU.leds[name], CIU.headY, CIU.FRONT + 0.002);
    group.add(led.mesh);
  }

  // keys: rounded, proud of the face, each with its printed legend
  const legendMat = new THREE.MeshStandardMaterial({ map: keyLegendAtlas(), transparent: true, roughness: 0.5, depthWrite: false });
  const keyGeo = roundedBox(CIU.keyW, CIU.keyH, CIU.keyD, 0.055, 4);
  const baseZ = CIU.FRONT + 0.05 - CIU.keyD / 2;
  const keys = GLYPHS.map((glyph, i) => {
    const colour = glyph === '←' ? 0x4f4c47 : glyph === '↵' ? 0xc14d16 : 0xf7f5f0;
    const m = new THREE.MeshStandardMaterial({ color: colour, roughness: glyph === '↵' ? 0.38 : 0.42, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 0 });
    const k = new THREE.Mesh(keyGeo, m);
    k.castShadow = true;
    k.position.set((i % 3 - 1) * CIU.colX, CIU.rowY[Math.floor(i / 3)], baseZ);
    const legend = new THREE.Mesh(legendGeometry(i), legendMat);
    legend.position.z = CIU.keyD / 2 + 0.0015;
    legend.userData.noShadow = true;
    k.add(legend);
    k.userData = { glyph, base: baseZ, mesh: k, depth: 0, hold: false, tap: 0, hover: false, colour: new THREE.Color(colour) };
    group.add(k);
    return k;
  });

  let caption = null;
  if (label) {
    caption = makeLabel('CIU · Customer Interface Unit', { height: 0.16, color: '#ebe9e4', bg: 'rgba(22,23,26,0.82)' });
    caption.position.set(0, CIU.H / 2 + 0.2, 0);
    group.add(caption);
  }

  /* ── State: what the LCD shows, and digits typed so far ── */
  let entry = null;          // null = not typing
  let blink = 0;
  const showScreen = (main) => lcd.setState({ top: ciuStatus(main), main, cursor: false, footRight: '' });
  const showEntry = () => lcd.setState({
    top: 'TOKEN ENTRY', main: (entry.match(/.{1,4}/g) || ['']).join(' '),
    cursor: entry.length < 20, footRight: `${String(entry.length).padStart(2, '0')}/20`
  });
  const echo = (glyph) => {
    if (glyph === '↵') return;
    if (entry === null) entry = '';
    if (glyph === '←') entry = entry.slice(0, -1);
    else if (/\d/.test(glyph) && entry.length < 20) entry += glyph;
    showEntry();
  };
  const keyOf = (glyph) => keys.find(k => k.userData.glyph === glyph);

  const api = {
    group, body, keys, caption, lcd,
    screenText: { setText: (t) => api.setScreen(t) },
    /** The main line of the LCD. A string, or { top, main, foot, footRight }. */
    setScreen(s) {
      entry = null;
      if (typeof s === 'string') showScreen(s);
      else lcd.setState({ cursor: false, ...s });
    },
    setLed(name, on) { leds[name]?.set(on); },
    /** Animate a tap on the key showing `glyph`, and echo digits on the LCD like the real unit. */
    press(glyph) {
      const k = keyOf(glyph);
      if (k) k.userData.tap = 0.09;
      echo(glyph);
    },
    get entry() { return entry ?? ''; },
    clear() { entry = null; showScreen(lcd.state.main); },
    /** Let the user type on the 3D keypad. onKey(glyph, entry) after each key; onEnter(entry) on ↵. */
    enableInput(stage, { onKey, onEnter } = {}) {
      for (const k of keys) {
        const u = k.userData;
        stage.interactive(k, {
          hard: true,
          onDown: () => { u.hold = true; },
          onUp: () => { u.hold = false; },
          onHover: (on) => { u.hover = on; },
          onClick: () => {
            if (u.glyph === '↵') { onEnter?.(api.entry); return; }
            echo(u.glyph);
            onKey?.(u.glyph, api.entry);
          }
        });
      }
    },
    tick(dt) {
      for (const k of keys) {
        const u = k.userData;
        if (u.tap > 0) u.tap -= dt;
        const target = u.hold || u.tap > 0 ? 1 : 0;
        u.depth += (target - u.depth) * Math.min(1, dt * 28);
        k.position.z = u.base - u.depth * 0.026;
        k.material.color.copy(u.colour).multiplyScalar(1 - u.depth * 0.08);
        k.material.emissiveIntensity += ((u.hover ? 0.07 : 0) - k.material.emissiveIntensity) * Math.min(1, dt * 14);
      }
      if (entry !== null) {
        blink += dt;
        if (blink > 0.5) { blink = 0; lcd.setState({ cursor: entry.length < 20 && !lcd.state.cursor }); }
      }
      lcd.paint();
    }
  };
  showScreen('READY');
  return api;
}

/* ── MCU: the sealed meter on the pole ─────────────────────────────────────── */
const MCU = {
  W: 1.6, H: 2.6, DEPTH: 0.62, R: 0.14, BEVEL: 0.045,
  plate: [1.38, 1.5], plateY: 0.42,
  lcd: [1.121, 0.353], lcdY: 0.772,
  ledY: 0.496, ledX: { pulse: -0.461, power: -0.151, relay: 0.159, tamper: 0.469 },
  terminalsX: [-0.48, -0.16, 0.16, 0.48]
};
MCU.FRONT = MCU.DEPTH / 2;

function fmtDrn(drn) { return `${drn.slice(0, 4)} ${drn.slice(4, 8)} ${drn.slice(8)}`; }

/** The printed faceplate behind the window: maker, ratings, LED legends, barcode and the DRN. */
function mcuFaceTexture(drn) {
  return once(`mcu-face-${drn}`, () => share(canvasTexture(1024, 1113, (g, W, H) => {
    g.fillStyle = '#efece5';
    g.fillRect(0, 0, W, H);
    const sheen = g.createLinearGradient(0, 0, 0, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.4)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.05)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#cdc8be';
    g.lineWidth = 14;
    g.beginPath(); g.roundRect(7, 7, W - 14, H - 14, 22); g.stroke();

    g.textBaseline = 'middle';
    g.fillStyle = '#2b2924';
    g.font = `700 34px ${SANS}`;
    g.letterSpacing = '6px';
    g.fillText('CRYPTO LAB', 64, 72);
    g.letterSpacing = '0px';
    g.textAlign = 'right';
    g.fillStyle = '#6b675e';
    g.font = `500 28px ${MONO}`;
    g.fillText('CL-1 · STS', W - 64, 72);
    g.textAlign = 'left';
    g.font = `500 25px ${SANS}`;
    g.fillText('Prepayment energy meter · measurement control unit', 64, 116);

    // the LCD's bezel; the live LCD plane sits inside it
    g.fillStyle = '#2c2b28';
    g.beginPath(); g.roundRect(82, 150, 860, 290, 18); g.fill();

    g.textAlign = 'center';
    for (const [name, x] of [['PULSE', 170], ['POWER', 400], ['RELAY', 630], ['TAMPER', 860]]) {
      g.fillStyle = '#d4cfc4';
      g.beginPath(); g.arc(x, 500, 27, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#46433c';
      g.font = `600 22px ${SANS}`;
      g.letterSpacing = '3px';
      g.fillText(name, x, 556);
      g.letterSpacing = '0px';
    }
    g.font = `500 18px ${MONO}`;
    g.fillStyle = '#6b675e';
    g.fillText('1000 imp/kWh', 170, 588);
    g.fillStyle = '#d6d1c7';
    g.fillRect(64, 622, W - 128, 3);

    g.textAlign = 'left';
    g.fillStyle = '#2b2924';
    g.font = `500 30px ${MONO}`;
    g.fillText('230 V   5(60) A   50 Hz', 64, 676);
    g.fillStyle = '#6b675e';
    g.font = `500 23px ${SANS}`;
    g.fillText('Class 1 · IEC 62053-21', 64, 722);
    g.fillText('STS token · IEC 62055-41', 64, 758);

    const r = rng(7);
    for (let x = 640; x < 950;) {
      const w = 2 + Math.floor(r() * 4);
      if (r() > 0.42) { g.fillStyle = '#1d1c19'; g.fillRect(x, 650, w, 92); }
      x += w + 1 + Math.floor(r() * 2);
    }
    g.textAlign = 'center';
    g.font = `500 19px ${MONO}`;
    g.fillStyle = '#46433c';
    g.fillText('SN CL1-24-118734', 795, 765);

    g.textAlign = 'left';
    g.fillStyle = '#8a857b';
    g.font = `600 23px ${SANS}`;
    g.letterSpacing = '4px';
    g.fillText('DRN · QUOTE THIS WHEN BUYING', 64, 836);
    g.letterSpacing = '2px';
    g.fillStyle = '#1d1c19';
    g.font = `600 64px ${MONO}`;
    g.fillText(fmtDrn(drn), 64, 902);
    g.letterSpacing = '0px';
    g.fillStyle = '#8a857b';
    g.font = `500 20px ${SANS}`;
    g.fillText('Sealed unit. Opening the terminal cover disconnects the supply.', 64, 990);
    g.fillText('Educational model, not a utility meter.', 64, 1024);
  })));
}

function coverTexture() {
  return once('mcu-cover', () => share(canvasTexture(768, 400, (g, W, H) => {
    // moulded grip ribs along the bottom edge
    for (let i = 0; i < 9; i++) {
      const x = W * 0.18 + i * W * 0.08;
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(x, H * 0.72, 10, H * 0.2);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x + 10, H * 0.72, 4, H * 0.2);
    }
    // warning mark and legend
    const tx = W * 0.5 - 150, ty = H * 0.42;
    g.fillStyle = '#e8b21c';
    g.beginPath(); g.moveTo(tx, ty + 34); g.lineTo(tx + 38, ty - 32); g.lineTo(tx + 76, ty + 34); g.closePath(); g.fill();
    g.strokeStyle = '#1d1c19'; g.lineWidth = 5; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = '#1d1c19';
    g.beginPath(); g.moveTo(tx + 42, ty - 12); g.lineTo(tx + 30, ty + 8); g.lineTo(tx + 40, ty + 8);
    g.lineTo(tx + 34, ty + 26); g.lineTo(tx + 48, ty + 2); g.lineTo(tx + 38, ty + 2); g.closePath(); g.fill();
    g.textBaseline = 'middle';
    g.font = `700 30px ${SANS}`;
    g.letterSpacing = '4px';
    g.fillText('TERMINAL COVER', tx + 96, ty - 12);
    g.letterSpacing = '1px';
    g.font = `500 22px ${SANS}`;
    g.fillStyle = '#46433c';
    g.fillText('Sealed. Opening it trips the meter.', tx + 96, ty + 22);
  })));
}

/**
 * The measurement control unit. Keeps the old API (group, body, cover, seal, lamps, caption,
 * setScreen, setLamp, setCoverOpen, tick) and adds anchors for cables and setLoad().
 * mount: { poleRadius } adds the bands that clamp it to a pole behind it.
 */
export function makeMCU({ drn = '04122334455', label = true, mount = null } = {}) {
  const group = new THREE.Group();
  group.name = 'MCU';
  const F = MCU.FRONT;

  const pc = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.5, metalness: 0, envMapIntensity: 0.95 });
  const body = new THREE.Mesh(once('mcu-body', () => share(deviceBody(MCU.W, MCU.H, MCU.DEPTH, MCU.R, MCU.BEVEL))), pc);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  const plate = new THREE.Mesh(once('mcu-plate-geo', () => share(new THREE.PlaneGeometry(...MCU.plate))),
    new THREE.MeshStandardMaterial({ map: mcuFaceTexture(drn), roughness: 0.6 }));
  plate.position.set(0, MCU.plateY, F + 0.002);
  plate.receiveShadow = true;
  group.add(plate);

  const lcd = makeLcdPanel(MCU.lcd[0], MCU.lcd[1], 1024, { top: 'BALANCE', topRight: 'RELAY OFF', main: '0.0', unit: 'kWh', mainSize: 0.46 });
  lcd.mesh.position.set(0, MCU.lcdY, F + 0.004);
  group.add(lcd.mesh);

  const ledColours = { pulse: 0xe3412b, power: 0x36b86a, relay: 0x4f8fe0, tamper: 0xf07a1a };
  const ledObjs = {};
  for (const [name, x] of Object.entries(MCU.ledX)) {
    const led = makeLed(ledColours[name], 0.03);
    led.mesh.position.set(x, MCU.ledY, F + 0.004);
    group.add(led.mesh);
    ledObjs[name] = led;
  }

  // clear polycarbonate window over the faceplate (its back sits inside the body: no z-fighting)
  const glass = new THREE.Mesh(roundedBox(1.46, 1.58, 0.1, 0.045, 4), new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14,
    envMapIntensity: 1.7, depthWrite: false
  }));
  glass.position.set(0, MCU.plateY, F + 0.048);
  glass.userData.noShadow = true;
  group.add(glass);

  /* terminal block, revealed when the cover comes off */
  const dark = new THREE.MeshStandardMaterial({ color: 0x34322e, roughness: 0.6 });
  const block = new THREE.Mesh(roundedBox(1.3, 0.38, 0.13, 0.03, 2), dark);
  block.position.set(0, -0.8, F + 0.03);
  group.add(block);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc79a49, roughness: 0.32, metalness: 1, envMapIntensity: 1.2 });
  const screwMat = new THREE.MeshStandardMaterial({ color: 0xb8bbbd, roughness: 0.3, metalness: 1 });
  const wireColours = [0x7a4a24, 0x2e5fa8, 0x7a4a24, 0x2e5fa8];     // live in, neutral in, live out, neutral out
  MCU.terminalsX.forEach((x, i) => {
    const t = new THREE.Mesh(roundedBox(0.18, 0.16, 0.1, 0.02, 2), brass);
    t.position.set(x, -0.8, F + 0.075);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16).rotateX(Math.PI / 2), screwMat);
    s.position.set(x, -0.78, F + 0.135);
    const cable = makeCable([[x, -0.88, F + 0.075], [x, -1.05, F + 0.06], [x * 0.95, -1.25, 0.2], [x * 0.9, -1.42, 0.12], [x * 0.9, -1.6, 0.1]],
      { radius: 0.032, color: wireColours[i] });
    const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 18), new THREE.MeshStandardMaterial({ color: 0x1f1e1c, roughness: 0.7 }));
    gland.position.set(x * 0.9, -1.33, 0.12);
    gland.castShadow = true;
    group.add(t, s, cable.mesh, gland);
  });

  /* terminal cover, hinged at its bottom front edge, with seal screws and the seal wire */
  const cover = new THREE.Group();
  cover.position.set(0, -1.25, F + 0.17);
  const coverMat = new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.52, metalness: 0 });
  const coverBox = new THREE.Mesh(roundedBox(1.5, 0.82, 0.2, 0.06, 4), coverMat);
  coverBox.position.set(0, 0.41, -0.1);
  coverBox.castShadow = coverBox.receiveShadow = true;
  const coverFace = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 0.72),
    new THREE.MeshStandardMaterial({ map: coverTexture(), transparent: true, roughness: 0.55, depthWrite: false }));
  coverFace.position.set(0, 0.4, 0.0015);
  coverFace.userData.noShadow = true;
  cover.add(coverBox, coverFace);
  const screwGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.03, 18).rotateX(Math.PI / 2);
  for (const x of [-0.6, 0.6]) {
    const s = new THREE.Mesh(screwGeo, screwMat);
    s.position.set(x, 0.66, 0.008);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), dark);
    slot.position.set(x, 0.66, 0.024);
    slot.rotation.z = 0.6;
    cover.add(s, slot);
  }
  const seal = new THREE.Group();
  const sealWire = makeCable([[-0.6, 0.66, 0.03], [-0.3, 0.56, 0.042], [0, 0.53, 0.048], [0.3, 0.56, 0.042], [0.6, 0.66, 0.03]],
    { radius: 0.006, color: 0xb7b2a6, roughness: 0.35 });
  sealWire.mesh.material.metalness = 0.8;
  const sealBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.024, 20).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.45 }));
  sealBody.position.set(0, 0.53, 0.05);
  seal.add(sealWire.mesh, sealBody);
  cover.add(seal);
  group.add(cover);

  // galvanised bracket behind, and (on a pole) the two bands that clamp it
  const galv = new THREE.MeshStandardMaterial({ color: 0xaab0b4, roughness: 0.38, metalness: 0.85, envMapIntensity: 1.1 });
  const bracket = new THREE.Mesh(roundedBox(1.25, 2.2, 0.04, 0.015, 2), galv);
  bracket.position.z = -MCU.DEPTH / 2 - 0.02;
  bracket.castShadow = true;
  group.add(bracket);
  if (mount?.poleRadius) {
    const zc = -MCU.DEPTH / 2 - 0.045 - mount.poleRadius;
    for (const y of [-0.8, 0.8]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(mount.poleRadius + 0.012, 0.016, 8, 40).rotateX(Math.PI / 2), galv);
      band.position.set(0, y, zc);
      band.castShadow = true;
      group.add(band);
    }
  }

  let caption = null, sub = null;
  if (label) {
    caption = makeLabel('MCU · Measurement Control Unit', { height: 0.18, color: '#ebe9e4', bg: 'rgba(22,23,26,0.82)' });
    caption.position.set(0, MCU.H / 2 + 0.36, 0);
    sub = makeLabel('sealed · pole-mounted · holds the Decoder Key', { height: 0.13, color: '#b3b0a8' });
    sub.position.set(0, MCU.H / 2 + 0.14, 0);
    group.add(caption, sub);
  }

  const lamps = {};
  for (const name of ['power', 'relay', 'tamper']) lamps[name] = { mesh: ledObjs[name].mesh, led: ledObjs[name], color: ledColours[name] };

  let pulseT = 0, load = 1, coverOpen = 0;
  const api = {
    group, body, cover, seal, lamps, caption, sub, lcd, glass,
    screenText: { setText: (t) => api.setScreen(t) },
    /** Where cables meet the unit, in its local space: glands under it, live in and live out. */
    anchors: {
      glandIn: new THREE.Vector3(MCU.terminalsX[0] * 0.9, -1.6, 0.1),
      glandOut: new THREE.Vector3(MCU.terminalsX[3] * 0.9, -1.6, 0.1),
      lcd: new THREE.Vector3(0, MCU.lcdY, F + 0.05)
    },
    setScreen(text) {
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*(kWh)?\s*$/i.exec(String(text));
      if (m) lcd.setState({ top: 'BALANCE', main: m[1], unit: 'kWh' });
      else lcd.setState({ top: /TAMPER/i.test(text) ? 'ALARM' : 'STATUS', main: String(text), unit: '' });
    },
    setLamp(name, on, intensity = 1.6) {
      ledObjs[name]?.set(on ? Math.min(1, intensity / 1.6) : 0);
      if (name === 'relay') lcd.setState({ topRight: on ? 'RELAY ON' : 'RELAY OFF' });
    },
    /** How fast the pulse LED blinks while the relay is closed (1 = a lamp's worth). */
    setLoad(v) { load = v; },
    setCoverOpen(v) {
      coverOpen = v;
      cover.rotation.x = v * 1.45;
      seal.visible = v < 0.02;
    },
    get coverOpen() { return coverOpen; },
    tick(dt) {
      if (ledObjs.relay.on && load > 0) {
        pulseT -= dt * load;
        if (pulseT <= 0) pulseT = 0.75;
        ledObjs.pulse.set(pulseT > 0.66 ? 1 : 0);
      } else ledObjs.pulse.set(0);
      lcd.paint();
    }
  };
  api.setLamp('power', true, 1.2);
  return api;
}

/* ── Materials shared by the outdoor props ────────────────────────────────── */
const galvanised = () => new THREE.MeshStandardMaterial({ color: 0xaab0b4, roughness: 0.38, metalness: 0.85, envMapIntensity: 1.1 });

/** Treated pole timber: long grain, seasoning cracks, weathered top, soil-stained foot. */
function woodTexture() {
  return once('wood', () => {
    const t = canvasTexture(256, 1024, (g, W, H) => {
      const r = rng(11);
      g.fillStyle = '#6b5643';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = r() > 0.5 ? `rgba(40,28,18,${0.08 + r() * 0.2})` : `rgba(196,170,134,${0.05 + r() * 0.12})`;
        g.fillRect(r() * W, r() * H * 0.4, 1 + r() * 3, H * (0.4 + r() * 0.8));
      }
      g.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        let x = r() * W, y = r() * H * 0.85;
        g.strokeStyle = 'rgba(24,15,9,0.6)';
        g.lineWidth = 1 + r() * 1.6;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 9; k++) { x += (r() - 0.5) * 3; y += H * (0.015 + r() * 0.02); g.lineTo(x, y); }
        g.stroke();
      }
      const top = g.createLinearGradient(0, 0, 0, H * 0.4);
      top.addColorStop(0, 'rgba(160,150,138,0.25)');
      top.addColorStop(1, 'rgba(160,150,138,0)');
      g.fillStyle = top; g.fillRect(0, 0, W, H * 0.4);
      const foot = g.createLinearGradient(0, H * 0.88, 0, H);
      foot.addColorStop(0, 'rgba(40,24,14,0)');
      foot.addColorStop(1, 'rgba(40,24,14,0.65)');
      g.fillStyle = foot; g.fillRect(0, H * 0.88, W, H * 0.12);
    }, { wrap: true });
    t.repeat.set(1.5, 1);
    return share(t);
  });
}

function insulatorGeometry() {
  return once('insulator', () => share(new THREE.LatheGeometry([
    [0.035, 0], [0.075, 0.006], [0.135, 0.032], [0.14, 0.046], [0.075, 0.062], [0.105, 0.088],
    [0.108, 0.102], [0.064, 0.118], [0.068, 0.15], [0.078, 0.165], [0.073, 0.182], [0.052, 0.192],
    [0.03, 0.195], [0.001, 0.196]
  ].map(([x, y]) => new THREE.Vector2(x, y)), 28)));
}

function tagTexture(text) {
  return once(`tag-${text}`, () => share(canvasTexture(256, 160, (g, W, H) => {
    g.fillStyle = '#c9cdd0'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#8f9497'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = '#25282b';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 52px ${MONO}`;
    g.fillText(text, W / 2, H / 2 + 2);
    for (const [x, y] of [[18, 18], [W - 18, 18], [18, H - 18], [W - 18, H - 18]]) {
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fillStyle = '#7d8285'; g.fill();
    }
  })));
}

/**
 * A treated-timber distribution pole: crossarm along z with three porcelain pin insulators,
 * conductors strung along x across `span` (pole-local x range). Origin at ground level.
 * Returns the group; group.anchors has radiusAt(y), armY, and the conductors' heights.
 */
export function makePole(opts = {}) {
  if (typeof opts === 'number') opts = { height: opts };
  const { height = 7.4, span = [-6, 6], tag = 'LV 0147', wires = true } = opts;
  const group = new THREE.Group();
  group.name = 'Pole';
  const rTop = 0.15, rBase = 0.21;
  const radiusAt = (y) => rBase + (rTop - rBase) * Math.min(1, Math.max(0, y / height));

  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.86, metalness: 0 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBase, height, 36, 1).translate(0, height / 2, 0), wood);
  shaft.castShadow = shaft.receiveShadow = true;
  group.add(shaft);

  const galv = galvanised();
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.012, rTop + 0.012, 0.03, 36), galv);
  cap.position.y = height + 0.015;
  const armY = height - 0.34;
  const arm = new THREE.Mesh(roundedBox(0.12, 0.14, 2.3, 0.02, 2), galv);
  arm.position.y = armY;
  arm.castShadow = true;
  group.add(cap, arm);
  for (const s of [-1, 1]) {                       // diagonal braces from crossarm to pole
    const a = new THREE.Vector3(0, armY - 0.07, s * 0.78), b = new THREE.Vector3(0, armY - 0.8, s * (rTop + 0.02));
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.03, a.distanceTo(b), 0.05), galv);
    brace.position.copy(a).add(b).multiplyScalar(0.5);
    brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
    brace.castShadow = true;
    group.add(brace);
  }

  const porcelain = new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.14, metalness: 0, envMapIntensity: 1.3 });
  const insulators = [[0, armY + 0.07, -0.95], [0, height + 0.03, 0], [0, armY + 0.07, 0.95]];
  const wireAt = [];
  for (const [x, y, z] of insulators) {
    const ins = new THREE.Mesh(insulatorGeometry(), porcelain);
    ins.position.set(x, y + 0.04, z);
    ins.castShadow = true;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 10), galv);
    pin.position.set(x, y + 0.01, z);
    group.add(ins, pin);
    wireAt.push({ y: y + 0.21, z });
  }

  // conductors: falling away from the support towards mid-span, beyond the plot's edge
  const L = Math.max(Math.abs(span[0]), Math.abs(span[1]));
  const wireY = (y0, x) => y0 - 0.3 * Math.abs(x) / L + 0.08 * (x / L) ** 2;
  if (wires) {
    const alu = new THREE.MeshStandardMaterial({ color: 0xc4c8ca, roughness: 0.32, metalness: 0.9 });
    for (const w of wireAt) {
      const pts = [];
      for (let i = 0; i <= 28; i++) { const x = span[0] + (span[1] - span[0]) * i / 28; pts.push(new THREE.Vector3(x, wireY(w.y, x), w.z)); }
      const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.016, 6, false), alu);
      wire.castShadow = true;
      wire.userData.noFit = true;            // the line runs on out of view; don't frame the camera on it
      group.add(wire);
    }
  }

  const tagMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.125),
    new THREE.MeshStandardMaterial({ map: tagTexture(tag), roughness: 0.4, metalness: 0.6 }));
  tagMesh.position.set(0, 1.75, radiusAt(1.75) + 0.004);
  group.add(tagMesh);

  const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 0.09, 30),
    new THREE.MeshStandardMaterial({ color: 0x5e3b26, roughness: 1 }));
  mound.position.y = 0.045;
  mound.receiveShadow = true;
  group.add(mound);

  group.anchors = { height, armY, radiusAt, wireAt, wireY: (i, x) => wireY(wireAt[i].y, x) };
  return group;
}

/* ── House ─────────────────────────────────────────────────────────────────
   A Ugandan home in cutaway: plastered brick, painted with a maroon dado band,
   corrugated iron roof on timber trusses. Ridge runs front-to-back (z) so the
   camera sees the iron from outside and the room through the open front gable. ── */
const HOUSE = { W: 3.8, D: 3.4, H: 2.3, P: 0.18, t: 0.14, rise: 1.15, eave: 0.24, gable: 0.2 };

function plasterTexture() {
  return once('plaster', () => share(canvasTexture(512, 512, (g, W, H) => {
    const r = rng(21);
    const band = H * 0.72;                     // bottom 28 % is the dado
    g.fillStyle = '#e9dfcb'; g.fillRect(0, 0, W, band);
    g.fillStyle = '#7b3427'; g.fillRect(0, band, W, H - band);
    g.fillStyle = '#5f281e'; g.fillRect(0, band - 3, W, 5);
    for (let i = 0; i < 9000; i++) {
      const y = r() * H, light = r() > 0.5;
      g.fillStyle = y < band
        ? (light ? 'rgba(255,255,255,0.18)' : 'rgba(120,100,70,0.10)')
        : (light ? 'rgba(255,200,180,0.10)' : 'rgba(40,10,6,0.16)');
      g.fillRect(r() * W, y, 1 + r() * 2, 1 + r() * 2);
    }
    // splash marks along the foot, where rain bounces off the ground
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(90,45,25,${0.08 + r() * 0.12})`;
      g.fillRect(r() * W, H - r() * H * 0.08, 2 + r() * 4, 2 + r() * 3);
    }
  })));
}

/** Brick courses for the cut faces of the walls; tall for wall ends, long for the knee wall. */
function brickTexture(tall) {
  return once(`brick-${tall}`, () => share(canvasTexture(tall ? 64 : 1024, tall ? 1024 : 64, (g, W, H) => {
    const r = rng(tall ? 31 : 32);
    g.fillStyle = '#c2b29b'; g.fillRect(0, 0, W, H);
    const bh = tall ? 30 : 24, bw = tall ? 64 : 58;
    for (let row = 0, y = 0; y < H; row++, y += bh) {
      for (let x = (row % 2) * -bw / 2; x < W; x += bw) {
        const l = 0.85 + r() * 0.3;
        g.fillStyle = `rgb(${155 * l | 0},${80 * l | 0},${52 * l | 0})`;
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
    }
  })));
}

function doorTexture() {
  return once('door', () => share(canvasTexture(256, 512, (g, W, H) => {
    g.fillStyle = '#2f5546'; g.fillRect(0, 0, W, H);
    const panel = (x, y, w, h) => {
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 6; g.strokeRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.strokeRect(x + 6, y + 6, w - 6, h - 6);
    };
    panel(30, 34, W - 60, H * 0.38);
    panel(30, H * 0.5, W - 60, H * 0.44);
    for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  })));
}

/** A woven mat and the curtain fabric: bold kitenge-style stripes. */
function fabricTexture(kind) {
  return once(`fabric-${kind}`, () => share(canvasTexture(256, 256, (g, W, H) => {
    if (kind === 'mat') {
      const cols = ['#b5462a', '#e0a33a', '#1f3f6e', '#efe4cf', '#2b2622'];
      for (let y = 0, i = 0; y < H; i++) { const h = 10 + (i * 7) % 22; g.fillStyle = cols[i % cols.length]; g.fillRect(0, y, W, h); y += h; }
      for (let x = 0; x < W; x += 4) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 1, H); }
    } else {
      g.fillStyle = '#1f5d6b'; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 32) for (let x = (y / 32 % 2) * 16; x < W; x += 32) {
        g.fillStyle = '#e8a33a'; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#f4ead6'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.stroke();
      }
    }
  }, { wrap: true })));
}

/** Corrugated sheet: crests run down the slope (s), the wave runs across it (z). Normal is +y. */
function corrugatedSheet(length, width, wave = 0.135, amp = 0.022) {
  const nz = Math.ceil(width / wave) * 8, ns = 2, pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    const z = -width / 2 + width * j / nz, h = amp * Math.sin(z / wave * Math.PI * 2);
    for (let i = 0; i <= ns; i++) { const s = length * i / ns; pos.push(s, h, z); uv.push(s / length, j / nz); }
  }
  const row = ns + 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < ns; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ironTexture() {
  return once('iron', () => share(canvasTexture(512, 512, (g, W, H) => {
    const r = rng(41);
    g.fillStyle = '#c4c8ca'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) {                    // galvanising spangle and grime
      const x = r() * W, y = r() * H, rad = 10 + r() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() > 0.5 ? '150,154,156' : '205,208,210';
      gr.addColorStop(0, `rgba(${c},0.35)`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 90; i++) {                     // rust running down the troughs towards the eave (u → 1)
      const y = r() * H, x0 = W * (0.35 + r() * 0.5);
      const gr = g.createLinearGradient(x0, 0, W, 0);
      gr.addColorStop(0, 'rgba(139,82,46,0)'); gr.addColorStop(1, `rgba(139,82,46,${0.15 + r() * 0.3})`);
      g.fillStyle = gr; g.fillRect(x0, y, W - x0, 1 + r() * 3);
    }
  })));
}

export function makeHouse({ cutaway = true } = {}) {
  const { W, D, H, P, t, rise, eave, gable } = HOUSE;
  const group = new THREE.Group();
  group.name = 'House';
  const walls = new THREE.Group();
  group.add(walls);
  const yEave = P + H, yRidge = yEave + rise;
  const occluders = [];

  const ext = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.92 });
  const int = new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.95 });
  const cutTall = new THREE.MeshStandardMaterial({ map: brickTexture(true), roughness: 0.95 });
  const cutLong = new THREE.MeshStandardMaterial({ map: brickTexture(false), roughness: 0.95 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa39e94, roughness: 0.92 });
  const mats = { ext, int, cutTall, cutLong };
  const wall = (w, h, d, faces) => {            // faces: px, nx, py, ny, pz, nz
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), faces.map(f => mats[f]));
    m.castShadow = m.receiveShadow = true;
    walls.add(m);
    occluders.push(m);
    return m;
  };

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, P, D + 0.12), concrete);
  plinth.position.y = P / 2;
  plinth.castShadow = plinth.receiveShadow = true;
  walls.add(plinth);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * t, 0.012, D - t),
    new THREE.MeshStandardMaterial({ color: 0x8f887c, roughness: 0.5 }));
  floor.position.set(0, P + 0.006, t / 2);
  floor.receiveShadow = true;
  walls.add(floor);

  wall(W, H, t, ['ext', 'ext', 'ext', 'ext', 'int', 'ext']).position.set(0, P + H / 2, -D / 2 + t / 2);
  const front = cutaway ? 'cutTall' : 'ext';
  wall(t, H, D - t, ['int', 'ext', 'ext', 'ext', front, 'ext']).position.set(-W / 2 + t / 2, P + H / 2, t / 2);
  wall(t, H, D - t, ['ext', 'int', 'ext', 'ext', front, 'ext']).position.set(W / 2 - t / 2, P + H / 2, t / 2);
  if (cutaway) wall(W - 2 * t, 0.55, t, ['cutTall', 'cutTall', 'cutLong', 'ext', 'ext', 'int']).position.set(0, P + 0.275, D / 2 - t / 2);

  // back gable (the front one is cut away)
  const tri = new THREE.Shape();
  tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, rise); tri.closePath();
  const gableMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: t, bevelEnabled: false }), int);
  gableMesh.position.set(0, yEave, -D / 2);
  gableMesh.castShadow = gableMesh.receiveShadow = true;
  walls.add(gableMesh);
  occluders.push(gableMesh);

  /* door and window on the right wall, the one the camera sees from outside */
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.5, metalness: 0.4 });
  const doorZ = 0.5, doorW = 0.95, doorH = 1.95;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, doorH, doorW),
    new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.45, metalness: 0.35 }));
  door.position.set(W / 2 + 0.025, P + doorH / 2, doorZ);
  door.castShadow = true;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.14), new THREE.MeshStandardMaterial({ color: 0xd9d9d6, roughness: 0.2, metalness: 1 }));
  handle.position.set(W / 2 + 0.07, P + 1.0, doorZ - doorW / 2 + 0.14);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, doorW + 0.3), concrete);
  step.position.set(W / 2 + 0.27, 0.06, doorZ);
  step.castShadow = step.receiveShadow = true;
  walls.add(door, handle, step);
  for (const [w, h, d, y, z] of [[0.07, doorH + 0.07, 0.06, P + doorH / 2, doorZ - doorW / 2 - 0.03],
                                  [0.07, doorH + 0.07, 0.06, P + doorH / 2, doorZ + doorW / 2 + 0.03],
                                  [0.07, 0.06, doorW + 0.12, P + doorH + 0.03, doorZ]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    f.position.set(W / 2 + 0.03, y, z);
    walls.add(f);
  }

  // glass panes glow warm when the lamp inside is on
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.4,
    emissive: 0xffc777, emissiveIntensity: 0 });
  const barGeos = [], frameGeos = [];
  const windowAt = (x, y, z, w, h, axis) => {          // axis 'x': in a wall facing ±x; 'z': facing ±z
    // size along the wall (sw), up (sh), through the wall (sd) → a box in this wall's frame
    const box = (sw, sh, sd) => (axis === 'x' ? new THREE.BoxGeometry(sd, sh, sw) : new THREE.BoxGeometry(sw, sh, sd));
    const at = (g, u, v) => g.translate(axis === 'x' ? x : x + u, y + v, axis === 'x' ? z + u : z);
    const pane = new THREE.Mesh(box(w, h, t + 0.02), glassMat);
    pane.position.set(x, y, z);
    walls.add(pane);
    const fw = 0.06, fd = t + 0.06;                     // the steel frame: four bars round the opening
    frameGeos.push(at(box(w + fw * 2, fw, fd), 0, h / 2 + fw / 2), at(box(w + fw * 2, fw, fd), 0, -h / 2 - fw / 2),
                   at(box(fw, h, fd), -w / 2 - fw / 2, 0), at(box(fw, h, fd), w / 2 + fw / 2, 0),
                   at(box(w, 0.035, fd), 0, 0));        // transom
    for (let i = 1; i < 5; i++) {                       // burglar bars
      const b = new THREE.CylinderGeometry(0.011, 0.011, h, 6);
      b.translate(axis === 'x' ? x + Math.sign(x) * (t / 2 + 0.035) : x - w / 2 + w * i / 5, y,
                  axis === 'x' ? z - w / 2 + w * i / 5 : z + Math.sign(z) * (t / 2 + 0.035));
      barGeos.push(b);
    }
    for (const yy of [y - h / 4, y + h / 4]) {
      const b = new THREE.CylinderGeometry(0.011, 0.011, w, 6).rotateZ(axis === 'x' ? 0 : Math.PI / 2);
      if (axis === 'x') b.rotateX(Math.PI / 2);
      b.translate(axis === 'x' ? x + Math.sign(x) * (t / 2 + 0.035) : x, yy, axis === 'x' ? z : z + Math.sign(z) * (t / 2 + 0.035));
      barGeos.push(b);
    }
  };
  windowAt(W / 2 - t / 2, P + 1.45, -0.85, 0.9, 0.95, 'x');
  windowAt(0.55, P + 1.45, -D / 2 + t / 2, 1.0, 0.95, 'z');
  const bars = new THREE.Mesh(mergeGeometries([...barGeos, ...frameGeos]), frameMat);
  bars.castShadow = true;
  walls.add(bars);

  // curtain inside the back window: a draped fabric with folds
  const curtainGeo = new THREE.PlaneGeometry(0.5, 1.15, 24, 1);
  const cp = curtainGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 38) * 0.025);
  curtainGeo.computeVertexNormals();
  const curtainMat = new THREE.MeshStandardMaterial({ map: fabricTexture('curtain'), roughness: 0.85, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(curtainGeo, curtainMat);
    c.position.set(0.55 + s * 0.52, P + 1.42, -D / 2 + t + 0.06);
    walls.add(c);
  }

  /* roof: two corrugated slopes, ridge cap, fascia, and the timber that carries them */
  const half = W / 2 + eave, a = Math.atan2(rise, W / 2);
  const Ls = half / Math.cos(a) + 0.04, Dz = D + gable * 2;
  const iron = new THREE.MeshStandardMaterial({ map: ironTexture(), color: 0xffffff, roughness: 0.42, metalness: 0.62,
    side: THREE.DoubleSide, envMapIntensity: 1.0 });
  const sheetGeo = once('roof-sheet', () => share(corrugatedSheet(Ls, Dz)));
  const roof = new THREE.Group();
  for (const s of [1, -1]) {
    const sheet = new THREE.Mesh(sheetGeo, iron);
    sheet.rotation.z = -a;
    sheet.scale.x = s;
    if (s < 0) { sheet.rotation.z = a; sheet.scale.x = -1; }
    sheet.position.set(0, yRidge + 0.03, 0);
    sheet.castShadow = sheet.receiveShadow = true;
    roof.add(sheet);
    occluders.push(sheet);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.17, Dz), new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.7 }));
    fascia.position.set(s * (half + 0.01), yRidge + 0.03 - Math.tan(a) * half - 0.07, 0);
    fascia.castShadow = true;
    roof.add(fascia);
    const capStrip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, Dz + 0.02), new THREE.MeshStandardMaterial({ color: 0xb9bdbf, roughness: 0.35, metalness: 0.8 }));
    capStrip.rotation.z = -s * a;
    capStrip.position.set(s * 0.115, yRidge + 0.07 - 0.115 * Math.tan(a), 0);
    capStrip.castShadow = true;
    roof.add(capStrip);
  }
  const timberGeos = [];
  const beam = (len, w, h, from, dir) => {             // a box of length len laid from `from` along unit `dir`
    const g = new THREE.BoxGeometry(w, len, h);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    g.applyQuaternion(q);
    const c = from.clone().addScaledVector(dir.clone().normalize(), len / 2);
    g.translate(c.x, c.y, c.z);
    timberGeos.push(g);
  };
  beam(Dz - 0.1, 0.08, 0.14, new THREE.Vector3(0, yRidge - 0.12, -Dz / 2 + 0.05), new THREE.Vector3(0, 0, 1));    // ridge beam
  for (const s of [-1, 1]) beam(D, 0.12, 0.08, new THREE.Vector3(s * (W / 2 - t / 2), yEave + 0.04, -D / 2), new THREE.Vector3(0, 0, 1));
  const down = (s) => new THREE.Vector3(s * Math.cos(a), -Math.sin(a), 0);
  for (const z of [-D / 2 + 0.35, -0.45, 0.45, D / 2 - 0.12]) {
    for (const s of [-1, 1]) beam(half / Math.cos(a) - 0.05, 0.06, 0.12, new THREE.Vector3(0, yRidge - 0.08, z), down(s));   // rafters
    beam(W - 0.1, 0.07, 0.05, new THREE.Vector3(-W / 2 + 0.05, yEave + 0.09, z), new THREE.Vector3(1, 0, 0));          // tie beam
  }
  for (const s of [-1, 1]) for (const f of [0.25, 0.55, 0.85]) {      // purlins along z, under the sheets
    const d = f * half / Math.cos(a);
    const p = new THREE.Vector3(s * d * Math.cos(a), yRidge - 0.04 - d * Math.sin(a), -Dz / 2 + 0.08);
    beam(Dz - 0.16, 0.07, 0.06, p, new THREE.Vector3(0, 0, 1));
  }
  const timber = new THREE.Mesh(mergeGeometries(timberGeos), new THREE.MeshStandardMaterial({ color: 0x8b6a47, roughness: 0.8 }));
  timber.castShadow = timber.receiveShadow = true;
  roof.add(timber);
  group.add(roof);

  /* interior: mat, a table with a radio, the socket, and the lamp */
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: fabricTexture('mat'), roughness: 0.95 }));
  mat.position.set(0.45, P + 0.014, 0.35);
  mat.receiveShadow = true;
  walls.add(mat);
  const tableGeos = [new THREE.BoxGeometry(0.9, 0.05, 0.55).translate(0, 0.7, 0)];
  for (const [x, z] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) tableGeos.push(new THREE.BoxGeometry(0.05, 0.68, 0.05).translate(x, 0.34, z));
  const table = new THREE.Mesh(mergeGeometries(tableGeos), new THREE.MeshStandardMaterial({ color: 0x6e4b30, roughness: 0.7 }));
  table.position.set(1.05, P, -0.95);
  table.castShadow = table.receiveShadow = true;
  const radio = new THREE.Mesh(roundedBox(0.42, 0.24, 0.14, 0.03, 2), new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.5 }));
  radio.position.set(1.0, P + 0.85, -0.95);
  radio.castShadow = true;
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9a25c, metalness: 0.8, roughness: 0.3 }));
  dial.position.set(1.12, P + 0.85, -0.875);
  walls.add(table, radio, dial);

  const socketPos = new THREE.Vector3(-0.95, P + 0.42, -D / 2 + t + 0.012);
  const socket = new THREE.Mesh(roundedBox(0.17, 0.17, 0.024, 0.02, 2), new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.35 }));
  socket.position.copy(socketPos);
  walls.add(socket);

  const lampPos = new THREE.Vector3(0.3, yEave - 0.32, 0.25);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, yRidge - 0.2 - lampPos.y, 6), new THREE.MeshStandardMaterial({ color: 0x1c1c1c }));
  cord.position.set(lampPos.x, (yRidge - 0.2 + lampPos.y) / 2 + 0.06, lampPos.z);
  const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0x1f1e1c, roughness: 0.5 }));
  holder.position.set(lampPos.x, lampPos.y + 0.1, lampPos.z);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, roughness: 0.2, emissive: 0xffd58a, emissiveIntensity: 0 });
  const bulb = new THREE.Mesh(new THREE.LatheGeometry([[0.001, -0.075], [0.04, -0.07], [0.068, -0.035], [0.07, 0], [0.05, 0.035], [0.028, 0.055], [0.026, 0.07]]
    .map(([x, y]) => new THREE.Vector2(x, y)), 20), bulbMat);
  bulb.position.copy(lampPos);
  const glow = makeGlow(0xffd38a, 1.6);
  glow.position.copy(lampPos);
  glow.material.opacity = 0;
  const light = new THREE.PointLight(0xffd59a, 0, 7, 1.5);
  light.position.copy(lampPos);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: once('pool', () => share(canvasTexture(256, 256, (g, W2, H2) => {
      const gr = g.createRadialGradient(W2 / 2, H2 / 2, 0, W2 / 2, H2 / 2, W2 / 2);
      gr.addColorStop(0, 'rgba(255,214,150,0.55)'); gr.addColorStop(0.5, 'rgba(255,214,150,0.18)'); gr.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W2, H2);
    }))), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }));
  pool.position.set(lampPos.x, P + 0.02, lampPos.z - 0.1);
  pool.userData.noShadow = pool.userData.noFit = true;
  walls.add(cord, holder, bulb, glow, light, pool);

  // service entry: a spool insulator on a bracket, high on the wall facing the pole
  const entry = new THREE.Vector3(-W / 2 - 0.12, yEave - 0.28, 0.35);
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.15 }));
  spool.position.copy(entry);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.04), galvanised());
  arm.position.set(-W / 2 - 0.06, entry.y - 0.06, entry.z);
  walls.add(spool, arm);

  return {
    group, walls, roof, occluders,
    anchors: {
      ciuWall: new THREE.Vector3(-0.95, P + 1.42, -D / 2 + t),    // back wall, inside; faces +z
      socket: socketPos.clone().add(new THREE.Vector3(0, 0, 0.012)),
      serviceEntry: entry.clone(),
      serviceInside: new THREE.Vector3(-W / 2 + t + 0.04, entry.y, entry.z),
      lamp: lampPos.clone(),
      door: new THREE.Vector3(W / 2 + 0.5, 0, doorZ),
      eaveY: yEave, ridgeY: yRidge
    },
    setPower(on, level = 1) {
      const v = on ? level : 0;
      bulbMat.emissiveIntensity = 2.2 * v;
      glow.material.opacity = 0.75 * v;
      light.intensity = 5.5 * v;
      pool.material.opacity = 0.7 * v;
      glassMat.emissiveIntensity = 0.55 * v;
    }
  };
}

/* ── Ground ────────────────────────────────────────────────────────────────
   A diorama plot of Ugandan red earth: a slab whose sides show the strata
   (dark topsoil over red murram), its top painted with grass and a swept
   compound. Zones are given in plot-local metres:
     { kind: 'murram' | 'ao', rect: [x0, z0, x1, z1], r } | { ellipse: [cx, cz, rx, rz] }
     | { path: [[x, z], …], width } ─────────────────────────────────────── */
function zoneContains(zone, x, z, margin = 0) {
  if (zone.rect) {
    const [x0, z0, x1, z1] = zone.rect;
    return x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin;
  }
  if (zone.ellipse) {
    const [cx, cz, rx, rz] = zone.ellipse;
    return ((x - cx) / (rx + margin)) ** 2 + ((z - cz) / (rz + margin)) ** 2 < 1;
  }
  if (zone.path) {
    const p = zone.path, hw = zone.width / 2 + margin;
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      if (Math.hypot(x - ax - u * dx, z - az - u * dz) < hw) return true;
    }
  }
  return false;
}

function groundTexture(width, depth, zones, seed) {
  const W = 2048, H = Math.round(2048 * depth / width), sx = W / width, sz = H / depth;
  const px = (x) => (x + width / 2) * sx, pz = (z) => (z + depth / 2) * sz;
  const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const shapePath = (g, zone, grow = 0) => {
    g.beginPath();
    if (zone.rect) {
      const [x0, z0, x1, z1] = zone.rect;
      g.roundRect(px(x0) - grow, pz(z0) - grow, (x1 - x0) * sx + grow * 2, (z1 - z0) * sz + grow * 2, (zone.r ?? 0.3) * sx);
    } else if (zone.ellipse) {
      const [cx, cz, rx, rz] = zone.ellipse;
      g.ellipse(px(cx), pz(cz), rx * sx + grow, rz * sz + grow, 0, 0, Math.PI * 2);
    }
  };
  const fillZone = (g, zone, grow = 0) => {
    if (zone.path) {
      g.lineWidth = zone.width * sx + grow * 2;
      g.lineCap = g.lineJoin = 'round';
      g.beginPath();
      zone.path.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
      g.stroke();
    } else { shapePath(g, zone, grow); g.fill(); }
  };

  return canvasTexture(W, H, (g) => {
    const r = rng(seed);
    // grass: base, drifting patches of green and dry straw, then thousands of blade marks
    g.fillStyle = '#5b7230';
    g.fillRect(0, 0, W, H);
    const greens = ['#4b6326', '#6a8338', '#7a8a42', '#8e8a4b', '#54702c', '#3f5622', '#9a9352'];
    for (let i = 0; i < 1100; i++) {
      const x = r() * W, y = r() * H, rad = 15 + r() * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = greens[(r() * greens.length) | 0];
      gr.addColorStop(0, c + '66'); gr.addColorStop(1, c + '00');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.lineCap = 'round';
    for (const [colour, n] of [['rgba(48,66,22,0.55)', 9000], ['rgba(120,146,62,0.5)', 9000], ['rgba(160,160,90,0.35)', 4000]]) {
      g.strokeStyle = colour;
      g.lineWidth = 1.6;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const x = r() * W, y = r() * H, a = r() * Math.PI * 2, l = 3 + r() * 5;
        g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      }
      g.stroke();
    }

    // murram (laterite): its own layer, shown through a softened mask of the murram zones
    const [mask, mg] = layer();
    mg.fillStyle = mg.strokeStyle = '#fff';
    zones.filter(z => z.kind === 'murram').forEach(z => fillZone(mg, z));
    const [soft, sg] = layer();
    sg.filter = 'blur(12px)';
    sg.drawImage(mask, 0, 0);
    const [mur, mu] = layer();
    mu.fillStyle = '#a45934';
    mu.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = r() * H, rad = 20 + r() * 90;
      const gr = mu.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() > 0.5 ? '140,70,40' : '190,110,70';
      gr.addColorStop(0, `rgba(${c},0.35)`); gr.addColorStop(1, `rgba(${c},0)`);
      mu.fillStyle = gr; mu.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (const [colour, n] of [['#8a4527', 14000], ['#bd6e42', 12000], ['#6f3a22', 5000], ['#cf8a5a', 4000]]) {
      mu.fillStyle = colour;
      for (let i = 0; i < n; i++) mu.fillRect(r() * W, r() * H, 1 + r() * 2.2, 1 + r() * 2.2);
    }
    for (let i = 0; i < 700; i++) {                         // pebbles with a lit edge
      const x = r() * W, y = r() * H, rad = 1.5 + r() * 3.5;
      mu.fillStyle = r() > 0.5 ? '#7d6b5d' : '#94806d';
      mu.beginPath(); mu.arc(x, y, rad, 0, Math.PI * 2); mu.fill();
      mu.fillStyle = 'rgba(255,240,220,0.35)';
      mu.beginPath(); mu.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.45, 0, Math.PI * 2); mu.fill();
    }
    mu.strokeStyle = 'rgba(222,160,112,0.16)';               // a swept compound: broom arcs
    mu.lineWidth = 2.2;
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = r() * H, rad = 30 + r() * 70, a0 = r() * Math.PI * 2;
      mu.beginPath(); mu.arc(x, y, rad, a0, a0 + 0.6 + r() * 0.8); mu.stroke();
    }
    mu.globalCompositeOperation = 'destination-in';
    mu.drawImage(soft, 0, 0);
    g.drawImage(mur, 0, 0);

    // ambient occlusion where walls and the pole meet the ground
    const [ao, ag] = layer();
    ag.fillStyle = ag.strokeStyle = '#000';
    zones.filter(z => z.kind === 'ao').forEach(z => fillZone(ag, z, 6));
    const [aoSoft, aos] = layer();
    aos.filter = 'blur(22px)';
    aos.globalAlpha = 0.55;
    aos.drawImage(ao, 0, 0);
    g.drawImage(aoSoft, 0, 0);

    // darken the very edge so the plot reads as a block
    for (const [x0, y0, x1, y1] of [[0, 0, 0, 60], [0, H, 0, H - 60], [0, 0, 60, 0], [W, 0, W - 60, 0]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(25,15,8,0.35)'); gr.addColorStop(1, 'rgba(25,15,8,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  });
}

function strataTexture() {
  return once('strata', () => share(canvasTexture(1024, 256, (g, W, H) => {
    const r = rng(51);
    const bands = [[0, 0.2, '#3d2a1c'], [0.2, 0.26, '#5a3420'], [0.26, 0.7, '#934827'], [0.7, 1, '#b4703f']];
    for (const [a, b, c] of bands) { g.fillStyle = c; g.fillRect(0, a * H, W, (b - a) * H + 1); }
    for (let i = 0; i < 9000; i++) {
      const y = r() * H;
      g.fillStyle = y < H * 0.22 ? 'rgba(20,12,6,0.4)' : r() > 0.5 ? 'rgba(110,50,25,0.45)' : 'rgba(205,130,80,0.35)';
      g.fillRect(r() * W, y, 1 + r() * 3, 1 + r() * 2);
    }
    for (let i = 0; i < 180; i++) {                       // ironstone nodules in the laterite
      g.fillStyle = 'rgba(70,32,16,0.55)';
      g.beginPath(); g.arc(r() * W, H * (0.3 + r() * 0.65), 1.5 + r() * 3.5, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(28,18,10,0.6)';                  // roots
    g.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) {
      let x = r() * W, y = H * 0.05 + r() * H * 0.15;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 14; y += 4 + r() * 8; g.lineTo(x, y); }
      g.stroke();
    }
  }, { wrap: true })));
}

/** Six blades from one root, as one small mesh; instanced across the plot. Normals point up so it shades like turf. */
function tuftGeometry() {
  return once('tuft', () => {
    const r = rng(61), pos = [], col = [];
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, lean = 0.2 + r() * 0.45, h = 0.65 + r() * 0.55, w = 0.07;
      const bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05;
      const px = -Math.sin(a) * w / 2, pz = Math.cos(a) * w / 2;
      pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean * h, h, bz + Math.sin(a) * lean * h);
      col.push(0.2, 0.27, 0.09, 0.2, 0.27, 0.09, 0.62, 0.68, 0.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    return share(g);
  });
}

export function makeGround({ width = 13, depth = 8, thickness = 0.55, radius = 0.6, zones = [], seed = 3 } = {}) {
  const group = new THREE.Group();
  group.name = 'Ground';
  const edge = 0.04;
  const geo = new THREE.ExtrudeGeometry(roundRectShape(width - edge * 2, depth - edge * 2, radius - edge), {
    depth: thickness - edge * 2, bevelEnabled: true, bevelThickness: edge, bevelSize: edge, bevelSegments: 2, curveSegments: 10
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -(thickness - edge), 0);          // top surface at y = 0
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (n.getY(i) > 0.7) uv.setXY(i, (x + width / 2) / width, 1 - (z + depth / 2) / depth);
    else uv.setXY(i, (x + z) * 0.16, (y + thickness) / thickness);
  }
  const topMat = new THREE.MeshStandardMaterial({
    map: once(`ground-${width}-${depth}-${seed}-${JSON.stringify(zones)}`, () => share(groundTexture(width, depth, zones, seed))),
    roughness: 0.96, metalness: 0
  });
  const sideMat = new THREE.MeshStandardMaterial({ map: strataTexture(), roughness: 1, metalness: 0 });
  const slab = new THREE.Mesh(geo, [topMat, sideMat]);
  slab.receiveShadow = true;
  group.add(slab);

  const r = rng(seed * 7 + 1);
  const murram = zones.filter(z => z.kind === 'murram');
  const free = (x, z, m) => !murram.some(zone => zoneContains(zone, x, z, m));
  const inPlot = (x, z, m) => Math.abs(x) < width / 2 - m && Math.abs(z) < depth / 2 - m;

  // grass tufts on the grass, not on the paths
  const want = Math.round(width * depth * 15 * DETAIL);
  const tm = new THREE.Object3D(), c = new THREE.Color(), placed = [];
  for (let i = 0; i < want * 4 && placed.length < want; i++) {
    const x = (r() - 0.5) * width, z = (r() - 0.5) * depth;
    if (inPlot(x, z, 0.2) && free(x, z, 0.12)) placed.push([x, z]);
  }
  if (placed.length) {
    const tufts = new THREE.InstancedMesh(tuftGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), placed.length);
    placed.forEach(([x, z], i) => {
      tm.position.set(x, 0, z);
      tm.rotation.set(0, r() * Math.PI * 2, 0);
      tm.scale.setScalar(0.1 + r() * 0.14);
      tm.updateMatrix();
      tufts.setMatrixAt(i, tm.matrix);
      tufts.setColorAt(i, c.setHSL(0.2 + r() * 0.07, 0.35 + r() * 0.25, 0.5 + r() * 0.25));
    });
    tufts.receiveShadow = true;
    tufts.userData.noFit = true;
    group.add(tufts);
  }

  // a scatter of stones on the murram
  const stones = [];
  for (let i = 0; i < 400 && stones.length < Math.round(70 * DETAIL) + 6; i++) {
    const x = (r() - 0.5) * width, z = (r() - 0.5) * depth;
    if (inPlot(x, z, 0.25) && !free(x, z, -0.15)) stones.push([x, z]);
  }
  if (stones.length) {
    const st = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), stones.length);
    stones.forEach(([x, z], i) => {
      const s = 0.025 + r() * 0.05;
      tm.position.set(x, s * 0.25, z);
      tm.rotation.set(r() * 3, r() * 3, r() * 3);
      tm.scale.set(s, s * 0.6, s * (0.8 + r() * 0.4));
      tm.updateMatrix();
      st.setMatrixAt(i, tm.matrix);
      st.setColorAt(i, c.setHSL(0.06 + r() * 0.04, 0.18 + r() * 0.15, 0.2 + r() * 0.12));
    });
    st.castShadow = st.receiveShadow = true;
    st.userData.noFit = true;
    group.add(st);
  }

  return { group, slab, width, depth, thickness };
}

/* ── A banana plant, the mark of a Ugandan homestead ─────────────────────── */
function bananaLeafTexture() {
  return once('banana-leaf', () => share(canvasTexture(128, 512, (g, W, H) => {
    const r = rng(71);
    const leaf = new Path2D();
    leaf.moveTo(W / 2, 0);
    leaf.bezierCurveTo(W * 1.05, H * 0.12, W * 0.98, H * 0.8, W / 2, H);
    leaf.bezierCurveTo(W * 0.02, H * 0.8, -W * 0.05, H * 0.12, W / 2, 0);
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, '#3f6b25'); gr.addColorStop(0.5, '#5f8f33'); gr.addColorStop(1, '#3f6b25');
    g.fillStyle = gr;
    g.fill(leaf);
    g.strokeStyle = 'rgba(214,226,150,0.6)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
    g.strokeStyle = 'rgba(30,55,18,0.35)';
    g.lineWidth = 1;
    for (let y = 8; y < H; y += 6) { g.beginPath(); g.moveTo(W / 2, y); g.lineTo(0, y + 26); g.moveTo(W / 2, y); g.lineTo(W, y + 26); g.stroke(); }
    g.globalCompositeOperation = 'destination-out';      // the wind tears banana leaves into strips
    g.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) {
      const y = H * (0.15 + r() * 0.75), side = r() > 0.5 ? 1 : -1;
      g.beginPath(); g.moveTo(W / 2 + side * W * 0.5, y); g.lineTo(W / 2 + side * W * (0.06 + r() * 0.2), y - 18); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(150,120,60,0.7)';               // dry brown edges
    g.lineWidth = 3;
    g.stroke(leaf);
  })));
}

/** A leaf blade bent along its length: th0 is its angle from vertical at the base, k how far the tip droops. */
function bentLeaf(width, L, th0, k, yaw, y0) {
  const g = new THREE.PlaneGeometry(width, 1, 4, 16).translate(0, 0.5, 0);
  const pp = g.attributes.position;
  for (let v = 0; v < pp.count; v++) {
    const x = pp.getX(v), t = pp.getY(v), th = th0 + k * t;
    const out = (L / k) * (Math.cos(th0) - Math.cos(th)), up = (L / k) * (Math.sin(th) - Math.sin(th0));
    pp.setXYZ(v, x, up + Math.abs(x) * 0.3, out);          // the halves fold up along the midrib
  }
  g.computeVertexNormals();
  g.rotateY(yaw);
  g.translate(0, y0, 0);
  return g;
}

export function makeBanana({ height = 2.6, seed = 1, bunch = false } = {}) {
  const r = rng(seed), group = new THREE.Group();
  const trunkH = height * 0.55;
  // the pseudostem: thick at the foot, sheathed, slightly leaning
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.19, trunkH, 16, 4).translate(0, trunkH / 2, 0),
    new THREE.MeshStandardMaterial({ color: 0x7a8146, roughness: 0.8 }));
  trunk.rotation.z = (r() - 0.5) * 0.12;
  trunk.castShadow = true;
  group.add(trunk);
  const top = trunkH - 0.04;
  const leaves = [], dry = [], n = 8;
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + r() * 0.4;
    leaves.push(bentLeaf(0.62, 1.45 + r() * 0.6, 0.12 + r() * 0.3, 1.5 + r() * 0.9, yaw, top));
  }
  for (let i = 0; i < 2; i++) dry.push(bentLeaf(0.4, 0.9 + r() * 0.3, 2.6 + r() * 0.3, 0.25, r() * Math.PI * 2, top - 0.15));
  const leafTex = bananaLeafTexture();
  const crown = new THREE.Mesh(mergeGeometries(leaves), new THREE.MeshStandardMaterial({
    map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.65
  }));
  const dead = new THREE.Mesh(mergeGeometries(dry), new THREE.MeshStandardMaterial({
    map: leafTex, color: 0xb08a55, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9
  }));
  crown.castShadow = dead.castShadow = true;
  crown.rotation.z = dead.rotation.z = trunk.rotation.z;
  group.add(crown, dead);

  if (bunch) {                                           // a bunch of green bananas and the purple bud
    const fingers = [];
    for (let hand = 0; hand < 3; hand++) for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 1.4 - 0.7, y = top - 0.25 - hand * 0.13;
      const g = new THREE.CylinderGeometry(0.022, 0.016, 0.2, 6).translate(0, 0.1, 0);
      g.rotateZ(-0.9).rotateY(a).translate(0.3 + Math.cos(a) * 0.05, y, Math.sin(a) * 0.05);
      fingers.push(g);
    }
    const hands = new THREE.Mesh(mergeGeometries(fingers), new THREE.MeshStandardMaterial({ color: 0x8aa040, roughness: 0.55 }));
    const bud = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 10).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0x6b2a4a, roughness: 0.5 }));
    bud.position.set(0.32, top - 0.75, 0);
    hands.castShadow = bud.castShadow = true;
    group.add(hands, bud);
  }
  return group;
}

/* ── The whole installation on one plot ───────────────────────────────────
   Pole with its MCU, the house with the CIU on its back wall, and the cables
   between them. Paths follow the real cables, so flows can show data and
   power travelling along the wires. Plot-local: ground top at y = 0. ────── */
export function makeSite({
  drn = '04122334455', width = 12, depth = 7.6, poleX = -3.9, poleZ = -0.9, poleHeight = 6.6,
  houseX = 1.9, houseZ = -0.5, mcuY = 2.8, mcuScale = 0.7, ciuScale = 0.42, bananas = true
} = {}) {
  const group = new THREE.Group();
  group.name = 'Site';
  const { W: HW, D: HD } = HOUSE;
  const zones = [
    { kind: 'murram', rect: [houseX - HW / 2 - 0.9, houseZ - HD / 2 - 0.8, houseX + HW / 2 + 1.3, houseZ + HD / 2 + 0.9], r: 0.9 },
    { kind: 'murram', path: [[houseX + HW / 2 + 0.6, houseZ + 0.5], [houseX + 1.4, houseZ + HD / 2 + 1.5], [houseX + 0.8, depth / 2 + 0.4]], width: 1.0 },
    { kind: 'murram', ellipse: [poleX, poleZ, 0.85, 0.7] },
    { kind: 'murram', path: [[poleX + 0.5, poleZ + 0.5], [(poleX + houseX) / 2 - 0.5, houseZ + 1.4], [houseX - HW / 2 - 0.5, houseZ + 0.9]], width: 0.5 },
    { kind: 'ao', rect: [houseX - HW / 2 - 0.08, houseZ - HD / 2 - 0.08, houseX + HW / 2 + 0.08, houseZ + HD / 2 + 0.08], r: 0.1 },
    { kind: 'ao', ellipse: [poleX, poleZ, 0.32, 0.32] }
  ];
  const ground = makeGround({ width, depth, zones });
  group.add(ground.group);

  const pole = makePole({ height: poleHeight, span: [-width / 2 - poleX + 0.05, width / 2 - poleX - 0.05] });
  pole.position.set(poleX, 0, poleZ);
  group.add(pole);

  const r = pole.anchors.radiusAt(mcuY);
  const mcu = makeMCU({ drn, mount: { poleRadius: r / mcuScale } });
  mcu.group.scale.setScalar(mcuScale);
  const mcuZ = poleZ + r + (0.045 + MCU.DEPTH / 2) * mcuScale;
  mcu.group.position.set(poleX, mcuY, mcuZ);
  if (mcu.sub) mcu.sub.visible = false;
  if (mcu.caption) {                    // the unit is scaled down on the pole; keep its caption readable
    mcu.caption.scale.multiplyScalar(2.2);
    mcu.caption.position.y += 0.3;
  }
  group.add(mcu.group);
  const onMcu = (v) => new THREE.Vector3(poleX, mcuY, mcuZ).addScaledVector(v, mcuScale);

  const house = makeHouse();
  house.group.position.set(houseX, 0, houseZ);
  group.add(house.group);
  const hp = house.group.position;
  const onHouse = (v) => v.clone().add(hp);

  const ciu = makeCIU({ drn, label: false });
  ciu.group.scale.setScalar(ciuScale);
  const ciuLocal = house.anchors.ciuWall.clone().add(new THREE.Vector3(0, 0, CIU.DEPTH / 2 * ciuScale + 0.002));
  ciu.group.position.copy(ciuLocal);
  house.group.add(ciu.group);

  // the CIU's flex, plugged into the wall socket: it talks to the MCU over these mains wires
  const ciuBottom = ciuLocal.clone().add(new THREE.Vector3(0, -CIU.H / 2 * ciuScale - 0.005, -0.02));
  const sock = house.anchors.socket;
  const flex = makeCable([ciuBottom, ciuBottom.clone().add(new THREE.Vector3(0.03, -0.22, 0.03)),
    sock.clone().add(new THREE.Vector3(0.02, 0.16, 0.04)), sock.clone().add(new THREE.Vector3(0, 0.02, 0.03))],
    { radius: 0.011, color: 0xeeeeea, roughness: 0.4 });
  house.group.add(flex.mesh);

  // tap from the line down the back of the pole into the MCU; service cable on to the house
  const pa = pole.anchors, armY = pole.position.y + pa.armY;
  const wy = pa.wireY(0, 0.35);
  const glandIn = onMcu(mcu.anchors.glandIn), glandOut = onMcu(mcu.anchors.glandOut);
  const tap = makeCable([
    [poleX + 0.35, wy, poleZ - 0.95], [poleX + 0.22, wy - 0.5, poleZ - 0.55], [poleX - 0.04, armY - 0.9, poleZ - 0.22],
    [poleX - 0.17, mcuY + 0.6, poleZ - 0.14], [poleX - 0.2, mcuY - 0.75, poleZ - 0.12],
    [glandIn.x - 0.05, glandIn.y - 0.35, glandIn.z - 0.05], [glandIn.x, glandIn.y - 0.06, glandIn.z], glandIn
  ], { radius: 0.03 });
  const entry = onHouse(house.anchors.serviceEntry);
  const servicePts = [glandOut, glandOut.clone().add(new THREE.Vector3(0.02, -0.18, 0.03)),
    glandOut.clone().add(new THREE.Vector3(0.3, -0.34, 0.1)),
    ...sagPoints([glandOut.x + 0.62, glandOut.y - 0.3, glandOut.z + 0.12], [entry.x - 0.06, entry.y, entry.z], 0.42, 14).slice(1),
    entry];
  const service = makeCable(servicePts, { radius: 0.032 });
  group.add(tap.mesh, service.mesh);

  // paths for flows, in plot-local coordinates
  const inside = (v) => onHouse(v);
  const plcPts = [
    inside(ciuLocal.clone().add(new THREE.Vector3(0, -0.2, 0.08))), inside(ciuBottom.clone().add(new THREE.Vector3(0.02, -0.15, 0.06))),
    inside(sock.clone().add(new THREE.Vector3(0, 0.05, 0.06))),
    inside(new THREE.Vector3(-HW / 2 + 0.2, sock.y, -HD / 2 + 0.2)),
    inside(new THREE.Vector3(-HW / 2 + 0.2, house.anchors.serviceInside.y, -HD / 2 + 0.2)),
    inside(house.anchors.serviceInside.clone().add(new THREE.Vector3(0.06, 0, 0))),
    ...servicePts.slice().reverse(),
    onMcu(mcu.anchors.glandOut.clone().add(new THREE.Vector3(0, 0.32, 0)))      // in through the gland
  ];
  const plcCurve = new THREE.CatmullRomCurve3(plcPts, false, 'centripetal');
  const supplyPts = [
    new THREE.Vector3(poleX + 0.35, wy, poleZ - 0.95), ...tap.curve.getSpacedPoints(16).slice(1),
    ...service.curve.getSpacedPoints(24),
    inside(house.anchors.serviceInside.clone()), inside(new THREE.Vector3(house.anchors.lamp.x, house.anchors.eaveY + 0.1, 0.25)),
    inside(house.anchors.lamp.clone().add(new THREE.Vector3(0, 0.12, 0)))
  ];
  const supplyCurve = new THREE.CatmullRomCurve3(supplyPts, false, 'centripetal');
  const v = new THREE.Vector3();
  const pathOf = (curve) => (u) => curve.getPointAt(Math.min(1, Math.max(0, u)), v).toArray();

  if (bananas && DETAIL > 0.3) {
    for (const [x, z, s, seed, bunch] of [[width / 2 - 1.2, -depth / 2 + 1.0, 1, 3, true], [houseX - HW / 2 - 1.5, -depth / 2 + 0.75, 0.9, 5, false], [-width / 2 + 0.95, depth / 2 - 1.1, 0.8, 9, false]]) {
      const b = makeBanana({ seed, bunch });
      b.position.set(x, 0, z);
      b.scale.setScalar(s);
      group.add(b);
    }
  }

  return {
    group, ground, pole, mcu, ciu, house, cables: { tap, service, flex },
    paths: { plc: pathOf(plcCurve), supply: pathOf(supplyCurve) },
    anchors: { mcu: new THREE.Vector3(poleX, mcuY, mcuZ), ciu: onHouse(ciuLocal), lamp: onHouse(house.anchors.lamp) },
    occluders: house.occluders,
    setPower(on, level = 1) { house.setPower(on, level); mcu.setLamp('relay', on, 1.8); },
    tick(dt, t) { mcu.tick(dt, t); ciu.tick(dt, t); }
  };
}

/* ── A live canvas face: repaints only when its state changes ─────────────── */
function liveFace(w, h, pxW, paint, initial, { basic = true, transparent = false } = {}) {
  const pxH = Math.round(pxW * h / w);
  const c = document.createElement('canvas');
  c.width = pxW; c.height = pxH;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const material = basic
    ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent })
    : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, transparent });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.userData.noShadow = true;
  let state = { ...initial }, dirty = true;
  return {
    mesh,
    get state() { return state; },
    set(patch) { state = { ...state, ...patch }; dirty = true; },
    paint() { if (!dirty) return; dirty = false; g.clearRect(0, 0, pxW, pxH); paint(g, pxW, pxH, state); tex.needsUpdate = true; }
  };
}
const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;

/**
 * The 20-digit token as a printed card, like the receipt on the landing page: five groups
 * of four in mono type. Same API as the old tile row (group, set, highlight, clearHighlight).
 */
export function makeTokenDisplay({ tile = 0.34, label = 'TOKEN' } = {}) {
  const W = 20 * (tile + 0.05) + 0.6, H = tile * 2.1;
  const group = new THREE.Group();
  const card = new THREE.Mesh(roundedBox(W, H, 0.05, Math.min(0.08, H * 0.12), 3),
    new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.7 }));
  card.castShadow = true;
  group.add(card);
  const face = liveFace(W, H, 2048, (g, PW, PH, s) => {
    g.fillStyle = '#f7f4ed';
    g.fillRect(0, 0, PW, PH);
    g.strokeStyle = '#d3cdc1';
    g.setLineDash([10, 8]);
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(PW * 0.03, PH * 0.3); g.lineTo(PW * 0.97, PH * 0.3); g.stroke();
    g.setLineDash([]);
    g.textBaseline = 'middle';
    g.fillStyle = '#6b675e';
    g.font = `600 ${Math.round(PH * 0.13)}px ${SANS}`;
    g.letterSpacing = `${Math.round(PH * 0.025)}px`;
    g.fillText(s.label, PW * 0.03, PH * 0.16);
    g.letterSpacing = '0px';
    g.textAlign = 'right';
    g.font = `500 ${Math.round(PH * 0.12)}px ${MONO}`;
    g.fillText('20 digits · 66 bits', PW * 0.97, PH * 0.16);

    const d = String(s.digits).padStart(20, '0').slice(-20);
    const left = PW * 0.03, right = PW * 0.97, gap = 0.9;            // a group gap is 0.9 of a digit cell
    const cell = (right - left) / (20 + 4 * gap);
    g.font = `600 ${Math.round(Math.min(PH * 0.46, cell * 1.5))}px ${MONO}`;
    g.textAlign = 'center';
    for (let i = 0; i < 20; i++) {
      const x = left + (i + Math.floor(i / 4) * gap + 0.5) * cell, y = PH * 0.64;
      let bg = null;
      if (s.hi && i >= s.hi[0] && i <= s.hi[1]) bg = css(s.hi[2]);
      else if (s.tint != null && i >= s.from) bg = css(s.tint);
      if (bg) { g.fillStyle = bg; g.globalAlpha = 0.28; g.beginPath(); g.roundRect(x - cell * 0.46, y - PH * 0.22, cell * 0.92, PH * 0.44, 6); g.fill(); g.globalAlpha = 1; }
      g.fillStyle = '#1d1c19';
      g.fillText(d[i], x, y + PH * 0.01);
    }
  }, { digits: '0'.repeat(20), label, from: 0, tint: null, hi: null });
  face.mesh.position.z = 0.0255;
  group.add(face.mesh);
  face.mesh.onBeforeRender = () => face.paint();
  return {
    group, tiles: [],
    set(digits, { from = 0, color = null } = {}) { face.set({ digits, from, tint: color }); },
    highlight(fromIdx, toIdx, color = PAL.amber) { face.set({ hi: [fromIdx, toIdx, color] }); },
    clearHighlight() { face.set({ hi: null }); }
  };
}

/**
 * A light instrument panel listing steps, each with a real LED: grey, amber while running,
 * green when it passes, red when it fails. Styled like the landing page's checklist card.
 */
export function makeChecklist({ title, rows, width = 4.2, rowH = 1.15, titleH = 0.62, pad = 0.3 } = {}) {
  const H = pad * 2 + titleH + rows.length * rowH;
  const group = new THREE.Group();
  const plate = new THREE.Mesh(roundedBox(width, H, 0.12, 0.14, 4), new THREE.MeshStandardMaterial({ color: 0xe7e2d8, roughness: 0.7 }));
  plate.castShadow = plate.receiveShadow = true;
  group.add(plate);
  const top = H / 2 - pad - titleH;                                 // local y where the rows begin
  const rowY = (i) => top - (i + 0.5) * rowH;
  const ink = { idle: '#46433c', run: '#1d1c19', pass: '#1f5a37', fail: '#8f1c13', skip: '#a19e96' };
  const word = { idle: '', run: 'CHECKING', pass: 'PASS', fail: 'FAIL', skip: '' };
  const face = liveFace(width, H, 1024, (g, PW, PH, s) => {
    const k = PW / width, yPx = (y) => (H / 2 - y) * k;
    g.fillStyle = '#f3efe7';
    g.fillRect(0, 0, PW, PH);
    g.textBaseline = 'middle';
    g.fillStyle = '#1d1c19';
    g.font = `600 ${Math.round(titleH * k * 0.5)}px "Source Serif 4", Georgia, serif`;
    g.fillText(title, pad * k, yPx(top + titleH / 2));
    rows.forEach((r, i) => {
      const y = yPx(rowY(i)), st = s.states[i];
      if (i > 0) { g.fillStyle = '#e4dfd5'; g.fillRect(pad * k, yPx(top - i * rowH) - 1, PW - pad * 2 * k, 3); }
      g.globalAlpha = st === 'skip' ? 0.45 : 1;
      g.fillStyle = ink[st];
      // fit each line between the LED and the PASS/FAIL word on the right
      const room = PW - (0.9 + 1.05) * k;
      const fit = (txt, weight, size) => {
        g.font = `${weight} ${size}px ${SANS}`;
        const w = g.measureText(txt).width;
        if (w > room) g.font = `${weight} ${Math.floor(size * room / w)}px ${SANS}`;
      };
      g.textAlign = 'left';
      fit(r.label, 600, Math.round(rowH * k * 0.24));
      g.fillText(r.label, 0.9 * k, y - rowH * k * 0.13);
      g.fillStyle = '#6b675e';
      fit(r.hint, 500, Math.round(rowH * k * 0.175));
      g.fillText(r.hint, 0.9 * k, y + rowH * k * 0.19);
      if (word[st]) {
        g.textAlign = 'right';
        g.fillStyle = ink[st];
        g.font = `600 ${Math.round(rowH * k * 0.15)}px ${MONO}`;
        g.letterSpacing = '3px';
        g.fillText(word[st], PW - pad * k, y);
        g.letterSpacing = '0px';
      }
      g.globalAlpha = 1;
    });
  }, { states: rows.map(() => 'idle') });
  face.mesh.position.z = 0.0605;
  group.add(face.mesh);
  face.mesh.onBeforeRender = () => face.paint();

  // one LED per row, set into the panel at the row's left
  const colours = { idle: 0xcac4b8, run: 0xf2a51e, pass: 0x36b86a, fail: 0xe3412b, skip: 0xcac4b8 };
  const leds = rows.map((_, i) => {
    const m = new THREE.MeshStandardMaterial({ color: colours.idle, roughness: 0.25, emissive: 0x000000 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), m);
    led.scale.z = 0.6;
    led.position.set(-width / 2 + 0.45, rowY(i), 0.062);
    const glow = makeGlow(0xffffff, 1.0);
    glow.material.opacity = 0;
    glow.position.z = 0.08;
    led.add(glow);
    group.add(led);
    return { m, glow };
  });
  let t = 0;
  const api = {
    group, rowY,
    set(i, state) {
      const states = face.state.states.slice();
      states[i] = state;
      face.set({ states });
      const c = colours[state], lit = state === 'run' || state === 'pass' || state === 'fail';
      leds[i].m.color.setHex(c);
      leds[i].m.emissive.setHex(lit ? c : 0x000000);
      leds[i].m.emissiveIntensity = lit ? 1.4 : 0;
      leds[i].glow.material.color.setHex(c);
      leds[i].glow.material.opacity = lit ? 0.7 : 0;
    },
    reset() { rows.forEach((_, i) => api.set(i, 'idle')); },
    tick(dt) {
      t += dt;
      face.state.states.forEach((st, i) => {
        if (st === 'run') leds[i].m.emissiveIntensity = 0.8 + Math.abs(Math.sin(t * 7)) * 1.2;
      });
    }
  };
  return api;
}

/** A smartphone whose screen shows the mobile-money exchange as messages. */
export function makePhone() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(once('phone-body', () => share(deviceBody(0.98, 1.98, 0.1, 0.14, 0.03))),
    new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.32, metalness: 0.45 }));
  body.castShadow = true;
  group.add(body);
  const screen = liveFace(0.88, 1.86, 540, (g, W, H, s) => {
    g.fillStyle = '#101113';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#d9d6cf';
    g.font = `600 24px ${SANS}`;
    g.textBaseline = 'middle';
    g.fillText('9:41', 34, 40);
    g.textAlign = 'right';
    g.fillText('▮▮▮  ◔', W - 34, 40);
    g.textAlign = 'left';
    const lines = String(s.text).split('\n');
    const head = lines.shift() || '';
    g.fillStyle = '#f6f4ef';
    g.font = `600 34px ${SANS}`;
    g.fillText(head ? head.charAt(0) + head.slice(1).toLowerCase() : '', 34, 112);
    g.fillStyle = '#2b2c30';
    g.fillRect(0, 150, W, 2);
    const body = lines.join('\n').trim();
    if (body) {                                            // the message, in a bubble
      g.font = `500 32px ${MONO}`;
      const rowsTxt = body.split('\n');
      const bh = rowsTxt.length * 44 + 40;
      g.fillStyle = '#e8590c';
      g.beginPath(); g.roundRect(30, 190, W - 60, bh, 26); g.fill();
      g.fillStyle = '#ffffff';
      rowsTxt.forEach((r, i) => g.fillText(r, 56, 190 + 42 + i * 44));
    }
  }, { text: '' });
  screen.mesh.position.z = 0.051;
  group.add(screen.mesh);
  screen.mesh.onBeforeRender = () => screen.paint();
  return { group, setText(text) { screen.set({ text }); } };
}
