// Camera framing for a lesson's Stage, applied from outside so scene.js stays
// a plain renderer. Two jobs:
//   1. The title overlay (HUD) covers the top of the stage. Shift the projection
//      centre down so the scene is centred in the part you can actually see.
//   2. Lessons place their camera for a wide stage. When the stage is narrower
//      (a laptop with both side panels, a phone), pull the camera back along its
//      own line of sight until the whole scene fits. Never moves it closer than
//      the lesson asked for.
// Once the user orbits or zooms, resizes stop re-framing; reset() brings it back.

import { THREE } from './scene.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

export function frameStage(stage, {
  insetTop = () => 0, insetBottom = () => 0, margin = 0.05, maxPullback = 1.9, onTouch
} = {}) {
  const { camera, controls, el } = stage;
  const homePos = camera.position.clone();
  const homeTarget = controls.target.clone();
  const baseFov = camera.fov;
  const points = contentPoints(stage.scene);
  let touched = false, raf = 0, disposed = false, animating = false;

  /** Fit the projection to the current stage size and HUD height. */
  function project() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    const inset = Math.min(Math.max(0, insetTop()), h * 0.42);
    // Render the top w×h of a virtual w×(h+inset) view: its centre lands in the
    // middle of the area below the HUD. Widen the fov to match so on-screen scale
    // is unchanged.
    camera.fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * (h + inset) / h));
    camera.aspect = w / (h + inset);
    camera.setViewOffset(w, h + inset, 0, 0, w, h);
    camera.updateProjectionMatrix();
    return { h, inset };
  }

  /** Smallest distance (≥ the lesson's own) at which the content box is in view. */
  function homeDistance() {
    const { h, inset } = project();
    const dir = homePos.clone().sub(homeTarget);
    const d0 = dir.length();
    dir.normalize();
    if (!points.length) return { dir, d: d0 };

    // insetBottom only keeps content clear of bottom chrome; it doesn't shift the centre.
    const top = 1 - (2 * inset) / h - margin, lim = 1 - margin;
    const bottom = -1 + (2 * Math.min(Math.max(0, insetBottom()), h * 0.2)) / h + margin;
    const v = new THREE.Vector3();
    const fits = (d) => {
      camera.position.copy(homeTarget).addScaledVector(dir, d);
      camera.lookAt(homeTarget);
      camera.updateMatrixWorld(true);
      return points.every(c => {
        v.copy(c).project(camera);
        return v.z < 1 && Math.abs(v.x) <= lim && v.y >= bottom && v.y <= top;
      });
    };
    let d = d0;
    while (!fits(d) && d < d0 * maxPullback) d *= 1.03;
    return { dir, d: Math.min(d, d0 * maxPullback) };
  }

  function place(pos) {
    camera.position.copy(pos);
    controls.target.copy(homeTarget);
    controls.maxDistance = Math.max(controls.maxDistance, pos.distanceTo(homeTarget) * 1.3);
    controls.update();
  }

  function fit() {
    const { dir, d } = homeDistance();
    place(homeTarget.clone().addScaledVector(dir, d));
  }

  /** Glide the camera to toPos, swinging around the target rather than cutting through it. */
  function glide(fromPos, fromTarget, toPos, dur, ease) {
    cancelAnimationFrame(raf);
    if (REDUCED.matches) { place(toPos); return; }
    animating = true;
    const fromOff = fromPos.clone().sub(fromTarget), toOff = toPos.clone().sub(homeTarget);
    const fromLen = fromOff.length(), toLen = toOff.length();
    fromOff.normalize(); toOff.normalize();
    const off = new THREE.Vector3(), t0 = performance.now();
    const step = (now) => {
      if (disposed) return;
      const u = Math.min(1, (now - t0) / dur), e = ease(u);
      controls.target.lerpVectors(fromTarget, homeTarget, e);
      off.lerpVectors(fromOff, toOff, e).normalize().multiplyScalar(fromLen + (toLen - fromLen) * e);
      camera.position.copy(controls.target).add(off);
      if (u < 1) raf = requestAnimationFrame(step);
      else { animating = false; place(toPos); }
    };
    raf = requestAnimationFrame(step);
  }
  const easeInOut = (u) => u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  const easeOut = (u) => 1 - (1 - u) ** 3;

  /** Animate back to the framed view and resume following resizes. */
  function reset() {
    touched = false;
    const { dir, d } = homeDistance();
    glide(camera.position.clone(), controls.target.clone(), homeTarget.clone().addScaledVector(dir, d), 520, easeInOut);
  }

  /** Opening shot: settle in from a little further out and to the side. */
  function intro() {
    const { dir, d } = homeDistance();
    const toPos = homeTarget.clone().addScaledVector(dir, d);
    const fromDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.24);
    place(homeTarget.clone().addScaledVector(fromDir, d * 1.22));
    glide(camera.position.clone(), homeTarget.clone(), toPos, 1150, easeOut);
  }

  // The user has the camera only once it actually moves under their hand: a press that
  // just clicks something in the scene (a part, a key) must not count as orbiting.
  let pressing = false;
  const onStart = () => { pressing = true; };
  const onEnd = () => { pressing = false; };
  const onChange = () => {
    if (!pressing) return;
    cancelAnimationFrame(raf);
    animating = false;
    if (!touched) { touched = true; onTouch?.(); }
  };
  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);
  controls.addEventListener('change', onChange);

  // Stage registers its own ResizeObserver first, so this one runs after it and
  // gets the final say on aspect and projection.
  const ro = new ResizeObserver(() => { if (touched || animating) project(); else fit(); });
  ro.observe(el);

  intro();

  return {
    fit, reset,
    get touched() { return touched; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      controls.removeEventListener('change', onChange);
    }
  };
}

/**
 * Points that must stay in view: the corners of each visible object's world-space
 * box, measured from its actual vertices. (Transforming a geometry's local box
 * instead inflates anything rotated — a 45° roof came out twice its real size and
 * dragged the camera back.) Lights, helpers, the floor and anything tagged
 * userData.noFit (rims, glows, particles, the shadow catcher) don't count.
 */
function contentPoints(scene) {
  scene.updateMatrixWorld(true);
  const pts = [], b = new THREE.Box3(), v = new THREE.Vector3();
  const walk = (o) => {
    if (!o.visible || o.isLight || o.isCamera || o.userData.noFit || o.type === 'GridHelper') return;
    const pos = o.geometry?.getAttribute?.('position');
    if (o.isInstancedMesh) {
      // Instances are placed by matrix: bound them all (e.g. a 256-bit grid).
      o.computeBoundingBox();
      pts.push(...boxCorners(b.copy(o.boundingBox).applyMatrix4(o.matrixWorld)));
    } else if (pos) {
      b.makeEmpty();
      for (let i = 0; i < pos.count; i++) b.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
      if (!b.isEmpty()) pts.push(...boxCorners(b));
    }
    o.children.forEach(walk);
  };
  scene.children.forEach(walk);
  return pts;
}

function boxCorners({ min, max }) {
  const out = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z])
    out.push(new THREE.Vector3(x, y, z));
  return out;
}
