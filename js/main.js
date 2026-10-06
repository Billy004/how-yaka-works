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
const navToggle  = $('#navToggle');
const boot       = $('#boot');
const BS = window.bootstrap;   // loaded by a deferred classic script ahead of this module

let active = null;   // { def, stage, framing, teardown }

// ?debug exposes the live lesson so tooling can read renderer stats (draw calls, triangles).
if (new URLSearchParams(location.search).has('debug')) window.__lab = { get active() { return active; } };

/* ── Progress ──────────────────────────────────────────────────────────── */
const SEEN_KEY = 'cryptolab.seen';
// Storage can throw (blocked site data, some private modes); progress is a nicety, not a reason to fail boot.
const seen = new Set((() => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
})());
const markSeen = (id) => {
  seen.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch {}
};

/* ── Lesson list (sidebar ≥992px, offcanvas drawer below) ──────────────── */
const TICK = '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
let focusContentOnClose = false;

function buildNav() {
  listEl.innerHTML = '';
  for (const act of ACTS) {
    const h = document.createElement('div');
    h.className = 'act-head';
    h.innerHTML = `<span class="act-num">Act ${act.roman}</span><span class="act-title">${act.title}</span>`;
    listEl.appendChild(h);
    for (const L of LESSONS.filter(l => l.act === act.n)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lesson-btn';
      b.dataset.id = L.id;
      b.innerHTML = `<span class="num">${L.num}</span><span class="lt">${L.title}</span>${TICK}`;
      b.addEventListener('click', () => {
        location.hash = L.id;
        if (navEl.classList.contains('show')) { focusContentOnClose = true; closeNav(); }
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
  $('#progressSeen').textContent = `${visited} of ${LESSONS.length} visited`;

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

// Bootstrap's Offcanvas brings the backdrop, focus trap, Escape and focus return.
function closeNav() {
  if (BS) BS.Offcanvas.getInstance(navEl)?.hide();
  else navEl.classList.remove('show');
}
navEl.addEventListener('show.bs.offcanvas', () => navToggle.setAttribute('aria-expanded', 'true'));
// Bootstrap focuses the drawer itself on open, and (via a listener it adds at click
// time, so after ours) the toggle on close. Defer a tick so our choice lands last.
navEl.addEventListener('shown.bs.offcanvas', () => setTimeout(() => {
  listEl.querySelector('.lesson-btn.active')?.focus();
}));
navEl.addEventListener('hide.bs.offcanvas', () => navToggle.setAttribute('aria-expanded', 'false'));
navEl.addEventListener('hidden.bs.offcanvas', () => {
  const toContent = focusContentOnClose;
  focusContentOnClose = false;
  if (toContent) setTimeout(() => learnEl.focus({ preventScroll: true }));
});
navToggle.setAttribute('aria-expanded', 'false');
if (!BS) navToggle.addEventListener('click', () => navEl.classList.toggle('show'));

/* ── Tabs ──────────────────────────────────────────────────────────────── */
// Bootstrap's Tab handles ARIA state and arrow-key movement. The three panes share
// one scroller, so each remembers its own scroll position.
const tabs = $$('.panel-tabs .nav-link');
const tabByName = (name) => tabs.find(t => t.dataset.tab === name);
const scrollMemo = {};

function showTab(name, { focus = false } = {}) {
  const t = tabByName(name);
  if (!t) return;
  if (BS) BS.Tab.getOrCreateInstance(t).show();
  else {
    tabs.forEach(x => { const on = x === t; x.classList.toggle('active', on); x.setAttribute('aria-selected', String(on)); });
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `page-${name}`));
    $$('.tab-pane').forEach(p => p.classList.toggle('show', p.id === `page-${name}`));
  }
  if (focus) t.focus();
}
tabs.forEach(t => {
  t.addEventListener('show.bs.tab', (e) => {
    if (e.relatedTarget) scrollMemo[e.relatedTarget.dataset.tab] = panelBody.scrollTop;
  });
  t.addEventListener('shown.bs.tab', () => {
    panelBody.scrollTop = scrollMemo[t.dataset.tab] || 0;
    if (t.dataset.tab === 'controls') t.classList.remove('unseen');
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
hint.textContent = matchMedia('(pointer: coarse)').matches
  ? 'Drag to rotate · pinch to zoom'
  : 'Drag to orbit · scroll to zoom · right-drag to pan';
let hasOrbited = false;   // once someone has used the camera, stop telling them how

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

  $('#lessonAct').textContent = `Act ${ACTS.find(a => a.n === def.act).roman} · Lesson ${def.num}`;
  $('#lessonTitle').textContent = def.title;
  $('#lessonSub').textContent = def.subtitle;
  // The lead repeats the subtitle; CSS shows it only on narrow screens, where the heading drops it.
  learnEl.innerHTML = `<p class="lead">${def.subtitle}</p>${def.learn}
    <div class="learn-cta"><p>Read enough? Try it for yourself.</p>
    <button type="button" class="btn btn-dark" data-goto="controls">Open Controls →</button></div>`;
  learnEl.querySelector('[data-goto]').addEventListener('click', () => showTab('controls', { focus: true }));
  linkTabMentions(learnEl);
  dataEl.innerHTML = '—';
  showTab('learn');
  for (const k in scrollMemo) delete scrollMemo[k];   // after showTab, whose event saves the old lesson's scroll
  panelBody.scrollTop = 0;
  tabByName('controls').classList.add('unseen');
  resetBtn.hidden = true;
  hint.classList.toggle('done', hasOrbited);

  let stage;
  try {
    stage = new Stage(stageEl, def.stageOpts || {});
  } catch (e) {
    console.error('Could not start WebGL:', e);
    stageEl.innerHTML =
      `<div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center">
         <div><p style="color:#f08c84;font-weight:600">3D could not start in this browser.</p>
         <p style="color:#b3b0a8;font-size:14px">WebGL is unavailable or disabled. You can still
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
  try { stage.finish(); } catch (e) { console.error('Contact shadows unavailable:', e); }

  let framing = null;
  try {
    framing = frameStage(stage, {
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
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
  const el = document.activeElement;
  if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName)) return;
  if (el?.closest('[role="tablist"]') || navEl.classList.contains('show')) return;
  const i = routeIndex();
  if (e.key === 'ArrowRight' && i < LESSONS.length - 1) location.hash = LESSONS[i + 1].id;
  if (e.key === 'ArrowLeft' && i > 0) location.hash = LESSONS[i - 1].id;
});

/* ── Go ────────────────────────────────────────────────────────────────── */
// 3D labels are painted onto canvases once, so wait (briefly) for the web fonts;
// otherwise the first lesson's labels would be stuck in the fallback face.
await Promise.race([
  Promise.all(['600 16px "IBM Plex Sans"', '600 16px "IBM Plex Mono"'].map(f => document.fonts?.load(f))),
  new Promise(r => setTimeout(r, 2500))
]).catch(() => {});

buildNav();
load(routeId());
// Boot failures (CDN unreachable, syntax errors) are reported by the inline script in
// lab.html, which runs even when this module graph never loads.
window.__booted = true;
requestAnimationFrame(() => {
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 500);
});
