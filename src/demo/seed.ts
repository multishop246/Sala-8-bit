// Monta a "Agência Demonstração": equipe, linhas, tarefas em andamento, histórico de tempos.
// Tudo passa pelas mesmas funções do banco que o sistema real usa.
import type { Avatar } from '../lib/types';
import { BOT, DEMO_INVITE, DEMO_USER, asAdmin, rpc } from './pg';

const A = (sex: 'f' | 'm', skin: string, hair: string, hs: string, out: string, oc: string, beard = 'nenhuma', acc = 'nenhum'): Avatar => ({ sex, skin, hair, hs, beard, acc, out, oc });
export const PEOPLE: { name: string; av: Avatar; main: string; adj: string[]; gestor?: boolean }[] = [
  { name: 'Marina', av: A('f', '#eec1a0', '#141010', 'franja', 'cardiga', '#e76f8a'), main: 'Social Media', adj: ['Copywriter'] },
  { name: 'Rafael', av: A('m', '#8d5a3b', '#141010', 'cacheado', 'camiseta', '#3fb6a8', 'curta'), main: 'Designer', adj: ['Editor de Vídeo'] },
  { name: 'Júlia', av: A('f', '#f6d3b8', '#d9a441', 'rabo', 'blazer', '#e2a33b'), main: 'Tráfego Pago', adj: ['Analista de SEO'] },
  { name: 'Diego', av: A('m', '#c68b62', '#3b2418', 'curto', 'moletom', '#3d4a7a', 'cavanhaque', 'relogio'), main: 'Editor de Vídeo', adj: [] },
  { name: 'Larissa', av: A('f', '#e0ac85', '#7a3b22', 'longo', 'jaqueta', '#b84a4a'), main: 'Copywriter', adj: ['Social Media'] },
  { name: 'Bruno', av: A('m', '#e0ac85', '#5a3a26', 'curto', 'social', '#4f7a52', 'bigode'), main: 'Gestor de Projetos', adj: ['Atendimento'] },
  { name: 'Helena', av: A('f', '#a8704a', '#141010', 'coque', 'terno', '#1d2b55'), main: '', adj: [], gestor: true }
];

const day = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('sv-SE');
};

export async function seed() {
  const ids = PEOPLE.map((_, i) => BOT(i));
  await asAdmin(`insert into auth.users(id) select unnest($1::uuid[]) on conflict do nothing`, [[...ids, DEMO_USER.id]]);
  const ws = (await rpc<{ id: string }>(ids[0], 'create_workspace', { p_name: 'Agência Demonstração', p_slug: 'demo', p_desks: 8 }))[0];
  const inv = (await rpc<{ id: string; token: string }>(ids[0], 'create_invite', { p_ws: ws.id, p_kind: 'membro', p_days: 60, p_max: 200 }))[0];
  const invG = (await rpc<{ token: string }>(ids[0], 'create_invite', { p_ws: ws.id, p_kind: 'gestor', p_days: 60, p_max: 5 }))[0];
  await asAdmin(`update invites set token = $1 where id = $2`, [DEMO_INVITE, inv.id]);
  const sched = JSON.stringify({ e1: '08:00', s1: '12:00', e2: '13:00', s2: '18:00' });
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    if (i > 0) await rpc(ids[i], 'accept_invite', { p_token: p.gestor ? invG.token : DEMO_INVITE });
    await asAdmin(`select set_config('sala.bypass','on',false)`);
    await asAdmin(`update members set display_name=$3, avatar=$4::jsonb, main_role=$5, adj_roles=$6, schedule=$7::jsonb, consent_at=now(), joined_at=now() - ($8 || ' days')::interval
                   where workspace_id=$1 and user_id=$2`, [ws.id, ids[i], p.name, JSON.stringify(p.av), p.main || null, p.adj, p.gestor ? null : sched, 30 - i]);
    await asAdmin(`select set_config('sala.bypass','off',false)`);
    if (!p.gestor) await rpc(ids[i], 'claim_desk', { p_ws: ws.id, p_desk: i + 1 });
  }
  // o convite de demonstração não conta os usos dos colegas de exemplo
  await asAdmin(`update invites set uses = 0 where id = $1`, [inv.id]);

  const cat = await asAdmin<{ id: string; kind: string; name: string; parent_id: string | null }>(`select id, kind, name, parent_id from catalog_items where workspace_id=$1`, [ws.id]);
  for (const [n, i] of [['Aromasil', 0], ['Fidalgos', 1], ['Radicar', 2], ['Senhora Casa', 3]] as const)
    await asAdmin(`insert into catalog_items(workspace_id, kind, name, sort) values ($1,'linha',$2,$3)`, [ws.id, n, i]);
  const lines = await asAdmin<{ id: string; name: string }>(`select id, name from catalog_items where workspace_id=$1 and kind='linha'`, [ws.id]);
  const L = (n: string) => lines.find(x => x.name === n)!.id;
  const area = (n: string) => cat.find(x => x.kind === 'area' && x.name === n)!.id;
  const tipo = (a: string, n: string) => cat.find(x => x.kind === 'tipo' && x.parent_id === area(a) && x.name === n)!.id;

  // todos chegam ao escritório
  for (let i = 0; i < PEOPLE.length; i++) await rpc(ids[i], 'set_state', { p_ws: ws.id, p_state: 'trabalhando', p_day: day(0), p_device: i === 2 ? 'celular' : 'computador' });

  // histórico de tempos (para as médias por tipo de atividade)
  const hist: [number, string, string | null, string | null, number[]][] = [
    [1, 'Design', 'Post estático', null, [45, 55, 50]], [1, 'Design', 'Carrossel', null, [80, 70]], [4, 'Design', 'Stories', null, [35, 40]],
    [0, 'Social Media', 'Calendário editorial', null, [110, 130]], [0, 'Social Media', 'Legenda e hashtags', null, [20, 25, 18]],
    [2, 'Tráfego Pago', 'Relatório de desempenho', null, [55, 65]], [2, 'Tráfego Pago', 'Otimização de campanha', null, [85]],
    [3, 'Vídeo', 'Institucional', 'roteiro', [60, 50]], [3, 'Vídeo', 'Institucional', 'edicao', [190, 210]], [1, 'Vídeo', 'Institucional', 'captacao', [120]],
    [3, 'Vídeo', 'Reels / TikTok de tendência', 'edicao', [70, 80]]
  ];
  for (const [who, a, t, et, mins] of hist) for (const m of mins)
    await asAdmin(`insert into task_durations(workspace_id, user_id, area_id, type_id, etapa, minutes, done_at) values ($1,$2,$3,$4,$5,$6, now() - interval '3 days')`,
      [ws.id, ids[who], area(a), t ? tipo(a, t) : null, et, m]);

  const mk = async (who: number, title: string, line: string, a: string, t: string | null, desc: string, due: number, time: string | null = null, dir: number | null = null) =>
    (await rpc<{ id: string }>(ids[who], 'create_task', { p_ws: ws.id, p_title: title, p_desc: desc, p_line: L(line), p_area: area(a), p_type: t ? tipo(a, t) : null, p_dir_to: dir === null ? null : ids[dir], p_due_date: day(due), p_due_time: time, p_est: 60 }))[0].id;

  const t1 = await mk(5, 'Calendário de posts – novembro', 'Aromasil', 'Social Media', 'Calendário editorial', 'Datas comemorativas e lançamentos do mês.', 0, '17:30');
  const t2 = await mk(5, 'Key visual Black Friday', 'Fidalgos', 'Design', 'Criativo para Meta Ads', 'Três variações para teste A/B.', 1);
  const t3 = await mk(0, 'Relatório semanal Google Ads', 'Radicar', 'Tráfego Pago', 'Relatório de desempenho', 'Comparar com a semana anterior.', 0, '17:00');
  const t4 = await mk(5, 'Vídeo institucional da fábrica', 'Aromasil', 'Vídeo', 'Institucional', 'Mostrar a linha de produção e a equipe.', 3);
  const t5 = await mk(1, 'Carrossel dicas de limpeza', 'Senhora Casa', 'Design', 'Carrossel', '5 cards com dicas de uso.', 1, null, 1);
  await mk(4, 'Legendas da semana', 'Aromasil', 'Social Media', 'Legenda e hashtags', 'Posts de segunda a sexta.', 2);
  await mk(5, 'Reels de lançamento', 'Fidalgos', 'Vídeo', 'Reels / TikTok de tendência', 'Usar a trend do momento com o produto novo.', 4);
  await mk(2, 'Prompts para respostas de DM', 'Radicar', 'IA', null, 'Montar prompts para o atendimento responder mais rápido.', 2);
  const t9 = await mk(0, 'Stories de bastidores', 'Aromasil', 'Design', 'Stories', 'Sequência de 4 stories.', 0);

  await rpc(ids[0], 'start_task', { p_task: t1 });
  await rpc(ids[1], 'start_task', { p_task: t2 });
  await rpc(ids[2], 'start_task', { p_task: t3 });
  await rpc(ids[3], 'start_task', { p_task: t4 });
  await rpc(ids[3], 'complete_task', { p_task: t4 }); // roteiro pronto → volta para A fazer na captação, vinculada ao Diego
  await rpc(ids[4], 'start_task', { p_task: t9 });
  await rpc(ids[4], 'complete_task', { p_task: t9 });
  await asAdmin(`update tasks set spent_sec = spent_sec + 3600*$2, running_since = now() - interval '35 minutes' where id = $1 and running_since is not null`, [t1, 1]);
  await asAdmin(`update tasks set running_since = now() - interval '50 minutes' where id = any($1::uuid[]) and running_since is not null`, [[t2, t3]]);
  await rpc(ids[1], 'contest_task', { p_task: t5, p_text: 'Fazer em vídeo curto em vez de carrossel: o último vídeo teve o dobro de alcance.' });

  // pausas em andamento
  await rpc(ids[3], 'set_state', { p_ws: ws.id, p_state: 'cafe', p_day: day(0) });
  await asAdmin(`update pauses set started_at = now() - interval '6 minutes' where user_id = $1 and ended_at is null`, [ids[3]]);
  await asAdmin(`update statuses set since = now() - interval '6 minutes' where user_id = $1`, [ids[3]]);
  await asAdmin(`update statuses set since = now() - (interval '20 minutes' * (1 + random()*4)) where workspace_id = $1 and state = 'trabalhando'`, [ws.id]);
}
