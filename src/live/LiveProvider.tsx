// Estado ao vivo da sala: status de todos, quem está online, pausas de hoje, reuniões e chamadas de atenção.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as live from '../lib/live';
import { useToast } from '../components/Toast';
import { useWs } from '../lib/workspace';
import * as desktop from '../lib/desktop';
import { assignTitles, monthStart, titleThemeOf, type GloryCat } from '../glory/glory';
import { THEME, themesNow } from '../game/themes';
import { useRoomPresence } from './useRoomPresence';
import type { Point, RoomPresence } from '../game/movement';
import type { Avatar, InstagramStats, SaturdayShift, AttentionCall, BoardSnapshot, Device, LiveSnapshot, Meeting, Member, MemberState, NewTask, OnlineMap, Status, Task } from '../lib/types';

const EMPTY_BOARD: BoardSnapshot = { tasks: [], events: [], contests: [], votes: [], transfers: [], help: [], durations: [], messages: [] };

export const todayStr = () => new Date().toLocaleDateString('sv-SE');
export const detectDevice = (): Device => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && innerWidth < 900 ? 'celular' : 'computador');
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export interface PersonView {
  member: Member;
  status: Status | null;
  online: boolean;
  device: Device;
  /** o que a sala mostra: quem fechou o site aparece "fora", exceto em pausa */
  shown: MemberState;
  since: number;
  cafeUsed: number;   // segundos de café hoje
  cafeLeft: number;   // segundos restantes (negativo = passou do limite)
  lunchDone: boolean;
  meeting: Meeting | null;
  /** dados do app de computador (quando a pessoa usa o app) */
  agentOn: boolean;
  app: string | null;
  appCat: string | null;
  music: boolean;
  agents: number;
  idle: boolean;
  scene?: RoomPresence;
  capturing: boolean;
}

interface LiveCtx {
  refresh: () => void;
  ready: boolean;
  now: number;
  moveCharacter: (target: Point) => void;
  views: PersonView[];
  view: (userId: string) => PersonView | undefined;
  meetings: (Meeting & { people: string[] })[];
  callsToMe: AttentionCall[];
  callsFromMe: AttentionCall[];
  gestorName: string | null;
  inLunchWindow: boolean;
  board: BoardSnapshot;
  saturdays: SaturdayShift[];
  instagram: InstagramStats | null;
  /** título do mês passado de cada pessoa (Mural da Glória) */
  titles: Record<string, GloryCat>;
  /** visual da pessoa com a roupa temática que vale agora */
  look: (m: Member) => Avatar;
  /** mensagens não lidas por remetente */
  unread: Record<string, number>;
  nameOf: (id: string | null) => string;
  act: {
    createTask: (t: NewTask) => Promise<Task | null>;
    setSaturday: (userId: string, day: string, works: boolean) => Promise<boolean>;
    setInstagram: (handle: string, followers: number) => Promise<boolean>;
    startTask: (id: string) => Promise<boolean>;
    setActiveTask: (id: string) => Promise<boolean>;
    completeTask: (id: string) => Promise<boolean>;
    returnTask: (id: string) => Promise<boolean>;
    deleteTask: (id: string) => Promise<boolean>;
    contestTask: (id: string, text: string) => Promise<boolean>;
    voteContest: (id: string, vote: boolean) => Promise<boolean>;
    requestTransfer: (id: string, to: string) => Promise<boolean>;
    answerTransfer: (id: string, ok: boolean, just: string | null) => Promise<boolean>;
    requestHelp: (id: string, tos: string[], note: string) => Promise<boolean>;
    answerHelp: (id: string, ok: boolean, just: string | null) => Promise<boolean>;
    sendMessage: (to: string, task: string, text: string) => Promise<boolean>;
    markRead: (from: string) => Promise<boolean>;
    setState: (s: MemberState) => Promise<boolean>;
    startMeeting: (subject: string, members: string[], visitors: number, outsiders: number) => Promise<boolean>;
    joinMeeting: (id: string) => Promise<boolean>;
    leaveMeeting: () => Promise<boolean>;
    callAttention: (to: string) => Promise<boolean>;
    ackAttention: (from: string) => Promise<boolean>;
  };
}
const Ctx = createContext<LiveCtx | null>(null);
export const useLive = () => { const v = useContext(Ctx); if (!v) throw new Error('useLive fora da sala'); return v; };

export function LiveProvider({ children }: { children: ReactNode }) {
  const { ws, me, members } = useWs();
  const toast = useToast();
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [online, setOnline] = useState<OnlineMap>({});
  const [now, setNow] = useState(Date.now());
  const device = useMemo(detectDevice, []);
  const timer = useRef<number>();
  const entered = useRef(false);
  const room = useRoomPresence(ws.id + ':' + me.user_id);

  const reload = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      live.loadLive(ws.id, todayStr(), me.user_id).then(setSnap).catch(e => toast(e.message));
    }, 120);
  }, [ws.id, me.user_id, toast]);

  useEffect(() => live.subscribeLive(ws.id, { userId: me.user_id, device }, reload, setOnline, room.bind), [ws.id, me.user_id, device, reload, room.bind]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  // ao abrir o site, você entra no escritório (ou volta no dia seguinte depois de encerrar)
  useEffect(() => {
    if (!snap || entered.current) return;
    const st = snap.statuses.find(s => s.user_id === me.user_id);
    if (!st) return;
    entered.current = true;
    const stale = st.state === 'encerrado' && new Date(st.since).toLocaleDateString('sv-SE') !== todayStr();
    if (st.state === 'fora' || stale || (st.state === 'trabalhando' && st.device !== device))
      live.setState(ws.id, 'trabalhando', todayStr(), device).then(reload).catch(e => toast(e.message));
  }, [snap, me.user_id, ws.id, device, reload, toast]);

  // dentro do app de computador: liga a medição a esta conta e a este escritório
  useEffect(() => {
    if (!desktop.inApp() || me.kind !== 'membro' || !me.consent_at) return;
    (async () => {
      try {
        const info = await desktop.agentInfo();
        const key = 'sala8bit.agent.ws';
        let last: string | null = null; try { last = localStorage.getItem(key); } catch { /* */ }
        if (info.pareado && last === ws.id + ':' + me.user_id) return;
        const b = live.backendInfo();
        if (!b.url) return; // demonstração: não há servidor para receber
        const token = await live.createAgentToken(ws.id, info.aparelho, info.plataforma);
        await desktop.agentPair(b.url, b.key, token);
        try { localStorage.setItem(key, ws.id + ':' + me.user_id); } catch { /* */ }
      } catch (e) { toast('App de computador: ' + (e as Error).message); }
    })();
  }, [ws.id, me.user_id, me.kind, me.consent_at, toast]);

  // aviso quando alguém chama sua atenção
  const seenCalls = useRef(new Set<string>());
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!snap) return;
    for (const c of snap.calls) {
      if (c.to_user !== me.user_id || seenCalls.current.has(c.id)) continue;
      seenCalls.current.add(c.id);
      const from = members.find(m => m.user_id === c.from_user);
      toast(`${from?.display_name || 'Um colega'} chamou sua atenção`);
      try { navigator.vibrate?.(200); } catch { /* */ }
    }
    for (const m of snap.board.messages) {
      if (m.to_user !== me.user_id || m.read_at || seenCalls.current.has(m.id)) continue;
      seenCalls.current.add(m.id);
      if (firstLoad.current) continue;
      toast(`Nova mensagem de ${members.find(x => x.user_id === m.from_user)?.display_name || 'um colega'}`);
    }
    firstLoad.current = false;
  }, [snap, me.user_id, members, toast]);

  // títulos do mês passado (recalcula a cada 10 minutos)
  const [titles, setTitles] = useState<Record<string, GloryCat>>({});
  useEffect(() => {
    if (!ws.settings.recursos?.mural_gloria) { setTitles({}); return; }
    const load = () => live.gloryScores(ws.id, monthStart(-1)).then(sc => {
      const { win } = assignTitles(sc);
      const t: Record<string, GloryCat> = {};
      (Object.keys(win) as GloryCat[]).forEach(c => { const u = win[c]; if (u) t[u] = c; });
      setTitles(t);
    }).catch(() => {});
    load();
    const i = window.setInterval(load, 600000);
    return () => window.clearInterval(i);
  }, [ws.id, ws.settings.recursos?.mural_gloria]);

  const value = useMemo<LiveCtx>(() => {
    const budget = (ws.settings.cafe_min ?? 15) * 60;
    const ready = members.filter(m => m.display_name && m.consent_at);
    const meetingsOpen = (snap?.meetings || []).map(m => ({ ...m, people: (snap?.meetingMembers || []).filter(x => x.meeting_id === m.id).map(x => x.user_id) }));
    const views: PersonView[] = ready.map(m => {
      const status = snap?.statuses.find(s => s.user_id === m.user_id) || null;
      const lastSignal = status?.agent_live_at || status?.agent_seen_at;
      const agentOn = !!lastSignal && now - new Date(lastSignal).getTime() < (status?.agent_live_at ? 20000 : 150000);
      const on = !!online[m.user_id] || agentOn;
      const st = status?.state || 'fora';
      const shown: MemberState = st === 'encerrado' ? 'encerrado' : on ? (st === 'fora' ? 'trabalhando' : st) : (st === 'cafe' || st === 'almoco' ? st : 'fora');
      const mine = (snap?.pauses || []).filter(p => p.user_id === m.user_id);
      const capturing = !!snap?.board.tasks.some(t => t.id === status?.active_task_id && t.col === 'fazendo' && t.etapa === 'captacao');
      const cafeUsed = mine.filter(p => p.kind === 'cafe').reduce((s, p) => s + ((p.ended_at ? new Date(p.ended_at).getTime() : now) - new Date(p.started_at).getTime()) / 1000, 0);
      return {
        member: m, status, online: on, device: online[m.user_id]?.device || (agentOn ? 'computador' : status?.device || 'computador'), shown,
        since: status ? new Date(status.since).getTime() : now, cafeUsed, cafeLeft: budget - cafeUsed,
        lunchDone: mine.some(p => p.kind === 'almoco'),
        meeting: status?.meeting_id ? meetingsOpen.find(x => x.id === status.meeting_id) || null : null,
        agentOn, app: agentOn ? status?.app_now || null : null, appCat: agentOn ? status?.app_cat || null : null,
        music: agentOn && !!status?.music, agents: agentOn ? status?.agents || 0 : 0,
        idle: !capturing && agentOn && (status?.idle_seconds != null ? status.idle_seconds >= 300 : !!status?.idle) && !(status?.agents && status.agents > 0), capturing,
        scene: m.user_id === me.user_id ? room.scene : online[m.user_id]?.scene
      };
    });
    const gestor = ready.find(m => m.kind === 'gestor');
    const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
    const al = ws.settings.almoco || { de: '11:00', ate: '13:00' };
    const wrap = (fn: () => Promise<unknown>, ok?: string) => async () => { try { await fn(); reload(); if (ok) toast(ok); return true; } catch (e) { toast((e as Error).message); return false; } };
    const board = snap?.board || EMPTY_BOARD;
    const order = [...ready].sort((a, b) => (a.desk || 99) - (b.desk || 99) || a.joined_at.localeCompare(b.joined_at)).map(m => m.user_id);
    const avail = new Set(themesNow(new Date(now)).map(t => t.id));
    const look = (m: Member): Avatar => {
      const a = m.avatar as Avatar, t = a.theme;
      let theme: string | null = null;
      if (t && t.startsWith('ttl_')) { const c = titles[m.user_id]; if (c && titleThemeOf(c) === t && ws.settings.recursos?.mural_gloria) theme = t; }
      else if (t && THEME[t] && avail.has(t) && ws.settings.recursos?.datas_comemorativas) theme = t;
      return { ...a, theme, vi: Math.max(0, order.indexOf(m.user_id)) };
    };
    const unread: Record<string, number> = {};
    board.messages.forEach(m => { if (m.to_user === me.user_id && !m.read_at) unread[m.from_user] = (unread[m.from_user] || 0) + 1; });
    const nameOf = (id: string | null) => (id ? members.find(m => m.user_id === id)?.display_name || 'ex-membro' : '—');
    return {
      refresh: reload,
      ready: !!snap, now, views, board, unread, nameOf, titles, look, moveCharacter: room.move,
      saturdays: snap?.saturdays || [], instagram: snap?.instagram || null,
      view: (id: string) => views.find(v => v.member.user_id === id),
      meetings: meetingsOpen,
      callsToMe: (snap?.calls || []).filter(c => c.to_user === me.user_id),
      callsFromMe: (snap?.calls || []).filter(c => c.from_user === me.user_id),
      gestorName: gestor?.display_name || null,
      inLunchWindow: nowMin >= toMin(al.de) && nowMin < toMin(al.ate),
      act: {
        createTask: async t => { try { const task = await live.createTask(ws.id, t); reload(); toast('Tarefa criada'); return task; } catch (e) { toast((e as Error).message); return null; } },
        setSaturday: (u, d, w) => wrap(() => live.setSaturday(ws.id, u, d, w), w ? 'Sábado de trabalho marcado' : 'Folga marcada')(),
        setInstagram: (h, f) => wrap(() => live.setInstagram(ws.id, h, f), 'Instagram atualizado')(),
        startTask: id => wrap(() => live.startTask(id), 'Tarefa iniciada')(),
        setActiveTask: id => wrap(() => live.setActiveTask(id), 'Executando agora')(),
        completeTask: id => wrap(() => live.completeTask(id))(),
        returnTask: id => wrap(() => live.returnTask(id), 'Devolvida para A fazer')(),
        deleteTask: id => wrap(() => live.deleteTask(id), 'Tarefa excluída')(),
        contestTask: (id, text) => wrap(() => live.contestTask(id, text), 'Sugestão enviada para votação')(),
        voteContest: (id, v) => wrap(() => live.voteContest(id, v), 'Voto registrado')(),
        requestTransfer: (id, to) => wrap(() => live.requestTransfer(id, to), 'Pedido de transferência enviado')(),
        answerTransfer: (id, ok, j) => wrap(() => live.answerTransfer(id, ok, j), ok ? 'Transferência aceita' : 'Transferência recusada')(),
        requestHelp: (id, tos, note) => wrap(() => live.requestHelp(id, tos, note), 'Pedido de ajuda enviado')(),
        answerHelp: (id, ok, j) => wrap(() => live.answerHelp(id, ok, j), ok ? 'Você está ajudando' : 'Pedido recusado')(),
        sendMessage: (to, task, text) => wrap(() => live.sendMessage(ws.id, to, task, text))(),
        markRead: from => wrap(() => live.markRead(ws.id, from))(),
        setState: s => wrap(() => live.setState(ws.id, s, todayStr(), device))(),
        startMeeting: (subject, ids, v, o) => wrap(() => live.startMeeting(ws.id, subject, ids, v, o), 'Reunião sinalizada')(),
        joinMeeting: id => wrap(() => live.joinMeeting(id), 'Você entrou na reunião')(),
        leaveMeeting: () => wrap(() => live.leaveMeeting(ws.id), 'Você saiu da reunião')(),
        callAttention: to => wrap(() => live.callAttention(ws.id, to), 'Chamado enviado')(),
        ackAttention: from => wrap(() => live.ackAttention(ws.id, from))()
      }
    };
  }, [snap, online, now, members, ws, me.user_id, device, reload, toast, titles, room.scene, room.move]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const STATE_LABEL: Record<MemberState, string> = {
  fora: 'Fora do sistema', trabalhando: 'No escritório', cafe: 'No café', almoco: 'Almoçando', reuniao: 'Em reunião', pausa_gestor: 'Pausa do gestor', encerrado: 'Encerrou o expediente'
};
export const STATE_COLOR: Record<MemberState, string> = {
  fora: '#6b7390', trabalhando: '#5ad18a', cafe: '#c9a0ff', almoco: '#c9a0ff', reuniao: '#6ea8ff', pausa_gestor: '#d4a72c', encerrado: '#6b7390'
};
export const fmtClock = (sec: number) => { const s = Math.max(0, Math.floor(sec)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const fmtDur = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`; };
