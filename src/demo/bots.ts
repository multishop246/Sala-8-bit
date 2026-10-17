// Colegas simulados da demonstração. Eles usam as mesmas funções do banco que uma pessoa usaria.
import { BOT, DEMO_USER, asAdmin, emit, rpc } from './pg';
import { PEOPLE } from './seed';

const ME = DEMO_USER.id;
const today = () => new Date().toLocaleDateString('sv-SE');
const chance = (p: number) => Math.random() < p;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const mins = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;
const ONCE = 'sala8bit.demo.once';
const once = (k: string) => { try { const s = JSON.parse(localStorage.getItem(ONCE) || '{}'); if (s[k]) return false; s[k] = 1; localStorage.setItem(ONCE, JSON.stringify(s)); return true; } catch { return false; } };
const botIdx = (id: string) => [...Array(PEOPLE.length).keys()].find(i => BOT(i) === id) ?? -1;

const SUBJECTS = ['Alinhamento da campanha', 'Revisão de criativos', 'Pauta da semana', 'Status dos lançamentos', 'Planejamento de conteúdo'];
const REPLIES = ['Beleza, vejo isso agora.', 'Pode deixar, te mando até o fim do dia.', 'Recebi, obrigado! Já ajusto.', 'Combinado. Se travar te chamo.', 'Fechado, vou priorizar.'];
const REFUSALS = ['Estou fechando outra entrega até as 17h; consigo amanhã.', 'Estou no meio de uma gravação agora.', 'Minha fila de hoje já está cheia.'];

let busy = false;
export async function botTick(wsId: string) {
  if (busy) return; busy = true;
  try { await tick(wsId); } finally { busy = false; }
}

async function tick(wsId: string) {
  const bots = PEOPLE.map((p, i) => ({ ...p, id: BOT(i) }));
  const st = await asAdmin<{ user_id: string; state: string; since: string; meeting_id: string | null; active_task_id: string | null }>(`select * from statuses where workspace_id = $1`, [wsId]);
  if (!st.some(s => s.user_id === ME)) return; // você ainda não entrou nesta equipe
  const tasks = await asAdmin<{ id: string; col: string; owner: string | null; area_id: string; running_since: string | null; started_at: string | null; updated_at: string; title: string; dir_to: string | null }>(`select * from tasks where workspace_id = $1`, [wsId]);
  const areas = await asAdmin<{ id: string; meta: { funcoes?: string[] } }>(`select id, meta from catalog_items where workspace_id = $1 and kind = 'area'`, [wsId]);
  const openContests = await asAdmin<{ id: string }>(`select id from task_contests where workspace_id = $1 and status = 'aberta'`, [wsId]);
  const votes = await asAdmin<{ contest_id: string; user_id: string }>(`select contest_id, user_id from contest_votes where workspace_id = $1`, [wsId]);
  const sOf = (id: string) => st.find(s => s.user_id === id);
  const day = today();
  const act = async (uid: string, fn: string, args: Record<string, unknown>) => { try { await rpc(uid, fn, args); return true; } catch { return false; } };

  for (const b of bots) {
    const s = sOf(b.id); if (!s) continue;
    const r = Math.random();
    if (s.state === 'cafe' && mins(s.since) > 2 + r * 3) await act(b.id, 'set_state', { p_ws: wsId, p_state: 'trabalhando', p_day: day });
    else if (s.state === 'almoco' && mins(s.since) > 4) await act(b.id, 'set_state', { p_ws: wsId, p_state: 'trabalhando', p_day: day });
    else if (s.state === 'pausa_gestor' && mins(s.since) > 1.5) await act(b.id, 'set_state', { p_ws: wsId, p_state: 'trabalhando', p_day: day });
    else if (s.state === 'reuniao' && mins(s.since) > 2.5 && chance(0.5)) await act(b.id, 'leave_meeting', { p_ws: wsId });
    else if (s.state === 'trabalhando' && !b.gestor) {
      const mine = tasks.filter(t => t.owner === b.id && t.col === 'fazendo');
      const roles = [b.main, ...b.adj];
      if (r < 0.03) await act(b.id, 'set_state', { p_ws: wsId, p_state: 'cafe', p_day: day });
      else if (r < 0.04) await act(b.id, 'set_state', { p_ws: wsId, p_state: 'pausa_gestor', p_day: day });
      else if (r < 0.05 && !st.some(x => x.state === 'reuniao')) {
        const others = bots.filter(o => o.id !== b.id && sOf(o.id)?.state === 'trabalhando').slice(0, 1 + Math.floor(Math.random() * 2)).map(o => o.id);
        await act(b.id, 'start_meeting', { p_ws: wsId, p_subject: pick(SUBJECTS), p_members: others, p_visitors: chance(0.4) ? 1 : 0, p_outsiders: 0 });
      } else if (mine.length && chance(0.06) && mins(mine[0].updated_at) > 3) await act(b.id, 'complete_task', { p_task: mine[0].id });
      else if (!mine.length && chance(0.15)) {
        const fits = tasks.filter(t => t.col === 'afazer' && (!t.dir_to || t.dir_to === b.id) && (() => { const f = areas.find(a => a.id === t.area_id)?.meta.funcoes || []; return !f.length || f.some(x => roles.includes(x)); })());
        if (fits.length) await act(b.id, 'start_task', { p_task: pick(fits).id });
      }
    }
  }
  // o Instagram ganha seguidores aos poucos
  if (chance(0.6)) await asAdmin(`update instagram_stats set followers = followers + $2, updated_at = now() where workspace_id = $1`, [wsId, 1 + Math.floor(Math.random() * 3)]), emit();
  // votações abertas
  for (const c of openContests) for (const b of bots) {
    if (b.gestor || votes.some(v => v.contest_id === c.id && v.user_id === b.id) || !chance(0.2)) continue;
    await act(b.id, 'vote_contest', { p_contest: c.id, p_vote: chance(0.7) });
  }
  // pedidos de transferência e de ajuda para os colegas simulados
  const trs = await asAdmin<{ id: string; to_user: string; created_at: string }>(`select id, to_user, created_at from task_transfers where workspace_id = $1 and status = 'pendente'`, [wsId]);
  for (const x of trs) if (botIdx(x.to_user) >= 0 && mins(x.created_at) > 0.15) { const ok = chance(0.7); await act(x.to_user, 'answer_transfer', { p_transfer: x.id, p_ok: ok, p_just: ok ? null : pick(REFUSALS) }); }
  const hs = await asAdmin<{ id: string; to_user: string; created_at: string }>(`select id, to_user, created_at from task_help where workspace_id = $1 and status = 'pendente'`, [wsId]);
  for (const x of hs) if (botIdx(x.to_user) >= 0 && mins(x.created_at) > 0.15) { const ok = chance(0.75); await act(x.to_user, 'answer_help', { p_help: x.id, p_ok: ok, p_just: ok ? null : pick(REFUSALS) }); }
  // respostas no chat
  const msgs = await asAdmin<{ from_user: string; to_user: string; task_id: string; created_at: string; read_at: string | null }>(`select from_user, to_user, task_id, created_at, read_at from messages where workspace_id = $1 order by created_at`, [wsId]);
  for (const b of bots) {
    const last = msgs.filter(m => (m.from_user === ME && m.to_user === b.id) || (m.from_user === b.id && m.to_user === ME)).pop();
    if (last && last.from_user === ME && mins(last.created_at) > 0.07) {
      await act(b.id, 'mark_read', { p_ws: wsId, p_from: ME });
      await act(b.id, 'send_message', { p_ws: wsId, p_to: ME, p_task: last.task_id, p_text: pick(REPLIES) });
    }
  }
  // para você ver como funciona: um colega manda mensagem, chama sua atenção e pede ajuda
  const meSt = sOf(ME);
  if (meSt && meSt.state === 'trabalhando' && mins(meSt.since) > 0.3) {
    const t = tasks.find(x => x.owner === BOT(0) && x.col === 'fazendo') || tasks.find(x => x.col !== 'feito');
    if (t && once('msg')) await act(BOT(0), 'send_message', { p_ws: wsId, p_to: ME, p_task: t.id, p_text: `Oi! Boas-vindas à equipe 👋 Quando puder, dá uma olhada em "${t.title}"?` });
    else if (once('att')) await act(BOT(1), 'call_attention', { p_ws: wsId, p_to: ME });
    else if (mins(meSt.since) > 1) {
      const t2 = tasks.find(x => x.owner === BOT(2) && x.col === 'fazendo');
      if (t2 && once('help')) await act(BOT(2), 'request_help', { p_task: t2.id, p_tos: [ME], p_note: 'Consegue revisar os textos dos anúncios comigo?' });
    }
  }
}
