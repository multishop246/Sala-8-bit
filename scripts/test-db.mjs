// Testa as migrações num Postgres embutido (PGlite), simulando o Supabase (auth.uid, papéis e RLS).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
const dir = new URL('../supabase/migrations/', import.meta.url);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', C = '33333333-3333-3333-3333-333333333333';
await q(`insert into auth.users values ($1),($2),($3)`, [A, B, C]);
const as = async (uid, fn) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`); try { return await fn(); } finally { await db.exec('reset role'); } };
let ok = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); ok++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '→', e.message); } };
const expectErr = async (fn, re) => { try { await fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error('erro inesperado: ' + e.message); return; } throw new Error('deveria ter falhado'); };

let ws;
await t('A cria a empresa e vira admin', () => as(A, async () => {
  ws = (await q(`select * from create_workspace('Aromasil Marketing','aromasil',7)`)).rows[0];
  const m = (await q(`select is_admin, kind from members where workspace_id=$1`, [ws.id])).rows;
  if (m.length !== 1 || !m[0].is_admin) throw new Error(JSON.stringify(m));
}));
await t('catálogo padrão foi criado', () => as(A, async () => {
  const r = (await q(`select kind, count(*)::int n from catalog_items where workspace_id=$1 group by kind order by kind`, [ws.id])).rows;
  const by = Object.fromEntries(r.map(x => [x.kind, x.n]));
  if (by.funcao !== 8 || by.area !== 6 || !(by.tipo > 80)) throw new Error(JSON.stringify(by));
}));
await t('slug repetido é recusado', () => as(B, () => expectErr(() => q(`select create_workspace('Outra','aromasil')`), /endereço/)));
await t('B não vê a empresa de A', () => as(B, async () => {
  const r = (await q(`select count(*)::int n from workspaces`)).rows[0].n; if (r !== 0) throw new Error('viu ' + r);
  const c = (await q(`select count(*)::int n from catalog_items`)).rows[0].n; if (c !== 0) throw new Error('viu catálogo');
}));
await t('B não consegue se inserir direto', () => as(B, () => expectErr(() => q(`insert into members(workspace_id,user_id) values ($1,$2)`, [ws.id, B]))));
let inv, invG;
await t('A gera convites', () => as(A, async () => {
  inv = (await q(`select * from create_invite($1,'membro')`, [ws.id])).rows[0];
  invG = (await q(`select * from create_invite($1,'gestor',7,1)`, [ws.id])).rows[0];
}));
await t('B não gera convite', () => as(B, () => expectErr(() => q(`select create_invite($1)`, [ws.id]), /administrador/)));
await t('B vê prévia e aceita convite', () => as(B, async () => {
  const p = (await q(`select * from invite_preview($1)`, [inv.token])).rows[0];
  if (!p.valid || p.workspace_name !== 'Aromasil Marketing') throw new Error(JSON.stringify(p));
  const slug = (await q(`select accept_invite($1) s`, [inv.token])).rows[0].s; if (slug !== 'aromasil') throw new Error(slug);
}));
await t('aceitar de novo não duplica', () => as(B, async () => { await q(`select accept_invite($1)`, [inv.token]); }));
await t('C entra como gestor', () => as(C, async () => { await q(`select accept_invite($1)`, [invG.token]); }));
await t('convite de 1 uso esgota', () => as(B, async () => {
  const p = (await q(`select * from invite_preview($1)`, [invG.token])).rows[0]; if (p.valid) throw new Error('ainda válido');
}));
await t('B completa o perfil', () => as(B, async () => {
  await q(`update members set display_name='Bruno', avatar='{"sex":"m"}', main_role='Designer', consent_at=now() where workspace_id=$1 and user_id=$2`, [ws.id, B]);
}));
await t('B não vira admin sozinho', () => as(B, () => expectErr(() => q(`update members set is_admin=true where workspace_id=$1 and user_id=$2`, [ws.id, B]), /administrador/)));
await t('B não edita o perfil de A', () => as(B, async () => {
  const r = await q(`update members set display_name='hack' where workspace_id=$1 and user_id=$2`, [ws.id, A]);
  if (r.affectedRows) throw new Error('editou');
}));
await t('B escolhe a mesa 3', () => as(B, () => q(`select claim_desk($1,3)`, [ws.id])));
await t('B não troca de mesa sozinho', () => as(B, () => expectErr(() => q(`select claim_desk($1,4)`, [ws.id]), /já tem uma mesa/)));
await t('B não muda a mesa por update', () => as(B, () => expectErr(() => q(`update members set desk=5 where workspace_id=$1 and user_id=$2`, [ws.id, B]))));
await t('A não pega mesa ocupada', () => as(A, () => expectErr(() => q(`select claim_desk($1,3)`, [ws.id]), /escolher essa mesa/)));
await t('mesa fora do limite', () => as(A, () => expectErr(() => q(`select claim_desk($1,9)`, [ws.id]), /inexistente/)));
await t('gestor não pega mesa comum', () => as(C, () => expectErr(() => q(`select claim_desk($1,1)`, [ws.id]), /diretoria/)));
await t('A libera a mesa de B e B escolhe outra', async () => {
  await as(A, () => q(`update members set desk=null where workspace_id=$1 and user_id=$2`, [ws.id, B]));
  await as(B, () => q(`select claim_desk($1,5)`, [ws.id]));
});
await t('não reduz mesas com gente sentada', () => as(A, () => expectErr(() => q(`update workspaces set desks=4 where id=$1`, [ws.id]), /sentadas/)));
await t('B não edita a empresa nem o catálogo', () => as(B, async () => {
  const r = await q(`update workspaces set name='x' where id=$1`, [ws.id]); if (r.affectedRows) throw new Error('editou empresa');
  await expectErr(() => q(`insert into catalog_items(workspace_id,kind,name) values ($1,'linha','X')`, [ws.id]));
}));
await t('A adiciona linhas', () => as(A, () => q(`insert into catalog_items(workspace_id,kind,name) values ($1,'linha','Aromasil'),($1,'linha','Fidalgos')`, [ws.id])));
await t('A não remove o último admin', () => as(A, () => expectErr(() => q(`update members set is_admin=false where workspace_id=$1 and user_id=$2`, [ws.id, A]), /administrador/)));
await t('A promove B e aí pode sair', async () => {
  await as(A, () => q(`update members set is_admin=true where workspace_id=$1 and user_id=$2`, [ws.id, B]));
  await as(A, () => q(`update members set is_admin=false where workspace_id=$1 and user_id=$2`, [ws.id, A]));
});
await t('gestor vira membro pelo admin', () => as(B, () => q(`update members set kind='membro' where workspace_id=$1 and user_id=$2`, [ws.id, C])));
await t('excluir a conta de um usuário funciona', async () => { await q(`delete from auth.users where id=$1`, [C]); });
await t('criador exclui a empresa inteira', async () => {
  const r = await as(A, () => q(`delete from workspaces where id=$1`, [ws.id]));
  if (!r.affectedRows) throw new Error('não excluiu');
  const left = (await q(`select count(*)::int n from members`)).rows[0].n; if (left) throw new Error('sobraram membros');
});
await t('excluir a conta do único admin funciona (LGPD)', async () => {
  const w2 = await as(B, async () => (await q(`select * from create_workspace('Outra Equipe','outra-equipe')`)).rows[0]);
  const i2 = await as(B, async () => (await q(`select * from create_invite($1)`, [w2.id])).rows[0]);
  await as(A, () => q(`select accept_invite($1)`, [i2.token]));
  await q(`delete from auth.users where id=$1`, [B]);
  const adm = (await q(`select is_admin from members where workspace_id=$1 and user_id=$2`, [w2.id, A])).rows[0];
  if (!adm || !adm.is_admin) throw new Error('A não virou admin');
});
console.log(`\n${ok} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
