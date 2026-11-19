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
