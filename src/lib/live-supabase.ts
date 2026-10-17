// Sala ao vivo com o Supabase: leitura, mudanças em tempo real e presença (quem está com o site aberto).
import { supabase } from './supabase';
import type { AttentionCall, Device, LiveSnapshot, Meeting, MeetingMember, MemberState, OnlineMap, Pause, Status } from './types';

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(/Failed to fetch/i.test(r.error.message) ? 'Sem conexão com o servidor.' : r.error.message);
  return r.data as T;
}

export async function loadLive(wsId: string, day: string, userId: string): Promise<LiveSnapshot> {
  const [statuses, pauses, meetings, calls] = await Promise.all([
    supabase.from('statuses').select('*').eq('workspace_id', wsId),
    supabase.from('pauses').select('*').eq('workspace_id', wsId).eq('day', day),
    supabase.from('meetings').select('*').eq('workspace_id', wsId).is('ended_at', null),
    supabase.from('attention_calls').select('*').eq('workspace_id', wsId).is('seen_at', null).or(`from_user.eq.${userId},to_user.eq.${userId}`)
  ]);
  const ms = check(meetings) as Meeting[];
  const mm = ms.length
    ? check(await supabase.from('meeting_members').select('*').in('meeting_id', ms.map(m => m.id)).is('left_at', null)) as MeetingMember[]
    : [];
  return { statuses: check(statuses) as Status[], pauses: check(pauses) as Pause[], meetings: ms, meetingMembers: mm, calls: check(calls) as AttentionCall[] };
}

export function subscribeLive(wsId: string, me: { userId: string; device: Device }, onChange: () => void, onOnline: (m: OnlineMap) => void) {
  const filter = `workspace_id=eq.${wsId}`;
  const ch = supabase.channel('sala:' + wsId, { config: { presence: { key: me.userId } } });
  for (const table of ['statuses', 'pauses', 'meetings', 'meeting_members', 'attention_calls'])
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, onChange);
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState<{ device: Device }>();
    const map: OnlineMap = {};
    for (const [uid, metas] of Object.entries(st)) map[uid] = { device: metas.some(x => x.device === 'computador') ? 'computador' : 'celular' };
    onOnline(map);
  });
  ch.subscribe(async s => { if (s === 'SUBSCRIBED') { await ch.track({ device: me.device }); onChange(); } });
  return () => { supabase.removeChannel(ch); };
}

const rpc = async (fn: string, args: Record<string, unknown>) => { check(await supabase.rpc(fn, args)); };
export const setState = (wsId: string, state: MemberState, day: string, device?: Device) => rpc('set_state', { p_ws: wsId, p_state: state, p_day: day, p_device: device ?? null });
export const startMeeting = (wsId: string, subject: string, members: string[], visitors: number, outsiders: number) =>
  rpc('start_meeting', { p_ws: wsId, p_subject: subject, p_members: members, p_visitors: visitors, p_outsiders: outsiders });
export const joinMeeting = (meetingId: string) => rpc('join_meeting', { p_meeting: meetingId });
export const leaveMeeting = (wsId: string) => rpc('leave_meeting', { p_ws: wsId });
export const callAttention = (wsId: string, to: string) => rpc('call_attention', { p_ws: wsId, p_to: to });
export const ackAttention = (wsId: string, from: string) => rpc('ack_attention', { p_ws: wsId, p_from: from });
