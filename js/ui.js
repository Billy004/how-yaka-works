// Declarative builders for the right-hand Controls panel, so a lesson module
// can describe its instruments in a few lines instead of touching the DOM.

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

let uid = 0;
/** Give a control an id and point its <label> at it, so screen readers announce the label. */
const linkLabel = (wrap, input) => {
  input.id = `ctl-${++uid}`;
  const label = wrap.querySelector('label');
  if (label) label.htmlFor = input.id;
};

export class UI {
  constructor(root, dataEl) {
    this.root = root;
    this.dataEl = dataEl;
    this.current = root;
    root.innerHTML = '';
  }

  /** Start a titled group. Everything added afterwards lands inside it. */
  section(title) {
    const s = el('div', 'ctl-section');
    if (title) s.appendChild(el('h4', null, title));
    this.root.appendChild(s);
    this.current = s;
    return s;
  }

  _wrap(labelHtml) {
    const c = el('div', 'ctl');
    if (labelHtml) c.appendChild(el('label', null, labelHtml));
    this.current.appendChild(c);
    return c;
  }

  note(html) { this.current.appendChild(el('p', null, html)); }
  callout(html, kind = '') { this.current.appendChild(el('div', `callout ${kind}`, `<p>${html}</p>`)); }

  text({ label, value = '', placeholder = '', mono = true, maxlength, onInput }) {
    const c = this._wrap(label);
    const i = el('input');
    i.type = 'text';
    i.value = value;
    i.placeholder = placeholder;
    if (maxlength) i.maxLength = maxlength;
    if (!mono) i.style.fontFamily = 'var(--sans)';
    c.appendChild(i);
    linkLabel(c, i);
    i.addEventListener('input', () => onInput?.(i.value));
    return {
      el: i,
      get: () => i.value,
      set: (v) => { i.value = v; onInput?.(v); },
      setQuiet: (v) => { i.value = v; },
      bad: (on) => i.classList.toggle('bad', !!on),
      focus: () => i.focus()
    };
  }

  textarea({ label, value = '', placeholder = '', rows = 3, onInput }) {
    const c = this._wrap(label);
    const t = el('textarea');
    t.value = value; t.placeholder = placeholder; t.rows = rows;
    c.appendChild(t);
    linkLabel(c, t);
    t.addEventListener('input', () => onInput?.(t.value));
    return { el: t, get: () => t.value, set: (v) => { t.value = v; onInput?.(v); } };
  }

  slider({ label, min = 0, max = 100, step = 1, value = 0, format = (v) => v, onInput }) {
    const c = this._wrap(null);
    const row = el('div', 'rowline');
    row.appendChild(el('span', null, label));
    const b = el('b', null, format(value));
    row.appendChild(b);
    c.appendChild(row);
    const i = el('input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
    i.setAttribute('aria-label', label);
    c.appendChild(i);
    const fire = () => { const v = Number(i.value); b.textContent = format(v); onInput?.(v); };
    i.addEventListener('input', fire);
    return { el: i, get: () => Number(i.value), set: (v) => { i.value = v; fire(); } };
  }

  select({ label, options, value, onChange }) {
    const c = this._wrap(label);
    const s = el('select');
    for (const o of options) {
      const opt = el('option', null, o.label);
      opt.value = o.value;
      s.appendChild(opt);
    }
    s.value = value;
    c.appendChild(s);
    linkLabel(c, s);
    s.addEventListener('change', () => onChange?.(s.value));
    return { el: s, get: () => s.value, set: (v) => { s.value = v; onChange?.(v); } };
  }

  button(label, onClick, { variant = '', full = true } = {}) {
    const b = el('button', `btn ${variant}`, label);
    if (!full) b.style.width = 'auto';
    b.addEventListener('click', () => onClick?.(b));
    this.current.appendChild(b);
    return { el: b, disable: (v) => { b.disabled = !!v; b.style.opacity = v ? .4 : 1; },
             label: (t) => { b.innerHTML = t; } };
  }

  buttonRow(defs) {
    const row = el('div', 'btnrow');
    this.current.appendChild(row);
    return defs.map(d => {
      const b = el('button', `btn ${d.variant || ''}`, d.label);
      b.addEventListener('click', () => d.onClick?.(b));
      row.appendChild(b);
      return { el: b, disable: (v) => { b.disabled = !!v; b.style.opacity = v ? .4 : 1; },
               label: (t) => { b.innerHTML = t; } };
    });
  }

  chips({ label, options, value, onChange }) {
    if (label) this.current.appendChild(el('label', null, label));
    const wrap = el('div', 'chips');
    wrap.setAttribute('role', 'group');
    if (label) wrap.setAttribute('aria-label', label);
    this.current.appendChild(wrap);
    const mark = (v) => btns.forEach((b, i) => {
      const on = options[i].value === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const btns = options.map(o => {
      const b = el('button', 'chip', o.label);
      b.addEventListener('click', () => { mark(o.value); onChange?.(o.value); });
      wrap.appendChild(b);
      return b;
    });
    mark(value);
    return { set: mark };
  }

  readout(label, initial = '—', { big = false, cls = '' } = {}) {
    const box = el('div', 'readout');
    box.appendChild(el('div', 'rl', label));
    const v = el('div', `rv ${big ? 'big' : ''} ${cls}`, initial);
    box.appendChild(v);
    this.current.appendChild(box);
    return {
      el: v,
      set: (t, kind = '') => {
        v.innerHTML = t;
        v.className = `rv ${big ? 'big' : ''} ${kind}`;
      }
    };
  }

  /** A row of bit cells. .set('0101…') lights them; changed bits flash. */
  bits(label, count = 64) {
    if (label) this.current.appendChild(el('label', null, label));
    const wrap = el('div', 'bits');
    const cells = [];
    for (let i = 0; i < count; i++) { const c = el('i', null, '0'); wrap.appendChild(c); cells.push(c); }
    this.current.appendChild(wrap);
    let prev = '0'.repeat(count);
    return {
      set(str) {
        const s = String(str).padStart(count, '0').slice(-count);
        for (let i = 0; i < count; i++) {
          cells[i].textContent = s[i];
          cells[i].className = s[i] === '1' ? 'one' : '';
          if (s[i] !== prev[i]) {
            cells[i].classList.add('flip');
            setTimeout(((c) => () => c.classList.remove('flip'))(cells[i]), 480);
          }
        }
        prev = s;
      }
    };
  }

  log(max = 90) {
    const box = el('div', 'logbox');
    this.current.appendChild(box);
    return {
      add(msg, kind = '') {
        const t = new Date().toLocaleTimeString([], { hour12: false });
        const d = el('div', null, `<span class="t">${t}</span><span class="${kind}">${esc(msg)}</span>`);
        box.appendChild(d);
        while (box.children.length > max) box.removeChild(box.firstChild);
        box.scrollTop = box.scrollHeight;
      },
      clear() { box.innerHTML = ''; }
    };
  }

  /** Write the Data tab. Accepts an HTML string, or an object of label → plain-text value. */
  data(content) {
    if (!this.dataEl) return;
    if (typeof content === 'string') { this.dataEl.innerHTML = content; return; }
    // Values include whatever the learner typed, so they are text, never markup.
    const w = Math.max(...Object.keys(content).map(k => k.length));
    this.dataEl.innerHTML = Object.entries(content)
      .map(([k, v]) => `<b>${esc(k.padEnd(w))}</b>  ${esc(v)}`)
      .join('\n');
  }
}

/* ── Formatting helpers shared by the lessons ──────────────────────────── */
export const hex = (n, w = 8) => '0x' + (n >>> 0).toString(16).padStart(w, '0');
export const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const group4 = (s) => (s.match(/.{1,4}/g) || []).join(' ');
export const pct = (v) => `${(v * 100).toFixed(1)}%`;
/** Printable rendering of a string that may contain control characters. */
export const showRaw = (s) => [...s].map(ch => {
  const c = ch.charCodeAt(0);
  return (c < 32 || c > 126) ? '·' : ch;
}).join('');
