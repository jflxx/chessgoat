export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

export const resultLabel = (r: string) => (r === 'W' ? 'Victoria' : r === 'L' ? 'Derrota' : 'Tablas');
export const colorLabel = (c: string) => (c === 'w' ? 'blancas' : 'negras');
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const pct1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
export const fmtDate = (ts: number, date: string) => {
  if (ts) return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  return date;
};

/** Fecha local en formato AAAA-MM-DD */
export const dayKey = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Actualiza `root` para que quede igual que `html` tocando solo lo que cambió, en lugar de reemplazarlo todo.
 * Así los clics sobre el tablero no hacen parpadear la pantalla, no se reinician las animaciones ni se pierde el scroll.
 * Un elemento con `data-key` distinto se sustituye entero (sirve para reiniciar animaciones).
 */
export function patchHTML(root: Element, html: string): void {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  patchChildren(root, tpl.content);
}

function patchChildren(a: Node, b: Node): void {
  const as = [...a.childNodes];
  const bs = [...b.childNodes];
  bs.forEach((y, i) => {
    const x = as[i];
    if (!x) { a.appendChild(y); return; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y, x); return; }
    if (x.nodeType === Node.TEXT_NODE || x.nodeType === Node.COMMENT_NODE) {
      if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue;
      return;
    }
    const xe = x as Element, ye = y as Element;
    if (xe.getAttribute('data-key') !== ye.getAttribute('data-key')) { a.replaceChild(y, x); return; }
    for (const at of [...xe.attributes]) if (!ye.hasAttribute(at.name)) xe.removeAttribute(at.name);
    for (const at of [...ye.attributes]) if (xe.getAttribute(at.name) !== at.value) xe.setAttribute(at.name, at.value);
    if (!(xe instanceof HTMLTextAreaElement)) patchChildren(xe, ye);
    if ((xe instanceof HTMLInputElement || xe instanceof HTMLTextAreaElement || xe instanceof HTMLSelectElement) && xe !== document.activeElement) {
      const yv = ye as HTMLInputElement;
      if (xe.value !== yv.value) xe.value = yv.value;
      if (xe instanceof HTMLInputElement && xe.checked !== yv.checked) xe.checked = yv.checked;
    }
  });
  for (const x of as.slice(bs.length)) a.removeChild(x);
}
