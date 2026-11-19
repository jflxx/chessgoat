import { describe, expect, it } from 'vitest';
import { CLOUD_SQL, CloudError, cloudPull, cloudPush, decryptText, deriveKeys, encryptText, newSyncCode, normalizeCode, validCode, validateConfig } from '../src/storage/cloud';
import { buildBackup, parseBackup } from '../src/storage/backup';
import { mkGame } from './fixtures';

const CODE = '0123-4567-89ab-cdef-0123-4567-89ab-cdef';
const cfg = { url: 'https://abcd1234.supabase.co', key: 'k'.repeat(40), code: CODE };

describe('copia en la nube cifrada', () => {
  it('códigos de sincronización', () => {
    const c = newSyncCode();
    expect(c).toMatch(/^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
    expect(validCode(c)).toBe(true);
    expect(newSyncCode()).not.toBe(c);
    expect(normalizeCode(' 0123-ABCD ')).toBe('0123abcd');
    expect(validCode('1234')).toBe(false);
  });

  it('el identificador del servidor no revela el código y es estable', async () => {
    const a = await deriveKeys(CODE);
    const b = await deriveKeys(CODE.toUpperCase().replace(/-/g, ' '));
    expect(a.id).toBe(b.id);
    expect(a.id).toHaveLength(64);
    expect(a.id).not.toContain(normalizeCode(CODE));
    expect((await deriveKeys(newSyncCode())).id).not.toBe(a.id);
    await expect(deriveKeys('xx')).rejects.toBeInstanceOf(CloudError);
  });

  it('cifra y descifra (con compresión) y falla con otro código', async () => {
    const { key } = await deriveKeys(CODE);
    const text = JSON.stringify({ games: Array.from({ length: 200 }, (_, i) => ({ i, m: 'e4 e5 Nf3 Nc6'.repeat(20) })) });
    const ct = await encryptText(text, key);
    expect(ct).not.toContain('e4 e5');
    expect(ct.length).toBeLessThan(text.length); // gzip
    expect(await decryptText(ct, key)).toBe(text);
    const other = await deriveKeys(newSyncCode());
    await expect(decryptText(ct, other.key)).rejects.toThrow('código de sincronización');
    expect(await encryptText(text, key)).not.toBe(ct); // IV aleatorio
  });

  it('sube y baja una copia con las llamadas RPC correctas', async () => {
    const calls: { url: string; headers: Record<string, string>; body: { p_id: string; p_data: string } }[] = [];
    let stored: { data: string; updated_at: string } | null = null;
    const f = async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url, headers: init?.headers as Record<string, string>, body });
      if (url.endsWith('/put_backup')) { stored = { data: body.p_data, updated_at: '2026-11-19T10:00:00Z' }; return new Response(''); }
      return new Response(JSON.stringify(stored ? [stored] : []));
    };
    expect(await cloudPull(cfg, f)).toBeNull(); // todavía no hay copia
    const backup = JSON.stringify(buildBackup({ games: [mkGame('g1'), mkGame('g2')], settings: null, trainer: [], activity: [], plan: null }));
    await cloudPush(cfg, backup, f);
    expect(calls[1].url).toBe('https://abcd1234.supabase.co/rest/v1/rpc/put_backup');
    expect(calls[1].headers.apikey).toBe(cfg.key);
    expect(calls[1].body.p_id).toHaveLength(64);
    expect(calls[1].body.p_data).not.toContain('Italiana');
    const pulled = await cloudPull(cfg, f);
    expect(pulled?.updatedAt).toBe('2026-11-19T10:00:00Z');
    expect(parseBackup(pulled!.json).games.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('errores claros', async () => {
    const st = (status: number) => async () => new Response('', { status });
    await expect(cloudPush(cfg, '{}', st(401))).rejects.toThrow('anon key');
    await expect(cloudPush(cfg, '{}', st(404))).rejects.toThrow('SQL del README');
    await expect(cloudPush(cfg, '{}', st(500))).rejects.toThrow('500');
    await expect(cloudPush(cfg, '{}', async () => { throw new TypeError('x'); })).rejects.toThrow('conectar');
  });

  it('valida la configuración', () => {
    expect(validateConfig(cfg).url).toBe('https://abcd1234.supabase.co');
    expect(validateConfig({ ...cfg, url: 'https://abcd1234.supabase.co/' }).url).toBe('https://abcd1234.supabase.co');
    expect(() => validateConfig({ ...cfg, url: 'https://evil.example.com' })).toThrow('Supabase');
    expect(() => validateConfig({ ...cfg, key: 'x' })).toThrow('clave');
    expect(() => validateConfig({ ...cfg, code: '1' })).toThrow('código');
  });

  it('el SQL solo expone las dos funciones y no políticas abiertas', () => {
    expect(CLOUD_SQL).toContain('enable row level security');
    expect(CLOUD_SQL).not.toMatch(/create policy/i);
    expect(CLOUD_SQL).toContain('grant execute on function public.get_backup');
  });
});
