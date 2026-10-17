// Sala ao vivo com o Supabase: leitura, mudanças em tempo real e presença (quem está com o site aberto).
import { supabase } from './supabase';
import type {
  AttentionCall, BoardSnapshot, Contest, Device, Duration, HelpReq, LiveSnapshot, Meeting, MeetingMember, MemberState, Message, NewTask,
  OnlineMap, Pause, Status, Task, TaskEvent, Transfer, Vote
} from './types';

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(/Failed to fetch/i.test(r.error.message) ? 'Sem conexão com o servidor.' : r.error.message);
  return r.data as T;
}
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

async function loadBoard(wsId: string): Promise<BoardSnapshot> {
  const [tasks, events, contests, transfers, help, durations, messages] = await Promise.all([
    supabase.from('tasks').select('*').eq('workspace_id', wsId).or(`col.neq.feito,done_at.gte.${daysAgo(30)}`).order('created_at'),
    supabase.from('task_events').select('*').eq('workspace_id', wsId).gte('created_at', daysAgo(30)).order('created_at').limit(3000),
    supabase.from('task_contests').select('*').eq('workspace_id', wsId).gte('created_at', daysAgo(60)),
    supabase.from('task_transfers').select('*').eq('workspace_id', wsId).gte('created_at', daysAgo(30)),
    supabase.from('task_help').select('*').eq('workspace_id', wsId).gte('created_at', daysAgo(30)),
    supabase.from('task_durations').select('user_id,area_id,type_id,etapa,minutes,done_at').eq('workspace_id', wsId).gte('done_at', daysAgo(120)),
    supabase.from('messages').select('*').eq('workspace_id', wsId).gte('created_at', daysAgo(30)).order('created_at').limit(3000)
  ]);
  const cs = check(contests) as Contest[];
  const votes = cs.length ? check(await supabase.from('contest_votes').select('*').in('contest_id', cs.map(c => c.id))) as Vote[] : [];
  return {
    tasks: check(tasks) as Task[], events: check(events) as TaskEvent[], contests: cs, votes,
    transfers: check(transfers) as Transfer[], help: check(help) as HelpReq[], durations: check(durations) as Duration[], messages: check(messages) as Message[]
  };
}

export async function loadLive(wsId: string, day: string, userId: string): Promise<LiveSnapshot> {
  const [statuses, pauses, meetings, calls, board] = await Promise.all([
    supabase.from('statuses').select('*').eq('workspace_id', wsId),
    supabase.from('pauses').select('*').eq('workspace_id', wsId).eq('day', day),
    supabase.from('meetings').select('*').eq('workspace_id', wsId).is('ended_at', null),
    supabase.from('attention_calls').select('*').eq('workspace_id', wsId).is('seen_at', null).or(`from_user.eq.${userId},to_user.eq.${userId}`),
    loadBoard(wsId)
  ]);
  const ms = check(meetings) as Meeting[];
  const mm = ms.length
    ? check(await supabase.from('meeting_members').select('*').in('meeting_id', ms.map(m => m.id)).is('left_at', null)) as MeetingMember[]
    : [];
  return { statuses: check(statuses) as Status[], pauses: check(pauses) as Pause[], meetings: ms, meetingMembers: mm, calls: check(calls) as AttentionCall[], board };
}

const TABLES = ['statuses', 'pauses', 'meetings', 'meeting_members', 'attention_calls', 'tasks', 'task_contests', 'contest_votes', 'task_transfers', 'task_help', 'messages'];
export function subscribeLive(wsId: string, me: { userId: string; device: Device }, onChange: () => void, onOnline: (m: OnlineMap) => void) {
  const filter = `workspace_id=eq.${wsId}`;
  const ch = supabase.channel('sala:' + wsId, { config: { presence: { key: me.userId } } });
  for (const table of TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, onChange);
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState<{ device: Device }>();
    const map: OnlineMap = {};
    for (const [uid, metas] of Object.entries(st)) map[uid] = { device: metas.some(x => x.device === 'computador') ? 'computador' : 'celular' };
    onOnline(map);
  });
  ch.subscribe(async s => { if (s === 'SUBSCRIBED') { await ch.track({ device: me.device }); onChange(); } });
  return () => { supabase.removeChannel(ch); };
}

const rpc = async <T = unknown>(fn: string, args: Record<string, unknown>) => check(await supabase.rpc(fn, args)) as T;
export const setState = (wsId: string, state: MemberState, day: string, device?: Device) => rpc('set_state', { p_ws: wsId, p_state: state, p_day: day, p_device: device ?? null });
export const startMeeting = (wsId: string, subject: string, members: string[], visitors: number, outsiders: number) =>
  rpc('start_meeting', { p_ws: wsId, p_subject: subject, p_members: members, p_visitors: visitors, p_outsiders: outsiders });
export const joinMeeting = (meetingId: string) => rpc('join_meeting', { p_meeting: meetingId });
export const leaveMeeting = (wsId: string) => rpc('leave_meeting', { p_ws: wsId });
export const callAttention = (wsId: string, to: string) => rpc('call_attention', { p_ws: wsId, p_to: to });
export const ackAttention = (wsId: string, from: string) => rpc('ack_attention', { p_ws: wsId, p_from: from });

// tarefas
export const createTask = (wsId: string, t: NewTask) => rpc<Task>('create_task', {
  p_ws: wsId, p_title: t.title, p_desc: t.description, p_line: t.line_id, p_area: t.area_id, p_type: t.type_id,
  p_dir_to: t.dir_to, p_due_date: t.due_date, p_due_time: t.due_time, p_est: t.est_min
});
export const startTask = (id: string) => rpc('start_task', { p_task: id });
export const setActiveTask = (id: string) => rpc('set_active_task', { p_task: id });
export const completeTask = (id: string) => rpc('complete_task', { p_task: id });
export const returnTask = (id: string) => rpc('return_task', { p_task: id });
export const deleteTask = (id: string) => rpc('delete_task', { p_task: id });
export const contestTask = (id: string, text: string) => rpc('contest_task', { p_task: id, p_text: text });
export const voteContest = (id: string, vote: boolean) => rpc('vote_contest', { p_contest: id, p_vote: vote });
export const requestTransfer = (id: string, to: string) => rpc('request_transfer', { p_task: id, p_to: to });
export const answerTransfer = (id: string, ok: boolean, just: string | null) => rpc('answer_transfer', { p_transfer: id, p_ok: ok, p_just: just });
export const requestHelp = (id: string, tos: string[], note: string) => rpc('request_help', { p_task: id, p_tos: tos, p_note: note });
export const answerHelp = (id: string, ok: boolean, just: string | null) => rpc('answer_help', { p_help: id, p_ok: ok, p_just: just });
export const sendMessage = (wsId: string, to: string, task: string, text: string) => rpc('send_message', { p_ws: wsId, p_to: to, p_task: task, p_text: text });
export const markRead = (wsId: string, from: string) => rpc('mark_read', { p_ws: wsId, p_from: from });
