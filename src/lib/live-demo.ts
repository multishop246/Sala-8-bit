// Sala ao vivo no modo demonstração: mesmas regras do banco, guardadas no navegador,
// com os colegas de exemplo indo ao café, fazendo reuniões e chamando sua atenção.
import { DEMO_USER, load as loadDemoDb } from './data-demo';
import type { AttentionCall, Device, LiveSnapshot, Meeting, MeetingMember, MemberState, OnlineMap, Pause, Status } from './types';

const KEY = 'sala8bit.demo.live';
interface Live { statuses: Status[]; pauses: Pause[]; meetings: Meeting[]; meetingMembers: MeetingMember[]; calls: AttentionCall[]; calledYou?: boolean }
const now = () => new Date().toISOString();
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2));
const today = () => new Date().toLocaleDateString('sv-SE');
const fail = (m: string): never => { throw new Error(m); };
const ME = () => DEMO_USER.id;
const emit = () => window.dispatchEvent(new Event('sala8bit-live'));

function read(): Live {
  let l: Live | null = null;
  try { const v = localStorage.getItem(KEY); if (v) l = JSON.parse(v); } catch { /* */ }
  if (!l) l = { statuses: [], pauses: [], meetings: [], meetingMembers: [], calls: [] };
  // garante uma linha de status para cada membro de cada empresa da demonstração
  const db = loadDemoDb();
  for (const m of db.members) {
    if (l.statuses.some(s => s.workspace_id === m.workspace_id && s.user_id === m.user_id)) continue;
    const bot = m.user_id.startsWith('demo-p');
    const i = bot ? +m.user_id.slice(6) : -1;
    const st: MemberState = !bot ? 'fora' : i === 3 ? 'cafe' : i === 4 ? 'almoco' : 'trabalhando';
    l.statuses.push({ workspace_id: m.workspace_id, user_id: m.user_id, state: st, since: ago(st === 'cafe' ? 6 : st === 'almoco' ? 25 : 40 + i * 7), meeting_id: null, device: i === 2 ? 'celular' : 'computador', updated_at: now() });
    if (st === 'cafe' || st === 'almoco') l.pauses.push({ id: uid(), workspace_id: m.workspace_id, user_id: m.user_id, kind: st, day: today(), started_at: ago(st === 'cafe' ? 6 : 25), ended_at: null });
  }
  l.statuses = l.statuses.filter(s => db.members.some(m => m.workspace_id === s.workspace_id && m.user_id === s.user_id));
  return l;
}
function write(l: Live) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* */ } emit(); }
const memberOf = (ws: string, u: string) => loadDemoDb().members.find(m => m.workspace_id === ws && m.user_id === u);
const stOf = (l: Live, ws: string, u: string) => l.statuses.find(s => s.workspace_id === ws && s.user_id === u)!;

function leaveCurrent(l: Live, ws: string, u: string) {
  l.pauses.filter(p => p.workspace_id === ws && p.user_id === u && !p.ended_at).forEach(p => { p.ended_at = now(); });
  const st = stOf(l, ws, u);
  if (!st.meeting_id) return;
  const mt = l.meetings.find(m => m.id === st.meeting_id)!;
  l.meetingMembers.filter(x => x.meeting_id === mt.id && x.user_id === u && !x.left_at).forEach(x => { x.left_at = now(); });
  st.meeting_id = null;
  if (mt.created_by === u || !l.meetingMembers.some(x => x.meeting_id === mt.id && !x.left_at)) {
    mt.ended_at = now();
    l.meetingMembers.filter(x => x.meeting_id === mt.id && !x.left_at).forEach(x => { x.left_at = now(); });
    l.statuses.filter(s => s.meeting_id === mt.id).forEach(s => Object.assign(s, { state: 'trabalhando', since: now(), meeting_id: null }));
  }
}

function doSetState(l: Live, ws: string, u: string, state: MemberState, day: string, device?: Device) {
  const m = memberOf(ws, u) || fail('Você não faz parte desta empresa.');
  if (state === 'reuniao') fail('Use "Sinalizar reunião" para entrar em reunião.');
  if (m.kind === 'gestor' && !['fora', 'trabalhando', 'encerrado'].includes(state)) fail('O gestor só acompanha: não usa a copa nem a pausa.');
  if (state === 'almoco' && l.pauses.some(p => p.workspace_id === ws && p.user_id === u && p.kind === 'almoco' && p.day === day)) fail('Você já fez a pausa do almoço hoje.');
  leaveCurrent(l, ws, u);
  if (state === 'cafe' || state === 'almoco') l.pauses.push({ id: uid(), workspace_id: ws, user_id: u, kind: state, day, started_at: now(), ended_at: null });
  Object.assign(stOf(l, ws, u), { state, since: now(), meeting_id: null, updated_at: now(), ...(device ? { device } : {}) });
}

function doStartMeeting(l: Live, ws: string, u: string, subject: string, members: string[], visitors: number, outsiders: number) {
  if (['fora', 'encerrado'].includes(stOf(l, ws, u).state)) fail('Entre no escritório antes de marcar uma reunião.');
  leaveCurrent(l, ws, u);
  const mt: Meeting = { id: uid(), workspace_id: ws, subject: subject.trim(), created_by: u, visitors, outsiders, started_at: now(), ended_at: null };
  l.meetings.push(mt);
  for (const x of [u, ...members]) {
    const s = stOf(l, ws, x);
    if (!s || (x !== u && (!['trabalhando', 'cafe', 'pausa_gestor'].includes(s.state) || s.meeting_id))) continue;
    if (x !== u) leaveCurrent(l, ws, x);
    l.meetingMembers.push({ meeting_id: mt.id, workspace_id: ws, user_id: x, joined_at: now(), left_at: null });
    Object.assign(s, { state: 'reuniao', since: now(), meeting_id: mt.id });
  }
  return mt;
}

export async function loadLive(wsId: string, day: string, userId: string): Promise<LiveSnapshot> {
  const l = read();
  const open = l.meetings.filter(m => m.workspace_id === wsId && !m.ended_at);
  return structuredClone({
    statuses: l.statuses.filter(s => s.workspace_id === wsId),
    pauses: l.pauses.filter(p => p.workspace_id === wsId && p.day === day),
    meetings: open,
    meetingMembers: l.meetingMembers.filter(x => open.some(m => m.id === x.meeting_id) && !x.left_at),
    calls: l.calls.filter(c => c.workspace_id === wsId && !c.seen_at && (c.from_user === userId || c.to_user === userId))
  });
}

const tx = (fn: (l: Live) => void) => new Promise<void>((res, rej) => setTimeout(() => {
  try { const l = read(); fn(l); write(l); res(); } catch (e) { rej(e); }
}, 80));

export const setState = (wsId: string, state: MemberState, day: string, device?: Device) => tx(l => doSetState(l, wsId, ME(), state, day, device));
export const startMeeting = (wsId: string, subject: string, members: string[], visitors: number, outsiders: number) => tx(l => { doStartMeeting(l, wsId, ME(), subject, members, visitors, outsiders); });
export const joinMeeting = (meetingId: string) => tx(l => {
  const mt = l.meetings.find(m => m.id === meetingId && !m.ended_at) || fail('Essa reunião já terminou.');
  if (['fora', 'encerrado'].includes(stOf(l, mt.workspace_id, ME()).state)) fail('Entre no escritório antes.');
  leaveCurrent(l, mt.workspace_id, ME());
  l.meetingMembers = l.meetingMembers.filter(x => !(x.meeting_id === mt.id && x.user_id === ME()));
  l.meetingMembers.push({ meeting_id: mt.id, workspace_id: mt.workspace_id, user_id: ME(), joined_at: now(), left_at: null });
  Object.assign(stOf(l, mt.workspace_id, ME()), { state: 'reuniao', since: now(), meeting_id: mt.id });
});
export const leaveMeeting = (wsId: string) => tx(l => {
  leaveCurrent(l, wsId, ME());
  const s = stOf(l, wsId, ME()); if (s.state === 'reuniao') Object.assign(s, { state: 'trabalhando', since: now() });
});
export const callAttention = (wsId: string, to: string) => tx(l => {
  if (to === ME()) fail('Não dá para chamar a própria atenção.');
  if (!l.calls.some(c => c.workspace_id === wsId && c.from_user === ME() && c.to_user === to && !c.seen_at))
    l.calls.push({ id: uid(), workspace_id: wsId, from_user: ME(), to_user: to, created_at: now(), seen_at: null });
  // o colega da demonstração "responde" depois de alguns segundos
  setTimeout(() => { const l2 = read(); l2.calls.filter(c => c.from_user === ME() && c.to_user === to && !c.seen_at).forEach(c => { c.seen_at = now(); }); write(l2); }, 9000);
});
export const ackAttention = (wsId: string, from: string) => tx(l => {
  l.calls.filter(c => c.workspace_id === wsId && c.to_user === ME() && c.from_user === from && !c.seen_at).forEach(c => { c.seen_at = now(); });
});

// ------------------------------------------------------------- colegas simulados
const SUBJECTS = ['Alinhamento da campanha', 'Revisão de criativos', 'Pauta da semana', 'Status dos lançamentos', 'Planejamento de conteúdo'];
function botTick(wsId: string) {
  const l = read(), day = today();
  const bots = l.statuses.filter(s => s.workspace_id === wsId && s.user_id.startsWith('demo-p'));
  const mins = (s: Status) => (Date.now() - new Date(s.since).getTime()) / 60000;
  const kindOf = (u: string) => memberOf(wsId, u)?.kind;
  let changed = false;
  const act = (fn: () => void) => { try { fn(); changed = true; } catch { /* regra impediu: ignora */ } };
  for (const s of bots) {
    const r = Math.random();
    if (s.state === 'cafe' && mins(s) > 2 + r * 3) act(() => doSetState(l, wsId, s.user_id, 'trabalhando', day));
    else if (s.state === 'almoco' && mins(s) > 4) act(() => doSetState(l, wsId, s.user_id, 'trabalhando', day));
    else if (s.state === 'pausa_gestor' && mins(s) > 1.5) act(() => doSetState(l, wsId, s.user_id, 'trabalhando', day));
    else if (s.state === 'reuniao' && s.meeting_id && l.meetings.find(m => m.id === s.meeting_id)?.created_by === s.user_id && mins(s) > 2.5) act(() => leaveCurrent(l, wsId, s.user_id));
    else if (s.state === 'trabalhando' && kindOf(s.user_id) === 'membro') {
      if (r < 0.04) act(() => doSetState(l, wsId, s.user_id, 'cafe', day));
      else if (r < 0.055) act(() => doSetState(l, wsId, s.user_id, 'pausa_gestor', day));
      else if (r < 0.07 && !l.meetings.some(m => m.workspace_id === wsId && !m.ended_at)) {
        const others = bots.filter(b => b.user_id !== s.user_id && b.state === 'trabalhando').slice(0, 1 + Math.floor(Math.random() * 2)).map(b => b.user_id);
        act(() => doStartMeeting(l, wsId, s.user_id, SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)], others, Math.random() < 0.4 ? 1 : 0, 0));
      }
    }
  }
  // um colega chama sua atenção uma vez, para você ver como funciona
  const mine = l.statuses.find(s => s.workspace_id === wsId && s.user_id === ME());
  if (!l.calledYou && mine && mine.state === 'trabalhando' && mins(mine) > 0.4) {
    const from = bots.find(b => b.state === 'trabalhando' && kindOf(b.user_id) === 'membro');
    if (from) { l.calls.push({ id: uid(), workspace_id: wsId, from_user: from.user_id, to_user: ME(), created_at: now(), seen_at: null }); l.calledYou = true; changed = true; }
  }
  if (changed) write(l);
}

export function subscribeLive(wsId: string, me: { userId: string; device: Device }, onChange: () => void, onOnline: (m: OnlineMap) => void) {
  const online = (): OnlineMap => {
    const map: OnlineMap = { [me.userId]: { device: me.device } };
    read().statuses.filter(s => s.workspace_id === wsId && s.user_id.startsWith('demo-p')).forEach(s => { map[s.user_id] = { device: s.device }; });
    return map;
  };
  const f = () => { onChange(); onOnline(online()); };
  window.addEventListener('sala8bit-live', f);
  const t = window.setInterval(() => botTick(wsId), 5000);
  setTimeout(f, 0);
  return () => { window.removeEventListener('sala8bit-live', f); window.clearInterval(t); };
}
