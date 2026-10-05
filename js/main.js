// Shell: navigation, routing, and the lesson lifecycle.

import { Stage, THREE } from './scene.js';
import { UI } from './ui.js';
import { frameStage } from './framing.js';
import { LESSONS, ACTS } from './lessons/index.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const stageEl    = $('#stage');
const listEl     = $('#lessonList');
const learnEl    = $('#page-learn');
const controlsEl = $('#page-controls');
const dataEl     = $('#dataOut');
const panelBody  = $('.panel-body');
const navEl      = $('#nav');
const boot       = $('#boot');

let active = null;   // { def, stage, framing, teardown }

/* ── Navigation ────────────────────────────────────────────────────────── */
const SEEN_KEY = 'cryptolab.seen';
// Storage can throw (blocked site data, some private modes); progress is a nicety, not a reason to fail boot.
const seen = new Set((() => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
})());
const markSeen = (id) => {
  seen.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch {}
};

const TICK = '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function buildNav() {
  listEl.innerHTML = '';
  for (const act of ACTS) {
    const h = document.createElement('div');
    h.className = 'act-head';
    h.innerHTML = `<span>Act ${act.roman}</span> · ${act.title}`;
    listEl.appendChild(h);
    for (const L of LESSONS.filter(l => l.act === act.n)) {
      const b = document.createElement('button');
      b.className = 'lesson-btn';
      b.dataset.id = L.id;
      b.innerHTML = `<span class="num">${L.num}</span><span class="lt">${L.title}</span>${TICK}`;
      b.addEventListener('click', () => {
        const wasDrawer = navEl.classList.contains('open');
        location.hash = L.id;
        if (wasDrawer) { setNav(false); learnEl.focus({ preventScroll: true }); }
      });
      listEl.appendChild(b);
    }
  }
  $('#progress').innerHTML = LESSONS.map(() => '<i></i>').join('');
}

function refreshNav(id) {
  const idx = LESSONS.findIndex(l => l.id === id);
  const def = LESSONS[idx];
  listEl.querySelectorAll('.lesson-btn').forEach(b => {
    const on = b.dataset.id === id;
    b.classList.toggle('active', on);
    b.classList.toggle('seen', seen.has(b.dataset.id));
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });

  const visited = LESSONS.filter(l => seen.has(l.id)).length;
  $$('#progress i').forEach((seg, i) => {
    seg.className = i === idx ? 'cur' : seen.has(LESSONS[i].id) ? 'seen' : '';
  });
  $('#progress').setAttribute('aria-label', `Lesson ${idx + 1} of ${LESSONS.length}, ${visited} visited`);
  $('#progressLabel').textContent = `Lesson ${idx + 1} of ${LESSONS.length}`;
  $('#progressSeen').textContent = `${visited}/${LESSONS.length} visited`;

  const prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
  $('#prevBtn').disabled = !prev;
  $('#prevTitle').textContent = prev ? prev.title : 'Start of course';
  $('#prevBtn').setAttribute('aria-label', prev ? `Previous lesson: ${prev.title}` : 'Previous lesson');
  // The last lesson's primary action loops back rather than going dead.
  $('#nextKicker').textContent = next ? 'Next →' : 'Course complete ✓';
  $('#nextTitle').textContent = next ? next.title : 'Back to lesson 1';
  $('#nextBtn').setAttribute('aria-label', next ? `Next lesson: ${next.title}` : 'Course complete. Back to lesson 1');

  document.title = `${def.num}. ${def.title} — Crypto Lab`;
}

const navToggle = $('#navToggle');
const scrim = $('#navScrim');
const drawerMode = matchMedia('(max-width: 980px)');
function setNav(open) {
  navEl.classList.toggle('open', open);
  // A closed drawer is off-screen: keep it out of the tab order and away from screen readers.
  navEl.inert = drawerMode.matches && !open;
  navToggle.setAttribute('aria-expanded', String(open));
  scrim.hidden = !open;
  if (open) listEl.querySelector('.lesson-btn.active')?.focus();
}
const closeNav = ({ restoreFocus = false } = {}) => {
  if (!navEl.classList.contains('open')) return;
  setNav(false);
  if (restoreFocus) navToggle.focus();
};
navToggle.addEventListener('click', () => setNav(!navEl.classList.contains('open')));
$('#navClose').addEventListener('click', () => closeNav({ restoreFocus: true }));
scrim.addEventListener('click', () => closeNav());
$('#stage-wrap').addEventListener('pointerdown', () => closeNav());
// Crossing the breakpoint (rotating a tablet, resizing a window) resets the drawer.
drawerMode.addEventListener('change', () => setNav(false));
setNav(false);

/* ── Tabs ──────────────────────────────────────────────────────────────── */
// WAI-ARIA tabs: one tab stop for the group, arrow keys move between tabs, and
// each tab keeps its own scroll position (they share one scroller).
const tabs = $$('.tab');
const scrollMemo = {};
let currentTab = 'learn';

function showTab(name, { focus = false } = {}) {
  const t = tabs.find(x => x.dataset.tab === name);
  if (!t) return;
  if (name !== currentTab) scrollMemo[currentTab] = panelBody.scrollTop;
  tabs.forEach(x => {
    const on = x === t;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', String(on));
    x.tabIndex = on ? 0 : -1;
  });
  $$('.tab-page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  if (name === 'controls') t.classList.remove('unseen');
  if (name !== currentTab) panelBody.scrollTop = scrollMemo[name] || 0;
  currentTab = name;
  if (focus) t.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (k === undefined) return;
    e.preventDefault();
    e.stopPropagation();   // don't also change lesson
    showTab(tabs[(k + tabs.length) % tabs.length].dataset.tab, { focus: true });
  });
});

/** Turn "<strong>Controls</strong>"-style mentions in lesson prose into working links. */
function linkTabMentions(root) {
  root.querySelectorAll('strong').forEach(s => {
    const name = { Controls: 'controls', Data: 'data' }[s.textContent.trim()];
    if (!name) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'goto';
    b.textContent = s.textContent;
    b.addEventListener('click', () => showTab(name, { focus: true }));
    s.replaceWith(b);
  });
}

/* ── Stage chrome ──────────────────────────────────────────────────────── */
const resetBtn = $('#resetView');
const hint = $('#stageHint');
const coarse = matchMedia('(pointer: coarse)').matches;
hint.textContent = coarse
  ? 'drag to rotate · pinch to zoom'
  : 'drag to orbit · scroll to zoom · right-drag to pan';
let hasOrbited = false;   // once someone has used the camera, stop telling them how

// Height of the title overlay, so framing can keep the scene below it.
const hudInset = () => {
  const top = $('#stage-wrap').getBoundingClientRect().top;
  const parts = [...$('#hud').children].filter(n => n.offsetParent !== null);
  return parts.length ? Math.max(...parts.map(n => n.getBoundingClientRect().bottom)) - top + 12 : 0;
};

resetBtn.addEventListener('click', () => {
  active?.framing?.reset();
  resetBtn.hidden = true;
});

/* ── Lesson lifecycle ──────────────────────────────────────────────────── */
function unload() {
  if (!active) return;
  try { active.framing?.dispose(); } catch (e) { console.error(e); }
  try { active.teardown?.(); } catch (e) { console.error(e); }
  try { active.stage.dispose(); } catch (e) { console.error(e); }
  active = null;
}

function load(id) {
  const def = LESSONS.find(l => l.id === id) || LESSONS[0];
  unload();

  $('#hudAct').textContent = `Act ${ACTS.find(a => a.n === def.act).roman} · Lesson ${def.num}`;
  $('#hudTitle').textContent = def.title;
  $('#hudSub').textContent = def.subtitle;
  // The lead repeats the HUD subtitle; CSS shows it only where the HUD hides it (narrow screens).
  learnEl.innerHTML = `<p class="lead">${def.subtitle}</p>${def.learn}
    <div class="learn-cta"><p>Read enough? Try it for yourself.</p>
    <button type="button" class="btn" data-goto="controls">Open Controls →</button></div>`;
  learnEl.querySelector('[data-goto]').addEventListener('click', () => showTab('controls', { focus: true }));
  linkTabMentions(learnEl);
  dataEl.innerHTML = '—';
  for (const k in scrollMemo) delete scrollMemo[k];
  showTab('learn');
  panelBody.scrollTop = 0;
  $('#tab-controls').classList.add('unseen');
  resetBtn.hidden = true;
  hint.classList.toggle('done', hasOrbited);

  let stage;
  try {
    stage = new Stage(stageEl, def.stageOpts || {});
  } catch (e) {
    console.error('Could not start WebGL:', e);
    stageEl.innerHTML =
      `<div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center">
         <div><p style="color:#ff5d6c;font-weight:600">3D could not start in this browser.</p>
         <p style="color:#a9b8cd;font-size:13px">WebGL is unavailable or disabled. You can still
         read the lesson; the interactive controls need the 3D view.</p></div></div>`;
    controlsEl.innerHTML =
      `<div class="callout rd"><p>The controls drive the 3D scene, which could not start.
       Enable hardware acceleration or try another browser.</p></div>`;
    hint.classList.add('done');
    markSeen(def.id);
    refreshNav(def.id);
    return;
  }

  const ui = new UI(controlsEl, dataEl);
  let teardown;
  try {
    teardown = def.build({ stage, ui, THREE, showTab, go: (n) => (location.hash = n) });
  } catch (e) {
    console.error(`Lesson ${id} failed to build:`, e);
    controlsEl.innerHTML =
      `<div class="callout rd"><p><strong>This lesson failed to load.</strong><br>${e.message}
       <br><span class="hint">Details are in the browser console.</span></p></div>`;
  }
  linkTabMentions(controlsEl);

  let framing = null;
  try {
    framing = frameStage(stage, {
      insetTop: hudInset,
      insetBottom: () => hint.classList.contains('done') ? 0 : hint.offsetHeight + 14,
      onTouch: () => { resetBtn.hidden = false; hasOrbited = true; hint.classList.add('done'); }
    });
  } catch (e) { console.error('Framing failed; using the lesson camera as-is:', e); }

  active = { def, stage, framing, teardown };
  markSeen(def.id);
  refreshNav(def.id);
}

/* ── Routing ───────────────────────────────────────────────────────────── */
const routeId = () => (location.hash || '').replace(/^#/, '') || LESSONS[0].id;
const routeIndex = () => Math.max(0, LESSONS.findIndex(l => l.id === routeId()));
window.addEventListener('hashchange', () => load(routeId()));

$('#prevBtn').addEventListener('click', () => {
  const i = routeIndex();
  if (i > 0) location.hash = LESSONS[i - 1].id;
});
$('#nextBtn').addEventListener('click', () => {
  const i = routeIndex();
  location.hash = LESSONS[i < LESSONS.length - 1 ? i + 1 : 0].id;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeNav({ restoreFocus: true }); return; }
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const el = document.activeElement;
  if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName)) return;
  const i = routeIndex();
  if (e.key === 'ArrowRight' && i < LESSONS.length - 1) location.hash = LESSONS[i + 1].id;
  if (e.key === 'ArrowLeft' && i > 0) location.hash = LESSONS[i - 1].id;
});

/* ── Go ────────────────────────────────────────────────────────────────── */
buildNav();
load(routeId());
// Boot failures (CDN unreachable, syntax errors) are reported by the inline script in
// index.html, which runs even when this module graph never loads.
window.__booted = true;
requestAnimationFrame(() => {
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 500);
});
