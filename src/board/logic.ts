// Regras do quadro calculadas no navegador: tempo médio, capacidade do dia, datas.
import type { BoardSnapshot, CatalogItem, Etapa, Member, Task, WorkspaceSettings } from '../lib/types';

export const ETAPAS: [Etapa, string][] = [['roteiro', 'Roteiro'], ['captacao', 'Gravação / captação'], ['edicao', 'Edição'], ['finalizacao', 'Finalização']];
export const etapaName = (e: string | null) => ETAPAS.find(x => x[0] === e)?.[1] || '';
export const etapaIdx = (e: string | null) => ETAPAS.findIndex(x => x[0] === e);

// ---------------------------------------------------------------- datas
export const todayISO = () => new Date().toLocaleDateString('sv-SE');
export const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
export const dow = (iso: string) => new Date(iso + 'T12:00:00').getDay();
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const fmtDay = (iso: string) => {
  const t = todayISO();
  if (iso === t) return 'hoje';
  if (iso === addDays(t, 1)) return `amanhã (${WD[dow(iso)]})`;
  if (iso === addDays(t, -1)) return 'ontem';
  return `${WD[dow(iso)]}, ${iso.slice(8)}/${iso.slice(5, 7)}`;
};
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
export const fmtDue = (t: Task) => `${fmtDay(t.due_date)}${t.due_time ? ' às ' + hhmm(t.due_time) : ' · ao longo do dia'}`;
export const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const minToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const fmtD = (min: number) => { const m = Math.max(0, Math.round(min)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`; };

export const isOpen = (t: Task) => t.col === 'afazer' || t.col === 'fazendo';
export const overdue = (t: Task, now = Date.now()) => {
  if (!isOpen(t)) return false;
  const today = todayISO();
  if (t.due_date < today) return true;
  if (t.due_date === today && t.due_time) { const d = new Date(now); return toMin(hhmm(t.due_time)) < d.getHours() * 60 + d.getMinutes(); }
  return false;
};
export const spentMin = (t: Task, now = Date.now()) => (t.spent_sec + (t.running_since ? Math.max(0, (now - new Date(t.running_since).getTime()) / 1000) : 0)) / 60;
export const phaseSpentMin = (t: Task, now = Date.now()) => (t.phase_spent_sec + (t.running_since ? Math.max(0, (now - new Date(t.running_since).getTime()) / 1000) : 0)) / 60;

// ---------------------------------------------------------------- catálogo
export interface Cat { areas: CatalogItem[]; tipos: CatalogItem[]; linhas: CatalogItem[]; funcoes: CatalogItem[]; byId: Map<string, CatalogItem> }
export const catOf = (catalog: CatalogItem[]): Cat => ({
  areas: catalog.filter(c => c.kind === 'area'), tipos: catalog.filter(c => c.kind === 'tipo'),
  linhas: catalog.filter(c => c.kind === 'linha'), funcoes: catalog.filter(c => c.kind === 'funcao'),
  byId: new Map(catalog.map(c => [c.id, c]))
});
export const hasPhases = (cat: Cat, areaId: string | null) => !!(areaId && cat.byId.get(areaId)?.meta.fases);
export const teamLabel = (cat: Cat, areaId: string | null) => {
  const a = areaId ? cat.byId.get(areaId) : undefined;
  if (!a) return 'Equipe toda';
  if (a.meta.fases) return 'Equipe Audiovisual';
  return a.meta.funcoes?.length ? `Equipe de ${a.name}` : 'Equipe toda';
};
export const areaMembers = (cat: Cat, areaId: string | null, team: Member[]) => {
  const f = (areaId && cat.byId.get(areaId)?.meta.funcoes) || [];
  return f.length ? team.filter(m => [m.main_role, ...m.adj_roles].some(r => r && f.includes(r))) : team;
};

// ---------------------------------------------------------------- tempo médio
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export function estimate(board: BoardSnapshot, cat: Cat, areaId: string | null, typeId: string | null, etapa: string | null, userId?: string | null) {
  const same = board.durations.filter(d => d.area_id === areaId && (d.type_id || null) === (typeId || null) && (d.etapa || null) === (etapa || null));
  const mine = userId ? avg(same.filter(d => d.user_id === userId).map(d => d.minutes)) : null;
  if (mine) return { min: Math.round(mine), src: 'sua média' };
  const team = avg(same.map(d => d.minutes));
  if (team) return { min: Math.round(team), src: 'média da equipe' };
  const typeEst = typeId ? cat.byId.get(typeId)?.meta.est : null;
  const areaEst = areaId ? cat.byId.get(areaId)?.meta.est : null;
  const base = typeEst || areaEst || 60;
  const phaseShare: Record<string, number> = { roteiro: 0.25, captacao: 0.5, edicao: 0.9, finalizacao: 0.2 };
  return { min: Math.round(etapa ? Math.max(15, base * (phaseShare[etapa] ?? 1)) : base), src: 'estimativa padrão' };
}
export const teamAvg = (board: BoardSnapshot, cat: Cat, t: Task) => estimate(board, cat, t.area_id, t.type_id, t.etapa).min;
export const remaining = (board: BoardSnapshot, cat: Cat, t: Task, now = Date.now()) =>
  Math.max(15, estimate(board, cat, t.area_id, t.type_id, t.etapa, t.owner || t.dir_to).min - phaseSpentMin(t, now));

// ---------------------------------------------------------------- capacidade
export const jornada = (m: Member) => (m.schedule ? Math.max(0, toMin(m.schedule.s1) - toMin(m.schedule.e1)) + Math.max(0, toMin(m.schedule.s2) - toMin(m.schedule.e2)) : 480);
export function capOf(m: Member, day: string, settings: WorkspaceSettings) {
  const d = dow(day);
  if (d === 0) return 0;
  if (d === 6) return settings.recursos?.sabadao ? 240 : 0;
  return jornada(m);
}
export function loadOf(board: BoardSnapshot, cat: Cat, userId: string, day: string) {
  return board.tasks.filter(t => isOpen(t) && t.due_date === day && (t.owner === userId || (!t.owner && t.dir_to === userId)))
    .reduce((s, t) => s + remaining(board, cat, t), 0);
}
/** Para quem e quanto cabe no dia. dirTo = pessoa; senão a equipe da área. */
export function capCheck(board: BoardSnapshot, cat: Cat, team: Member[], settings: WorkspaceSettings, areaId: string | null, dirTo: string | null, day: string, est: number) {
  const who = dirTo ? team.filter(m => m.user_id === dirTo) : areaMembers(cat, areaId, team);
  const cap = who.reduce((s, m) => s + capOf(m, day, settings), 0);
  let load = who.reduce((s, m) => s + loadOf(board, cat, m.user_id, day), 0);
  if (!dirTo) load += board.tasks.filter(t => isOpen(t) && t.due_date === day && !t.owner && !t.dir_to && t.area_id === areaId).reduce((s, t) => s + remaining(board, cat, t), 0);
  return { cap, load, free: cap - load, fits: cap > 0 && load + est <= cap, closed: cap === 0 };
}
export function nextFree(board: BoardSnapshot, cat: Cat, team: Member[], settings: WorkspaceSettings, areaId: string | null, dirTo: string | null, from: string, est: number) {
  let d = from;
  for (let i = 0; i < 60; i++) { d = addDays(d, 1); if (capCheck(board, cat, team, settings, areaId, dirTo, d, est).fits) return d; }
  return null;
}
export function slotsFor(team: Member[], dirTo: string | null, areaMembersList: Member[]) {
  const who = dirTo ? team.filter(m => m.user_id === dirTo) : areaMembersList;
  const set = new Set<number>();
  for (const m of who) {
    const s = m.schedule || { e1: '08:00', s1: '12:00', e2: '13:00', s2: '18:00' };
    for (const [a, b] of [[s.e1, s.s1], [s.e2, s.s2]]) for (let x = toMin(a) + 30; x <= toMin(b); x += 30) set.add(x);
  }
  return [...set].sort((a, b) => a - b);
}
