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

// ------------------------------------------------------------ 0.2: sala ao vivo
const D = '44444444-4444-4444-4444-444444444444', E = '55555555-5555-5555-5555-555555555555', G = '66666666-6666-6666-6666-666666666666', X = '77777777-7777-7777-7777-777777777777';
await q(`insert into auth.users values ($1),($2),($3),($4)`, [D, E, G, X]);
const today = new Date().toISOString().slice(0, 10);
let w3;
await t('0.2 · equipe nova com status criado para cada membro', async () => {
  w3 = await as(D, async () => (await q(`select * from create_workspace('Sala Viva','sala-viva')`)).rows[0]);
  const im = await as(D, async () => (await q(`select * from create_invite($1)`, [w3.id])).rows[0]);
  const ig = await as(D, async () => (await q(`select * from create_invite($1,'gestor')`, [w3.id])).rows[0]);
  await as(E, () => q(`select accept_invite($1)`, [im.token]));
  await as(G, () => q(`select accept_invite($1)`, [ig.token]));
  const n = (await q(`select count(*)::int n from statuses where workspace_id=$1 and state='fora'`, [w3.id])).rows[0].n;
  if (n !== 3) throw new Error('status: ' + n);
});
const st = async uid => (await q(`select state, meeting_id from statuses where workspace_id=$1 and user_id=$2`, [w3.id, uid])).rows[0];
await t('0.2 · entrar no escritório e ir ao café abre uma pausa', async () => {
  await as(D, () => q(`select set_state($1,'trabalhando',$2,'computador')`, [w3.id, today]));
  await as(E, () => q(`select set_state($1,'trabalhando',$2,'celular')`, [w3.id, today]));
  await as(E, () => q(`select set_state($1,'cafe',$2)`, [w3.id, today]));
  const open = (await q(`select count(*)::int n from pauses where user_id=$1 and ended_at is null`, [E])).rows[0].n;
  if (open !== 1 || (await st(E)).state !== 'cafe') throw new Error('sem pausa aberta');
});
await t('0.2 · voltar à mesa fecha a pausa', async () => {
  await as(E, () => q(`select set_state($1,'trabalhando',$2)`, [w3.id, today]));
  const open = (await q(`select count(*)::int n from pauses where user_id=$1 and ended_at is null`, [E])).rows[0].n;
  if (open !== 0) throw new Error('pausa ficou aberta');
});
await t('0.2 · almoço só uma vez por dia', async () => {
  await as(E, () => q(`select set_state($1,'almoco',$2)`, [w3.id, today]));
  await as(E, () => q(`select set_state($1,'trabalhando',$2)`, [w3.id, today]));
  await as(E, () => expectErr(() => q(`select set_state($1,'almoco',$2)`, [w3.id, today]), /almoço/));
});
await t('0.2 · não dá para mudar status direto na tabela', async () => {
  await as(E, async () => { const r = await q(`update statuses set state='reuniao' where user_id=$1`, [E]); if (r.affectedRows) throw new Error('mudou'); });
});
await t('0.2 · reunião só pelo botão', () => as(E, () => expectErr(() => q(`select set_state($1,'reuniao',$2)`, [w3.id, today]), /reunião/)));
await t('0.2 · gestor não usa copa', async () => {
  await as(G, () => q(`select set_state($1,'trabalhando',$2)`, [w3.id, today]));
  await as(G, () => expectErr(() => q(`select set_state($1,'cafe',$2)`, [w3.id, today]), /gestor/));
});
await t('0.2 · pausa do gestor', async () => {
  await as(E, () => q(`select set_state($1,'pausa_gestor',$2)`, [w3.id, today]));
  if ((await st(E)).state !== 'pausa_gestor') throw new Error('não entrou');
});
let mt;
await t('0.2 · D marca reunião e leva E e o gestor', async () => {
  mt = await as(D, async () => (await q(`select * from start_meeting($1,'Alinhamento',$2,2,1)`, [w3.id, [E, G]])).rows[0]);
  for (const u of [D, E, G]) { const s = await st(u); if (s.state !== 'reuniao' || s.meeting_id !== mt.id) throw new Error(u + ' ' + JSON.stringify(s)); }
});
await t('0.2 · reunião registra os 3 participantes', async () => {
  const r = (await q(`select count(*)::int n from meeting_members where meeting_id=$1`, [mt.id])).rows[0].n; if (r !== 3) throw new Error('membros ' + r);
});
await t('0.2 · E sai e a reunião continua', async () => {
  await as(E, () => q(`select leave_meeting($1)`, [w3.id]));
  if ((await st(E)).state !== 'trabalhando') throw new Error('E não voltou');
  if ((await st(D)).state !== 'reuniao') throw new Error('D saiu junto');
});
await t('0.2 · E entra de novo pela sala', async () => {
  await as(E, () => q(`select join_meeting($1)`, [mt.id]));
  if ((await st(E)).state !== 'reuniao') throw new Error('não entrou');
});
await t('0.2 · quem criou sai e todos voltam para a mesa', async () => {
  await as(D, () => q(`select leave_meeting($1)`, [w3.id]));
  for (const u of [D, E, G]) if ((await st(u)).state !== 'trabalhando') throw new Error(u + ' ficou');
  const e = (await q(`select ended_at from meetings where id=$1`, [mt.id])).rows[0].ended_at; if (!e) throw new Error('não encerrou');
});
await t('0.2 · ir ao café sai da reunião', async () => {
  const m2 = await as(D, async () => (await q(`select * from start_meeting($1,'Rápida',$2)`, [w3.id, [E]])).rows[0]);
  await as(E, () => q(`select set_state($1,'cafe',$2)`, [w3.id, today]));
  const left = (await q(`select left_at from meeting_members where meeting_id=$1 and user_id=$2`, [m2.id, E])).rows[0].left_at;
  if (!left || (await st(D)).state !== 'reuniao') throw new Error('estado errado');
  await as(D, () => q(`select leave_meeting($1)`, [w3.id]));
});
await t('0.2 · chamar atenção e só o destinatário confirma', async () => {
  await as(D, () => q(`select call_attention($1,$2)`, [w3.id, E]));
  await as(D, () => q(`select call_attention($1,$2)`, [w3.id, E])); // repetido não duplica
  const n = (await q(`select count(*)::int n from attention_calls where seen_at is null`)).rows[0].n; if (n !== 1) throw new Error('chamadas ' + n);
  const gv = await as(G, async () => (await q(`select count(*)::int n from attention_calls`)).rows[0].n); if (gv !== 0) throw new Error('terceiro viu');
  await as(D, () => q(`select ack_attention($1,$2)`, [w3.id, E]));
  if ((await q(`select count(*)::int n from attention_calls where seen_at is null`)).rows[0].n !== 1) throw new Error('remetente confirmou');
  await as(E, () => q(`select ack_attention($1,$2)`, [w3.id, D]));
  if ((await q(`select count(*)::int n from attention_calls where seen_at is null`)).rows[0].n !== 0) throw new Error('não confirmou');
});
await t('0.2 · quem é de fora não mexe em nada', async () => {
  await as(X, async () => {
    await expectErr(() => q(`select set_state($1,'trabalhando',$2)`, [w3.id, today]), /não faz parte/);
    await expectErr(() => q(`select start_meeting($1,'Invasão','{}')`, [w3.id]), /não faz parte/);
    await expectErr(() => q(`select call_attention($1,$2)`, [w3.id, D]), /não faz parte/);
    const n = (await q(`select count(*)::int n from statuses`)).rows[0].n; if (n) throw new Error('viu status');
  });
});
await t('0.2 · remover membro apaga status e pausas', async () => {
  await as(D, () => q(`delete from members where workspace_id=$1 and user_id=$2`, [w3.id, E]));
  const n = (await q(`select (select count(*) from statuses where user_id=$1) + (select count(*) from pauses where user_id=$1) n`, [E])).rows[0].n;
  if (Number(n)) throw new Error('sobrou ' + n);
});

// ------------------------------------------------------------ 0.3: tarefas e chat
const U1 = 'a1111111-1111-1111-1111-111111111111', U2 = 'a2222222-2222-2222-2222-222222222222', U3 = 'a3333333-3333-3333-3333-333333333333', UG = 'a4444444-4444-4444-4444-444444444444';
await q(`insert into auth.users values ($1),($2),($3),($4)`, [U1, U2, U3, UG]);
let w4, line, video, design, tipoV, tipoD, ia;
await t('0.3 · equipe com 3 membros e um gestor', async () => {
  w4 = await as(U1, async () => (await q(`select * from create_workspace('Tarefas','tarefas')`)).rows[0]);
  const im = await as(U1, async () => (await q(`select * from create_invite($1)`, [w4.id])).rows[0]);
  const ig = await as(U1, async () => (await q(`select * from create_invite($1,'gestor')`, [w4.id])).rows[0]);
  await as(U2, () => q(`select accept_invite($1)`, [im.token])); await as(U3, () => q(`select accept_invite($1)`, [im.token])); await as(UG, () => q(`select accept_invite($1)`, [ig.token]));
  for (const [u, n] of [[U1, 'Ana'], [U2, 'Bia'], [U3, 'Caio'], [UG, 'Gil']]) await as(u, () => q(`update members set display_name=$3, consent_at=now() where workspace_id=$1 and user_id=$2`, [w4.id, u, n]));
  line = await as(U1, async () => (await q(`insert into catalog_items(workspace_id,kind,name) values ($1,'linha','Aromasil') returning id`, [w4.id])).rows[0].id);
  const c = (await q(`select id, name, kind, parent_id from catalog_items where workspace_id=$1`, [w4.id])).rows;
  video = c.find(x => x.kind === 'area' && x.name === 'Vídeo').id; design = c.find(x => x.kind === 'area' && x.name === 'Design').id; ia = c.find(x => x.kind === 'area' && x.name === 'IA').id;
  tipoV = c.find(x => x.kind === 'tipo' && x.parent_id === video).id; tipoD = c.find(x => x.kind === 'tipo' && x.parent_id === design).id;
  for (const u of [U1, U2, U3]) await as(u, () => q(`select set_state($1,'trabalhando',current_date)`, [w4.id]));
});
const WD = (() => { const d = new Date(Date.now() + 2 * 864e5); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1); return `'${d.toISOString().slice(0, 10)}'::date`; })();
const ct = (uid, title, area, type, desc = '', due = WD, dir = null) => as(uid, async () => (await q(`select * from create_task($1,$2,$3,$4,$5,$6,$7,${due},null,60)`, [w4.id, title, desc, line, area, type, dir])).rows[0]);
const tk = async id => (await q(`select * from tasks where id=$1`, [id])).rows[0];
let tv, td;
await t('0.3 · criar tarefa de vídeo começa no roteiro', async () => { tv = await ct(U1, 'Vídeo institucional', video, tipoV); if (tv.etapa !== 'roteiro') throw new Error(tv.etapa); });
await t('0.3 · tipo obrigatório quando a área tem tipos', () => expectErr(() => ct(U1, 'Sem tipo', design, null), /tipo/));
await t('0.3 · área sem tipos exige observação', async () => { await expectErr(() => ct(U1, 'Prompt', ia, null), /observação/); await ct(U1, 'Prompt', ia, null, 'Criar prompts de legenda'); });
await t('0.3 · domingo não tem expediente', () => expectErr(() => ct(U1, 'Domingo', design, tipoD, '', `(current_date + (7 - extract(dow from current_date)::int))`), /domingo/));
await t('0.3 · gestor não cria tarefa', () => expectErr(() => ct(UG, 'Do gestor', design, tipoD), /gestor/));
await t('0.3 · quem é de fora não vê tarefas', () => as(X, async () => { if ((await q(`select count(*)::int n from tasks`)).rows[0].n) throw new Error('viu'); }));
await t('0.3 · iniciar e o relógio corre só com a pessoa trabalhando', async () => {
  await as(U2, () => q(`select start_task($1)`, [tv.id]));
  let x = await tk(tv.id); if (x.col !== 'fazendo' || x.owner !== U2 || !x.running_since) throw new Error(JSON.stringify(x));
  await q(`update tasks set running_since = now() - interval '30 minutes' where id=$1`, [tv.id]);
  await as(U2, () => q(`select set_state($1,'cafe',current_date)`, [w4.id]));
  x = await tk(tv.id); if (x.running_since || x.spent_sec < 1790) throw new Error('não pausou: ' + JSON.stringify(x));
  await as(U2, () => q(`select set_state($1,'trabalhando',current_date)`, [w4.id]));
  x = await tk(tv.id); if (!x.running_since) throw new Error('não voltou');
});
await t('0.3 · só quem executa conclui', () => as(U3, () => expectErr(() => q(`select complete_task($1)`, [tv.id]), /executando/)));
await t('0.6 · ajuda aceita na etapa de vídeo', async () => {
  await as(U2, () => q(`select request_help($1,$2,'Apoiar o roteiro')`, [tv.id, [U3]]));
  const h = (await q(`select id from task_help where task_id=$1 and to_user=$2 and status='pendente'`, [tv.id, U3])).rows[0];
  await as(U3, () => q(`select answer_help($1,true)`, [h.id]));
});
await t('0.3 · concluir etapa volta para A fazer vinculada', async () => {
  await as(U2, () => q(`select complete_task($1)`, [tv.id]));
  const x = await tk(tv.id); if (x.col !== 'afazer' || x.etapa !== 'captacao' || x.linked_to !== U2 || x.owner) throw new Error(JSON.stringify(x));
  const d = (await q(`select minutes, etapa from task_durations where task_id=$1`, [tv.id])).rows[0]; if (!d || d.etapa !== 'roteiro' || d.minutes < 29) throw new Error(JSON.stringify(d));
  const completed=(await q(`select completed_stage from task_events where task_id=$1 and kind='etapa'`,[tv.id])).rows[0];
  if(completed?.completed_stage!=='roteiro') throw new Error('Histórico deve registrar a etapa concluída, não a próxima.');
  const activeHelp=(await q(`select count(*)::int n from task_help where task_id=$1 and status in ('pendente','aceita')`,[tv.id])).rows[0].n;
  if(activeHelp) throw new Error('Ajuda continuou após mudar de etapa');
});
await t('0.3 · vínculo não restringe: outro pega a captação', async () => { await as(U3, () => q(`select start_task($1)`, [tv.id])); if ((await tk(tv.id)).owner !== U3) throw new Error('não pegou'); });
await t('0.6 · ajuda pode ser solicitada de novo na próxima etapa', async () => {
  await as(U3, () => q(`select request_help($1,$2,'Apoiar a captação')`, [tv.id, [U2]]));
  const h=(await q(`select status from task_help where task_id=$1 and to_user=$2 order by created_at desc limit 1`,[tv.id,U2])).rows[0];
  if(h?.status!=='pendente') throw new Error('Nova ajuda não foi criada');
});
await t('0.3 · passa pelas 4 etapas até Feito', async () => {
  await as(U3, () => q(`select complete_task($1)`, [tv.id]));
  await as(U1, () => q(`select start_task($1)`, [tv.id])); await as(U1, () => q(`select complete_task($1)`, [tv.id]));
  await as(U1, () => q(`select start_task($1)`, [tv.id])); const x = (await as(U1, async () => (await q(`select * from complete_task($1)`, [tv.id])).rows[0]));
  if (x.col !== 'feito' || !x.done_at) throw new Error(JSON.stringify(x));
});
await t('0.3 · contestação trava a tarefa até a votação', async () => {
  td = await ct(U1, 'Post de Natal', design, tipoD);
  await as(U2, () => q(`select contest_task($1,'Usar o template do ano passado')`, [td.id]));
  await as(U3, () => expectErr(() => q(`select start_task($1)`, [td.id]), /votação/));
  await as(U2, () => expectErr(() => q(`select vote_contest((select id from task_contests where task_id=$1),true)`, [td.id]), /já votou/));
});
await t('0.3 · maioria aprova e a sugestão entra na descrição', async () => {
  await as(U3, () => q(`select vote_contest((select id from task_contests where task_id=$1),true)`, [td.id]));
  const c = (await q(`select status from task_contests where task_id=$1`, [td.id])).rows[0]; if (c.status !== 'aprovada') throw new Error(c.status);
  if (!(await tk(td.id)).description.includes('template')) throw new Error('descrição');
  await as(U1, () => expectErr(() => q(`select vote_contest((select id from task_contests where task_id=$1),false)`, [td.id]), /terminou/));
});
await t('0.3 · transferência: recusar exige justificativa; aceitar passa a tarefa', async () => {
  await as(U3, () => q(`select start_task($1)`, [td.id]));
  await as(U3, () => q(`select request_transfer($1,$2)`, [td.id, U1]));
  await as(U3, () => expectErr(() => q(`select request_transfer($1,$2)`, [td.id, U2]), /aguardando/));
  const tr = (await q(`select id from task_transfers where task_id=$1 and status='pendente'`, [td.id])).rows[0].id;
  await as(U2, () => expectErr(() => q(`select answer_transfer($1,true)`, [tr]), /não é para você/));
  await as(U1, () => expectErr(() => q(`select answer_transfer($1,false,'')`, [tr]), /recusando/));
  await as(U1, () => q(`select answer_transfer($1,true)`, [tr]));
  const x = await tk(td.id); if (x.owner !== U1) throw new Error('dono ' + x.owner);
  const a = (await q(`select active_task_id from statuses where workspace_id=$1 and user_id=$2`, [w4.id, U1])).rows[0].active_task_id; if (a !== td.id) throw new Error('não ficou ativa');
});
await t('0.3 · pedido de ajuda exige observação', async () => {
  await as(U1, () => expectErr(() => q(`select request_help($1,$2,'')`, [td.id, [U2]]), /ajuda/));
  await as(U1, () => q(`select request_help($1,$2,'Revisar o texto')`, [td.id, [U2, U3]]));
  const hs = (await q(`select id, to_user from task_help where task_id=$1`, [td.id])).rows; if (hs.length !== 2) throw new Error('pedidos ' + hs.length);
  await as(U2, () => q(`select answer_help($1,true)`, [hs.find(h => h.to_user === U2).id]));
  await as(U3, () => q(`select answer_help($1,false,'Estou na gravação')`, [hs.find(h => h.to_user === U3).id]));
});
await t('0.3 · mudar status direto na tabela não funciona', () => as(U2, async () => { const r = await q(`update tasks set col='feito' where id=$1`, [td.id]); if (r.affectedRows) throw new Error('mudou'); }));
await t('0.3 · chat: mensagem precisa de demanda e sinaliza fora do assunto', async () => {
  await as(U2, () => expectErr(() => q(`select send_message($1,$2,null,'oi')`, [w4.id, U1]), /demanda/));
  const m1 = await as(U2, async () => (await q(`select * from send_message($1,$2,$3,'Revisei o texto do post')`, [w4.id, U1, td.id])).rows[0]);
  const m2 = await as(U2, async () => (await q(`select * from send_message($1,$2,$3,'Viu o jogo de ontem?')`, [w4.id, U1, td.id])).rows[0]);
  if (m1.flagged || !m2.flagged) throw new Error('filtro');
  const seen3 = await as(U3, async () => (await q(`select count(*)::int n from messages`)).rows[0].n); if (seen3) throw new Error('terceiro leu');
  const seenGestor = await as(UG, async () => (await q(`select count(*)::int n from messages`)).rows[0].n); if (seenGestor) throw new Error('gestor leu conversa alheia');
  await as(U1, () => q(`select mark_read($1,$2)`, [w4.id, U2]));
  if ((await q(`select count(*)::int n from messages where read_at is null`)).rows[0].n) throw new Error('não marcou lido');
  await as(U3, () => q(`select send_message($1,$2,$3,'Sobre a gravação')`, [w4.id, U1, tv.id]));
  const mine2 = await as(U2, async () => (await q(`select count(*)::int n from messages`)).rows[0].n);
  const mine1 = await as(U1, async () => (await q(`select count(*)::int n from messages`)).rows[0].n);
  if (mine2 !== 2 || mine1 !== 3) throw new Error(`isolamento falhou: ${mine2}/${mine1}`);
  await as(UG, () => expectErr(() => q(`insert into messages(workspace_id,from_user,to_user,task_id,text) values($1,$2,$3,$4,'Mensagem falsa')`, [w4.id, U2, U1, td.id])));
});
await t('0.3 · responder no chat apaga a placa ATENÇÃO', async () => {
  await as(U2, () => q(`select call_attention($1,$2)`, [w4.id, U1]));
  await as(U1, () => q(`select send_message($1,$2,$3,'Oi, pode falar')`, [w4.id, U2, td.id]));
  if ((await q(`select count(*)::int n from attention_calls where workspace_id=$1 and seen_at is null`, [w4.id])).rows[0].n) throw new Error('placa ficou');
});
await t('0.3 · quem sai da equipe devolve a tarefa', async () => {
  await as(U1, () => q(`delete from members where workspace_id=$1 and user_id=$2`, [w4.id, U3]));
  const t2 = await ct(U2, 'Story', design, tipoD); await as(U2, () => q(`select start_task($1)`, [t2.id]));
  await as(U1, () => q(`delete from members where workspace_id=$1 and user_id=$2`, [w4.id, U2]));
  const x = await tk(t2.id); if (x.col !== 'afazer' || x.owner) throw new Error(JSON.stringify(x));
});

// ------------------------------------------------------------ 0.4: mural, painel, SABADÃO, Instagram
const V1 = 'b1111111-1111-1111-1111-111111111111', V2 = 'b2222222-2222-2222-2222-222222222222';
await q(`insert into auth.users values ($1),($2)`, [V1, V2]);
let w5, l5, d5, t5;
const SAT = (() => { const d = new Date(Date.now() + 864e5); while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
await t('0.4 · equipe nova', async () => {
  w5 = await as(V1, async () => (await q(`select * from create_workspace('Mural','mural')`)).rows[0]);
  const im = await as(V1, async () => (await q(`select * from create_invite($1)`, [w5.id])).rows[0]);
  await as(V2, () => q(`select accept_invite($1)`, [im.token]));
  for (const [u, n] of [[V1, 'Vera'], [V2, 'Vitor']]) await as(u, () => q(`update members set display_name=$3, consent_at=now() where workspace_id=$1 and user_id=$2`, [w5.id, u, n]));
  l5 = await as(V1, async () => (await q(`insert into catalog_items(workspace_id,kind,name) values ($1,'linha','L') returning id`, [w5.id])).rows[0].id);
  const c = (await q(`select id, name, kind, parent_id from catalog_items where workspace_id=$1`, [w5.id])).rows;
  d5 = c.find(x => x.kind === 'area' && x.name === 'Design'); d5.tipo = c.find(x => x.kind === 'tipo' && x.parent_id === d5.id).id;
  for (const u of [V1, V2]) await as(u, () => q(`select set_state($1,'trabalhando',current_date)`, [w5.id]));
});
await t('0.4 · tempo da tarefa vai para o registro do dia', async () => {
  t5 = await as(V2, async () => (await q(`select * from create_task($1,'Peça',null,$2,$3,$4,null,${WD},null,60)`, [w5.id, l5, d5.id, d5.tipo])).rows[0]);
  await as(V2, () => q(`select start_task($1)`, [t5.id]));
  await q(`update tasks set running_since = now() - interval '40 minutes' where id=$1`, [t5.id]);
  await as(V2, () => q(`select set_state($1,'cafe',current_date)`, [w5.id]));
  const s = (await q(`select sum(seconds)::int s from task_time_log where task_id=$1 and user_id=$2`, [t5.id, V2])).rows[0].s;
  if (!(s >= 2390)) throw new Error('segundos ' + s);
  await as(V2, () => q(`select set_state($1,'trabalhando',current_date)`, [w5.id]));
  await as(V2, () => q(`select complete_task($1)`, [t5.id]));
});
await t('0.4 · pontos do mês (glória)', async () => {
  const r = await as(V1, async () => (await q(`select * from glory_scores($1, current_date)`, [w5.id])).rows);
  const v = r.find(x => x.user_id === V2); if (!v || v.entregas !== 1 || v.tarefa_min < 39) throw new Error(JSON.stringify(r));
  await as(X, () => expectErr(() => q(`select * from glory_scores($1, current_date)`, [w5.id]), /não faz parte/));
});
await t('0.4 · resumo do dia', async () => {
  const r = await as(V1, async () => (await q(`select * from day_summary($1, $2)`, [w5.id, new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })])).rows);
  const v = r.find(x => x.user_id === V2); if (!v || v.tarefa_min < 39 || v.entregas !== 1) throw new Error(JSON.stringify(v));
});
await t('0.4 · folga no sábado leva a entrega para segunda', async () => {
  const ts = await as(V1, async () => (await q(`select * from create_task($1,'Sábado',null,$2,$3,$4,$5,$6,null,60)`, [w5.id, l5, d5.id, d5.tipo, V2, SAT])).rows[0]);
  await as(V2, () => expectErr(() => q(`select set_saturday($1,$2,$3,false)`, [w5.id, V1, SAT]), /administrador/));
  const n = await as(V2, async () => (await q(`select set_saturday($1,$2,$3,false) n`, [w5.id, V2, SAT])).rows[0].n);
  const d = (await q(`select to_char(due_date,'YYYY-MM-DD') d from tasks where id=$1`, [ts.id])).rows[0].d;
  const mon = new Date(SAT + 'T12:00:00Z'); mon.setUTCDate(mon.getUTCDate() + 2);
  if (n !== 1 || d !== mon.toISOString().slice(0, 10)) throw new Error(n + ' ' + d);
});
await t('0.4 · sábado bloqueado quando o SABADÃO está desligado', async () => {
  await as(V1, () => q(`update workspaces set settings = jsonb_set(settings, '{recursos,sabadao}', 'false') where id=$1`, [w5.id]));
  await as(V1, () => expectErr(() => q(`select create_task($1,'Sáb',null,$2,$3,$4,null,$5,null,60)`, [w5.id, l5, d5.id, d5.tipo, SAT]), /sábados/));
});
await t('0.4 · Instagram só o admin atualiza', async () => {
  await as(V2, () => expectErr(() => q(`select set_instagram($1,'@x',10)`, [w5.id]), /administrador/));
  await as(V1, () => q(`select set_instagram($1,'@aromasil',1234)`, [w5.id]));
  const f = await as(V2, async () => (await q(`select followers from instagram_stats where workspace_id=$1`, [w5.id])).rows[0].followers);
  if (f !== 1234) throw new Error(f);
});

// ------------------------------------------------------------ 0.5: app de computador
const asAnon = async fn => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`); try { return await fn(); } finally { await db.exec('reset role'); } };
let tok;
await t('0.5 · membro gera o código do aparelho; gestor não', async () => {
  tok = await as(V2, async () => (await q(`select create_agent_token($1,'Notebook','windows') t`, [w5.id])).rows[0].t);
  if (!tok || tok.length < 40) throw new Error('token');
  const h = (await q(`select token_hash from agent_tokens where user_id=$1`, [V2])).rows[0].token_hash; if (h === tok) throw new Error('guardou o token puro');
});
await t('0.5 · app sem login lê a configuração com o código', async () => {
  const c = await asAnon(async () => (await q(`select agent_config($1) c`, [tok])).rows[0].c);
  if (c.nome !== 'Vitor' || !Array.isArray(c.sites_referencia)) throw new Error(JSON.stringify(c));
  await asAnon(() => expectErr(() => q(`select agent_config('errado')`), /não autorizado/));
});
await t('0.5 · anônimo não lê tabelas', () => asAnon(() => expectErr(() => q(`select * from activity_minutes`))));
await t('0.5 · minutos gravados e status ao vivo', async () => {
  const now = new Date(); const mins = [0, 1, 2, 3].map(i => new Date(now.getTime() - (4 - i) * 60000).toISOString());
  const payload = JSON.stringify([
    { m: mins[0], app: 'Figma', cat: 'prod', agents: 0, music: false },
    { m: mins[1], app: 'Navegando na internet', cat: 'ref', agents: 0, music: true },
    { m: mins[2], app: 'Claude', cat: 'prod', agents: 3, music: false },
    { m: mins[3], app: 'Figma', cat: 'idle', agents: 0, music: false }]);
  const r = await asAnon(async () => (await q(`select agent_report($1, $2::jsonb) r`, [tok, payload])).rows[0].r);
  if (r.gravados !== 4) throw new Error(JSON.stringify(r));
  const s = (await q(`select app_now, idle, agent_seen_at from statuses where user_id=$1 and workspace_id=$2`, [V2, w5.id])).rows[0];
  if (s.app_now !== 'Figma' || !s.idle || !s.agent_seen_at) throw new Error(JSON.stringify(s));
});
await t('0.5 · café vira pausa, não ociosidade', async () => {
  await as(V2, () => q(`select set_state($1,'cafe',current_date)`, [w5.id]));
  await asAnon(() => q(`select agent_report($1, $2::jsonb)`, [tok, JSON.stringify([{ m: new Date().toISOString(), app: 'Figma', cat: 'idle', agents: 0 }])]));
  const c = (await q(`select category from activity_minutes where user_id=$1 order by minute desc limit 1`, [V2])).rows[0].category; if (c !== 'pausa') throw new Error(c);
  await as(V2, () => q(`select set_state($1,'trabalhando',current_date)`, [w5.id]));
});
await t('0.5 · resumo do dia com produtivo e bônus de IA', async () => {
  const d = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const r = (await as(V1, async () => (await q(`select * from day_summary($1,$2)`, [w5.id, d])).rows)).find(x => x.user_id === V2);
  // Figma 1 + referência 1 + Claude com 3 agentes 2 = 4
  if (r.produtivo_min !== 4 || r.ref_min !== 1 || r.ocioso_min !== 1 || r.bonus_ia_min !== 1 || r.ia_min !== 1) throw new Error(JSON.stringify(r));
});
await t('0.5 · glória usa o tempo produtivo do app', async () => {
  const r = (await as(V1, async () => (await q(`select * from glory_scores($1, current_date)`, [w5.id])).rows)).find(x => x.user_id === V2);
  if (r.tarefa_min !== 4 || r.ia_min !== 1) throw new Error(JSON.stringify(r));
});
await t('0.5 · apps do dia: só a própria pessoa ou admin', async () => {
  const d = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const mine = await as(V2, async () => (await q(`select * from day_apps($1,$2,$3)`, [w5.id, V2, d])).rows); if (!mine.length) throw new Error('vazio');
  await as(V1, () => q(`select * from day_apps($1,$2,$3)`, [w5.id, V2, d]));
  await as(V2, () => expectErr(() => q(`select * from day_apps($1,$2,$3)`, [w5.id, V1, d]), /próprios/));
});
await t('0.5.2 · indicadores ao vivo não criam minutos e não alteram outro membro', async () => {
  const count = (await q(`select count(*)::int n from activity_minutes`)).rows[0].n;
  const other = (await q(`select agents,music,agent_live_at from statuses where workspace_id=$1 and user_id=$2`, [w5.id,V1])).rows[0];
  await asAnon(() => q(`select agent_live($1,$2::jsonb)`, [tok,JSON.stringify({app:'Codex',cat:'prod',agents:3,music:true,idle:false})]));
  const current = (await q(`select agents,music,agent_live_at from statuses where workspace_id=$1 and user_id=$2`, [w5.id,V2])).rows[0];
  if (current.agents !== 3 || !current.music || !current.agent_live_at) throw new Error('sinal não atualizado');
  if ((await q(`select count(*)::int n from activity_minutes`)).rows[0].n !== count) throw new Error('criou minuto indevido');
  const after = (await q(`select agents,music,agent_live_at from statuses where workspace_id=$1 and user_id=$2`, [w5.id,V1])).rows[0];
  if (JSON.stringify(after) !== JSON.stringify(other)) throw new Error('alterou outro membro');
});
await t('0.5.2 · terminar execução e pausar música zeram indicadores imediatamente', async () => {
  await asAnon(() => q(`select agent_live($1,$2::jsonb)`, [tok,JSON.stringify({app:'Codex',cat:'prod',agents:0,music:false,idle:false})]));
  const current = (await q(`select agents,music from statuses where workspace_id=$1 and user_id=$2`, [w5.id,V2])).rows[0];
  if (current.agents !== 0 || current.music) throw new Error('manteve sinal do minuto anterior');
  await asAnon(() => expectErr(() => q(`select agent_live('errado','{}')`), /não autorizado/));
});
await t('0.5.2 · execução de cinco segundos não aplica bônus ao minuto inteiro', async () => {
  const minute=new Date(Date.now()-10*60000).toISOString();
  await asAnon(() => q(`select agent_report($1,$2::jsonb)`,[tok,JSON.stringify([{m:minute,app:'Figma',cat:'prod',agents:3,music:false,productive_weight:13/12,base_weight:1,ia_fraction:1/12}])]));
  const row=(await q(`select productive_weight::float8 p,base_weight::float8 b,ia_fraction::float8 i from activity_minutes where workspace_id=$1 and user_id=$2 and minute=date_trunc('minute',$3::timestamptz)`,[w5.id,V2,minute])).rows[0];
  if (Math.abs(row.p-13/12)>0.00001 || row.b!==1 || Math.abs(row.i-1/12)>0.00001) throw new Error(JSON.stringify(row));
  const live=(await q(`select agents,music from statuses where workspace_id=$1 and user_id=$2`,[w5.id,V2])).rows[0];
  if (live.agents!==0 || live.music) throw new Error('histórico ressuscitou indicador ao vivo');
  const day=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  const summary=(await as(V1,async()=>(await q(`select * from day_summary($1,$2)`,[w5.id,day])).rows)).find(x=>x.user_id===V2);
  if (summary.produtivo_min!==5 || summary.bonus_ia_min!==1 || summary.ia_min!==1) throw new Error('bônus parcial arredondado como minuto inteiro: '+JSON.stringify(summary));
  const glory=(await as(V1,async()=>(await q(`select * from glory_scores($1,current_date)`,[w5.id])).rows)).find(x=>x.user_id===V2);
  if (glory.tarefa_min!==5 || glory.ia_min!==1) throw new Error('ranking ignorou frações: '+JSON.stringify(glory));
});
await t('0.5 · depois de encerrar o expediente o app para de gravar', async () => {
  await as(V2, () => q(`select set_state($1,'encerrado',current_date)`, [w5.id]));
  const r = await asAnon(async () => (await q(`select agent_report($1, $2::jsonb) r`, [tok, JSON.stringify([{ m: new Date().toISOString(), app: 'Figma', cat: 'prod' }])])).rows[0].r);
  if (r.estado !== 'encerrado' || r.gravados !== 0) throw new Error(JSON.stringify(r));
});
await t('0.5.2 · expediente encerrado mantém IA e música desligadas', async () => {
  await asAnon(() => q(`select agent_live($1,$2::jsonb)`, [tok,JSON.stringify({app:'Codex',cat:'prod',agents:3,music:true})]));
  const current = (await q(`select agents,music from statuses where workspace_id=$1 and user_id=$2`, [w5.id,V2])).rows[0];
  if (current.agents !== 0 || current.music) throw new Error('sinal ligado após encerrar');
});
await t('0.5 · código revogado para de funcionar', async () => {
  const id = (await q(`select id from agent_tokens where user_id=$1`, [V2])).rows[0].id;
  await as(V2, () => q(`select revoke_agent_token($1)`, [id]));
  await asAnon(() => expectErr(() => q(`select agent_config($1)`, [tok]), /não autorizado/));
  await asAnon(() => expectErr(() => q(`select agent_live($1,'{}')`, [tok]), /não autorizado/));
});
console.log(`\n${ok} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
