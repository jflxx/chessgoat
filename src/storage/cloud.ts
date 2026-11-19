// Copia opcional en la nube (Supabase, plan gratuito), cifrada en tu navegador.
// El servidor solo guarda un identificador derivado y datos cifrados: sin tu código de sincronización no se pueden leer.
import type { FetchFn } from '../importers/online';

export interface CloudConfig { url: string; key: string; code: string }

export class CloudError extends Error {}

const enc = new TextEncoder();
const dec = new TextDecoder();

const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b instanceof Uint8Array ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer : b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Código de sincronización aleatorio de 128 bits, legible: xxxx-xxxx-… */
export function newSyncCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return (toHex(b).match(/.{4}/g) as string[]).join('-');
}

export const normalizeCode = (c: string) => c.replace(/[^0-9a-f]/gi, '').toLowerCase();
export const validCode = (c: string) => normalizeCode(c).length === 32;

/** Del código salen dos cosas independientes: el identificador público (hash) y la clave de cifrado. */
export async function deriveKeys(code: string): Promise<{ id: string; key: CryptoKey }> {
  const c = normalizeCode(code);
  if (c.length !== 32) throw new CloudError('El código de sincronización no es válido (32 caracteres hexadecimales).');
  const idHash = await crypto.subtle.digest('SHA-256', enc.encode('entrenador-id:' + c));
  const base = await crypto.subtle.importKey('raw', enc.encode('entrenador-key:' + c), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('entrenador-ajedrez-v1'), iterations: 100000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { id: toHex(idHash), key };
}

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return data;
  const cs = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(cs).arrayBuffer());
}
async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const cs = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(cs).arrayBuffer());
}

/** JSON -> gzip -> AES-GCM -> base64. El primer byte indica si se comprimió (1) o no (0). */
export async function encryptText(text: string, key: CryptoKey): Promise<string> {
  const raw = enc.encode(text);
  const packed = await gzip(raw);
  const compressed = packed !== raw && typeof CompressionStream !== 'undefined';
  const body = new Uint8Array(packed.length + 1);
  body[0] = compressed ? 1 : 0;
  body.set(packed, 1);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, body as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return toB64(out);
}

export async function decryptText(b64: string, key: CryptoKey): Promise<string> {
  let body: Uint8Array;
  try {
    const all = fromB64(b64);
    body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12) as BufferSource));
  } catch {
    throw new CloudError('No pude descifrar la copia: el código de sincronización no es el correcto o los datos están dañados.');
  }
  const payload = body.slice(1);
  return dec.decode(body[0] === 1 ? await gunzip(payload) : payload);
}

const clean = (u: string) => u.trim().replace(/\/+$/, '');

export function validateConfig(cfg: Partial<CloudConfig>): CloudConfig {
  const url = clean(cfg.url || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) && !/^https?:\/\/localhost(:\d+)?$/.test(url)) throw new CloudError('La URL debe ser la de tu proyecto de Supabase, por ejemplo https://abcd1234.supabase.co');
  if (!cfg.key || cfg.key.trim().length < 20) throw new CloudError('Falta la clave pública (anon key) de tu proyecto.');
  if (!cfg.code || !validCode(cfg.code)) throw new CloudError('El código de sincronización no es válido.');
  return { url, key: cfg.key.trim(), code: cfg.code };
}

async function rpc<T>(cfg: CloudConfig, name: string, body: unknown, f: FetchFn): Promise<T> {
  let res: Response;
  try {
    res = await f(`${clean(cfg.url)}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CloudError('No pude conectar con Supabase. Revisa la URL y tu conexión.');
  }
  if (res.status === 401 || res.status === 403) throw new CloudError('Supabase rechazó la clave. Revisa que sea la anon key (pública) de tu proyecto.');
  if (res.status === 404) throw new CloudError('No encuentro las funciones put_backup/get_backup. Ejecuta el SQL del README en tu proyecto.');
  if (!res.ok) throw new CloudError('Supabase respondió con un error (' + res.status + ').');
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function cloudPush(cfg: CloudConfig, json: string, f: FetchFn = (u, i) => fetch(u, i)): Promise<void> {
  const { id, key } = await deriveKeys(cfg.code);
  await rpc<null>(cfg, 'put_backup', { p_id: id, p_data: await encryptText(json, key) }, f);
}

/** Devuelve el JSON de la copia o null si todavía no hay ninguna con ese código. */
export async function cloudPull(cfg: CloudConfig, f: FetchFn = (u, i) => fetch(u, i)): Promise<{ json: string; updatedAt: string } | null> {
  const { id, key } = await deriveKeys(cfg.code);
  const rows = await rpc<{ data: string; updated_at: string }[]>(cfg, 'get_backup', { p_id: id }, f);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return { json: await decryptText(row.data, key), updatedAt: row.updated_at };
}

export const CLOUD_SQL = `-- Copia en la nube de ChessGOAT. Pégalo en Supabase > SQL Editor > Run.
create table if not exists public.entrenador_backups (
  id text primary key,
  data text not null,
  updated_at timestamptz not null default now()
);
alter table public.entrenador_backups enable row level security;
-- Sin políticas: nadie puede leer ni escribir la tabla directamente. Solo estas dos funciones.

create or replace function public.put_backup(p_id text, p_data text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(p_id) <> 64 then raise exception 'id no válido'; end if;
  if length(p_data) > 20000000 then raise exception 'copia demasiado grande'; end if;
  insert into public.entrenador_backups (id, data, updated_at) values (p_id, p_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.get_backup(p_id text)
returns table (data text, updated_at timestamptz) language sql security definer set search_path = public as $$
  select b.data, b.updated_at from public.entrenador_backups b where b.id = p_id and length(p_id) = 64;
$$;

revoke all on function public.put_backup(text, text) from public;
revoke all on function public.get_backup(text) from public;
grant execute on function public.put_backup(text, text) to anon;
grant execute on function public.get_backup(text) to anon;
`;
