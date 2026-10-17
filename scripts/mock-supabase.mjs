// Servidor de teste: imita o endpoint /rest/v1/rpc do Supabase usando as migrações num Postgres embutido.
// Serve para testar o app de computador sem um projeto Supabase.   node scripts/mock-supabase.mjs 5999
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';

const port = +(process.argv[2] || 5999);
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated; grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
const dir = new URL('../supabase/migrations/', import.meta.url);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'));
const U = '99999999-9999-4999-8999-999999999999';
await db.query(`insert into auth.users values ($1)`, [U]);
await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
const ws = (await db.query(`select * from create_workspace('Teste do app','teste-app')`)).rows[0];
await db.query(`update members set display_name='Ana', main_role='Designer', consent_at=now() where user_id=$1`, [U]);
const token = (await db.query(`select create_agent_token($1,'Linux de teste','linux') t`, [ws.id])).rows[0].t;
await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
console.log(JSON.stringify({ token, workspace: ws.id }));

createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', async () => {
    const m = req.url.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (req.method === 'GET' && req.url === '/_minutos') {
      const r = await db.query(`select to_char(minute,'HH24:MI') m, app, category, agents, music from activity_minutes order by minute`);
      const s = await db.query(`select state, app_now, app_cat, agents, idle, agent_seen_at is not null visto from statuses`);
      res.end(JSON.stringify({ minutos: r.rows, status: s.rows })); return;
    }
    if (req.method !== 'POST' || !m || !['agent_config', 'agent_report'].includes(m[1])) { res.writeHead(404); res.end('{}'); return; }
    try {
      const args = JSON.parse(body || '{}');
      const keys = Object.keys(args);
      const r = await db.transaction(async tx => {
        await tx.exec('set local role anon');
        return tx.query(`select public.${m[1]}(${keys.map((k, i) => `${k} => $${i + 1}${k === 'p_minutes' ? '::jsonb' : ''}`).join(', ')}) r`, keys.map(k => k === 'p_minutes' ? JSON.stringify(args[k]) : args[k]));
      });
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(r.rows[0].r));
      console.log(new Date().toISOString().slice(11, 19), m[1], m[1] === 'agent_report' ? `${(args.p_minutes || []).length} min` : '');
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ message: e.message })); console.log('erro', e.message); }
  });
}).listen(port, () => console.log('ouvindo em', port));
