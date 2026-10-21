// Modo demonstração: um Postgres de verdade rodando no navegador (PGlite),
// com as MESMAS migrações do Supabase. Assim a demonstração segue exatamente as regras do sistema real.
import type { PGlite, Transaction } from '@electric-sql/pglite';

export const DEMO_USER = { id: '00000000-0000-4000-8000-0000000000aa', email: 'voce@demonstracao.local' };
export const BOT = (i: number) => `00000000-0000-4000-8000-00000000000${i}`;
export const DEMO_INVITE = 'demo0000000000000000000000000001';
const DB_NAME = 'sala8bit-demo';
const VERSION = '7'; // muda quando o esquema da demonstração muda: recria o banco

const MIGRATIONS = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// datas chegam como texto ISO, igual ao Supabase
const ts = (v: string) => new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString();
const PARSERS = { 1082: (v: string) => v, 1083: (v: string) => v, 1114: (v: string) => ts(v + 'Z'), 1184: ts };

let dbp: Promise<PGlite> | null = null;
let seeding: PGlite | null = null;

const log = (...a: unknown[]) => { try { if (localStorage.getItem('sala8bit.debug')) console.info('[demo]', ...a); } catch { /* */ } };
async function open(): Promise<PGlite> {
  log('abrindo');
  const { PGlite } = await import('@electric-sql/pglite');
  let db = new PGlite('idb://' + DB_NAME);
  await db.waitReady;
  log('pronto');
  const ok = await db.query<{ v: string }>(`select obj_description('public'::regnamespace) v`).then(r => r.rows[0]?.v === 'sala8bit-demo-' + VERSION).catch(() => false);
  if (!ok) {
    // banco novo (ou de uma versão antiga da demonstração): recria tudo
    await db.exec(`drop schema if exists public cascade; drop schema if exists auth cascade; create schema public; grant all on schema public to public;`);
    log('migrações');
    await bootstrap(db);
    log('seed');
    const { seed } = await import('./seed');
    seeding = db;
    try { await seed(); } finally { seeding = null; }
    log('seed ok');
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  await db.exec(`set timezone to '${tz.replace(/'/g, '')}'`);
  return db;
}

async function bootstrap(db: PGlite) {
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (const k of Object.keys(MIGRATIONS).sort()) await db.exec(MIGRATIONS[k]);
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
                 comment on schema public is 'sala8bit-demo-${VERSION}';`);
}

export function getDb() {
  if (!dbp) dbp = open();
  // durante o open o seed chama getDb de novo; devolve o mesmo banco
  return dbp;
}

/** Roda SQL como um usuário logado, com as regras de segurança (RLS) valendo. */
export async function asUser<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const db = seeding || await getDb();
  const out = await db.transaction(async (tx: Transaction) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await tx.exec('set local role authenticated');
    const r = await tx.query<T>(sql, params, { parsers: PARSERS });
    return r.rows;
  });
  return out as T[];
}
/** SQL como administrador do banco (só para montar a demonstração). */
export async function asAdmin<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = seeding || await getDb();
  return (await db.query<T>(sql, params, { parsers: PARSERS })).rows;
}

/** Chama uma função do banco com argumentos nomeados, como o supabase.rpc. */
export async function rpc<T = Record<string, unknown>>(uid: string, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const keys = Object.keys(args);
  const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
  const rows = await asUser<T>(uid, sql, keys.map(k => args[k]));
  emit();
  return rows;
}

export const emit = () => window.dispatchEvent(new Event('sala8bit-live'));
export async function resetDemo() {
  try { const db = await dbp; await db?.close(); } catch { /* */ }
  dbp = null;
  await new Promise(res => { const r = indexedDB.deleteDatabase('/pglite/' + DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res(null); });
}
