/**
 * Tiny DOM builder for the account pages. Text is always set as text, never as
 * HTML, so anything a person types is displayed safely.
 */
type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { on?: Record<string, (e: Event) => void> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'on') {
        for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
      } else if (k === 'class') {
        el.className = String(v);
      } else if (k === 'dataset') {
        Object.assign(el.dataset, v as Record<string, string>);
      } else if (k === 'value' && 'value' in el) {
        (el as unknown as HTMLInputElement).value = String(v);
      } else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden' || k === 'required' || k === 'open') {
        (el as unknown as Record<string, boolean>)[k] = Boolean(v);
        if (v === true && k !== 'checked' && k !== 'selected') el.setAttribute(k, '');
      } else if (k === 'text') {
        el.textContent = String(v);
      } else if (v === true) {
        el.setAttribute(k, '');
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(el: Element | null, ...children: Child[]) {
  if (!el) return;
  clear(el);
  append(el, children);
}

export function $(sel: string, root: ParentNode = document) {
  return root.querySelector<HTMLElement>(sel);
}

/** Labelled form field. */
export function field(label: string, input: HTMLElement, hint?: string, extraClass = '') {
  const id = input.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  input.id = id;
  return h('div', { class: `field ${extraClass}`.trim() },
    h('label', { for: id }, label),
    input,
    hint ? h('p', { class: 'hint' }, hint) : null,
  );
}

export function select(name: string, options: { value: string; label: string }[], value?: string | null, placeholder?: string) {
  return h('select', { name },
    placeholder !== undefined ? h('option', { value: '' }, placeholder) : null,
    options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)),
  );
}

export function input(name: string, value?: string | number | null, attrs: Attrs = {}) {
  return h('input', { name, type: 'text', value: value ?? '', ...attrs });
}

export function textarea(name: string, value?: string | null, attrs: Attrs = {}) {
  const t = h('textarea', { name, rows: 3, ...attrs });
  t.value = value ?? '';
  return t;
}

export function chip(text: string, tone = 'neutral') {
  return h('span', { class: `chip chip-${tone}` }, text);
}

let toastTimer: number | undefined;
export function toast(msg: string, tone: 'ok' | 'err' = 'ok') {
  let el = document.getElementById('ayh-toast');
  if (!el) {
    el = h('div', { id: 'ayh-toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `show ${tone}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { if (el) el.className = ''; }, 3200);
}

/** Read a form into a plain object; checkboxes with the same name become arrays. */
export function formData(form: HTMLFormElement): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const multi = new Set(
    [...form.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].map((i) => i.name)
      .filter((n, i, a) => a.indexOf(n) !== i),
  );
  for (const [k, v] of new FormData(form).entries()) {
    const s = String(v);
    if (multi.has(k)) ((out[k] ??= []) as string[]).push(s);
    else out[k] = s;
  }
  return out;
}

export function busy(btn: HTMLButtonElement | null, on: boolean, label?: string) {
  if (!btn) return;
  if (on) {
    btn.dataset.label ??= btn.textContent ?? '';
    btn.disabled = true;
    btn.textContent = label ?? 'Working…';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label ?? btn.textContent;
    delete btn.dataset.label;
  }
}
