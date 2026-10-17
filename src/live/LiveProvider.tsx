// Estado ao vivo da sala: status de todos, quem está online, pausas de hoje, reuniões e chamadas de atenção.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as live from '../lib/live';
import { useToast } from '../components/Toast';
import { useWs } from '../lib/workspace';
import type { AttentionCall, Device, LiveSnapshot, Meeting, Member, MemberState, OnlineMap, Status } from '../lib/types';

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
}

interface LiveCtx {
  ready: boolean;
  now: number;
  views: PersonView[];
  view: (userId: string) => PersonView | undefined;
  meetings: (Meeting & { people: string[] })[];
  callsToMe: AttentionCall[];
  callsFromMe: AttentionCall[];
  gestorName: string | null;
  inLunchWindow: boolean;
  act: {
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

  const reload = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      live.loadLive(ws.id, todayStr(), me.user_id).then(setSnap).catch(e => toast(e.message));
    }, 120);
  }, [ws.id, me.user_id, toast]);

  useEffect(() => live.subscribeLive(ws.id, { userId: me.user_id, device }, reload, setOnline), [ws.id, me.user_id, device, reload]);
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

  // aviso quando alguém chama sua atenção
  const seenCalls = useRef(new Set<string>());
  useEffect(() => {
    if (!snap) return;
    for (const c of snap.calls) {
      if (c.to_user !== me.user_id || seenCalls.current.has(c.id)) continue;
      seenCalls.current.add(c.id);
      const from = members.find(m => m.user_id === c.from_user);
      toast(`${from?.display_name || 'Um colega'} chamou sua atenção`);
      try { navigator.vibrate?.(200); } catch { /* */ }
    }
  }, [snap, me.user_id, members, toast]);

  const value = useMemo<LiveCtx>(() => {
    const budget = (ws.settings.cafe_min ?? 15) * 60;
    const ready = members.filter(m => m.display_name && m.consent_at);
    const meetingsOpen = (snap?.meetings || []).map(m => ({ ...m, people: (snap?.meetingMembers || []).filter(x => x.meeting_id === m.id).map(x => x.user_id) }));
    const views: PersonView[] = ready.map(m => {
      const status = snap?.statuses.find(s => s.user_id === m.user_id) || null;
      const on = !!online[m.user_id];
      const st = status?.state || 'fora';
      const shown: MemberState = st === 'encerrado' ? 'encerrado' : on ? (st === 'fora' ? 'trabalhando' : st) : (st === 'cafe' || st === 'almoco' ? st : 'fora');
      const mine = (snap?.pauses || []).filter(p => p.user_id === m.user_id);
      const cafeUsed = mine.filter(p => p.kind === 'cafe').reduce((s, p) => s + ((p.ended_at ? new Date(p.ended_at).getTime() : now) - new Date(p.started_at).getTime()) / 1000, 0);
      return {
        member: m, status, online: on, device: online[m.user_id]?.device || status?.device || 'computador', shown,
        since: status ? new Date(status.since).getTime() : now, cafeUsed, cafeLeft: budget - cafeUsed,
        lunchDone: mine.some(p => p.kind === 'almoco'),
        meeting: status?.meeting_id ? meetingsOpen.find(x => x.id === status.meeting_id) || null : null
      };
    });
    const gestor = ready.find(m => m.kind === 'gestor');
    const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
    const al = ws.settings.almoco || { de: '11:00', ate: '13:00' };
    const wrap = (fn: () => Promise<unknown>, ok?: string) => async () => { try { await fn(); reload(); if (ok) toast(ok); return true; } catch (e) { toast((e as Error).message); return false; } };
    return {
      ready: !!snap, now, views,
      view: (id: string) => views.find(v => v.member.user_id === id),
      meetings: meetingsOpen,
      callsToMe: (snap?.calls || []).filter(c => c.to_user === me.user_id),
      callsFromMe: (snap?.calls || []).filter(c => c.from_user === me.user_id),
      gestorName: gestor?.display_name || null,
      inLunchWindow: nowMin >= toMin(al.de) && nowMin < toMin(al.ate),
      act: {
        setState: s => wrap(() => live.setState(ws.id, s, todayStr(), device))(),
        startMeeting: (subject, ids, v, o) => wrap(() => live.startMeeting(ws.id, subject, ids, v, o), 'Reunião sinalizada')(),
        joinMeeting: id => wrap(() => live.joinMeeting(id), 'Você entrou na reunião')(),
        leaveMeeting: () => wrap(() => live.leaveMeeting(ws.id), 'Você saiu da reunião')(),
        callAttention: to => wrap(() => live.callAttention(ws.id, to), 'Chamado enviado')(),
        ackAttention: from => wrap(() => live.ackAttention(ws.id, from))()
      }
    };
  }, [snap, online, now, members, ws, me.user_id, device, reload, toast]);

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
