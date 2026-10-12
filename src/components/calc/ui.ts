/** Small DOM helpers shared by the four calculator scripts (browser only). */

export function readJSON<T>(id: string): T {
  const el = document.getElementById(id);
  if (!el?.textContent) throw new Error(`calc: missing data block #${id}`);
  return JSON.parse(el.textContent) as T;
}

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function field(form: HTMLFormElement, name: string): Field | null {
  return form.elements.namedItem(name) as Field | null;
}

/** A number from a text/number input, or null when blank or invalid. Negative values are kept only when allowed. */
export function num(form: HTMLFormElement, name: string, allowNegative = false): number | null {
  const el = field(form, name) as HTMLInputElement | null;
  if (!el) return null;
  const raw = String(el.value ?? '').replace(/[$,\s]/g, '').replace('−', '-');
  if (raw === '') return null;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return null;
  if (!allowNegative && v < 0) return null;
  return v;
}

export function str(form: HTMLFormElement, name: string): string {
  const items = form.querySelectorAll<HTMLInputElement>(`[name="${name}"]`);
  if (items.length && items[0].type === 'radio') {
    const c = [...items].find((i) => i.checked);
    return c ? c.value : '';
  }
  const el = field(form, name);
  return el ? String(el.value) : '';
}

export function checked(form: HTMLFormElement, name: string): boolean {
  const el = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  return Boolean(el?.checked);
}

export function setValue(form: HTMLFormElement, name: string, v: number | string | null, digits?: number) {
  const el = field(form, name) as HTMLInputElement | null;
  if (!el) return;
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) { el.value = ''; return; }
  el.value = typeof v === 'number' && digits !== undefined ? String(Number(v.toFixed(digits))) : String(v);
}

/** Remember which inputs the user has typed in, so recalculated defaults never overwrite them. */
export function trackDirty(form: HTMLFormElement) {
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t && (t as HTMLInputElement).dataset && 'derived' in (t as HTMLInputElement).dataset) (t as HTMLInputElement).dataset.dirty = '1';
  });
}
export function isDirty(form: HTMLFormElement, name: string): boolean {
  const el = field(form, name) as HTMLInputElement | null;
  return el?.dataset.dirty === '1';
}
export function clearDirty(form: HTMLFormElement, name: string) {
  const el = field(form, name) as HTMLInputElement | null;
  if (el) delete el.dataset.dirty;
}

export function show(el: Element | null, on: boolean) {
  if (el) (el as HTMLElement).hidden = !on;
}

/** Replace the options of a <select>, keeping the current choice when it still exists. */
export function setOptions(sel: HTMLSelectElement | null, opts: { value: string; label: string; disabled?: boolean }[]) {
  if (!sel) return;
  const cur = sel.value;
  const html = opts.map((o) => `<option value="${o.value}"${o.disabled ? ' disabled' : ''}>${o.label.replace(/</g, '&lt;')}</option>`).join('');
  if (sel.dataset.sig === html) return;
  sel.innerHTML = html;
  sel.dataset.sig = html;
  if (opts.some((o) => o.value === cur && !o.disabled)) sel.value = cur;
}

/** Run fn on every input/change, batched to one animation frame. */
export function onChange(form: HTMLFormElement, fn: () => void) {
  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
  form.addEventListener('input', run);
  form.addEventListener('change', run);
  form.addEventListener('submit', (e) => e.preventDefault());
}
