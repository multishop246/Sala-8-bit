// Mesmas funções de lib/live-supabase.ts, no Postgres da demonstração.
import type { DayApp, DaySummary, GloryScore, InstagramStats, SaturdayShift, TimeLogRow, AttentionCall, BoardSnapshot, Contest, Device, Duration, HelpReq, LiveSnapshot, Meeting, MeetingMember, MemberState, Message, NewTask, OnlineMap, Pause, Status, Task, TaskEvent, Transfer, Vote } from '../lib/types';
import { DEMO_USER, asUser, rpc as rawRpc } from './pg';
import { botTick } from './bots';
import type { RoomPresence } from '../game/movement';

const me = DEMO_USER.id;
const Q = <T,>(sql: string, p: unknown[] = []) => asUser<T>(me, sql, p);

export async function loadLive(wsId: string, day: string, userId: string): Promise<LiveSnapshot> {
  const [statuses, pauses, meetings, calls] = await Promise.all([
    Q<Status>(`select * from statuses where workspace_id = $1`, [wsId]),
    Q<Pause>(`select * from pauses where workspace_id = $1 and day = $2`, [wsId, day]),
    Q<Meeting>(`select * from meetings where workspace_id = $1 and ended_at is null`, [wsId]),
    Q<AttentionCall>(`select * from attention_calls where workspace_id = $1 and seen_at is null and (from_user = $2 or to_user = $2)`, [wsId, userId])
  ]);
  const meetingMembers = meetings.length ? await Q<MeetingMember>(`select * from meeting_members where meeting_id = any($1::uuid[]) and left_at is null`, [meetings.map(m => m.id)]) : [];
  const board: BoardSnapshot = {
    tasks: await Q<Task>(`select * from tasks where workspace_id = $1 and (col <> 'feito' or done_at > now() - interval '30 days') order by created_at`, [wsId]),
    events: await Q<TaskEvent>(`select * from task_events where workspace_id = $1 and created_at > now() - interval '30 days' order by created_at`, [wsId]),
    contests: await Q<Contest>(`select * from task_contests where workspace_id = $1`, [wsId]),
    votes: await Q<Vote>(`select * from contest_votes where workspace_id = $1`, [wsId]),
    transfers: await Q<Transfer>(`select * from task_transfers where workspace_id = $1`, [wsId]),
    help: await Q<HelpReq>(`select * from task_help where workspace_id = $1`, [wsId]),
    durations: await Q<Duration>(`select user_id, area_id, type_id, etapa, minutes, done_at from task_durations where workspace_id = $1`, [wsId]),
    messages: await Q<Message>(`select * from messages where workspace_id = $1 and (from_user = $2 or to_user = $2) order by created_at`, [wsId, userId])
  };
  const saturdays = await Q<SaturdayShift>(`select * from saturday_shifts where workspace_id = $1 and day >= $2`, [wsId, day]);
  const instagram = (await Q<InstagramStats>(`select * from instagram_stats where workspace_id = $1`, [wsId]))[0] || null;
  return { statuses, pauses, meetings, meetingMembers, calls, board, saturdays, instagram };
}

export function subscribeLive(wsId: string, my: { userId: string; device: Device }, onChange: () => void, onOnline: (m: OnlineMap) => void, bindScene?: (fn: (s: RoomPresence) => void) => void) {
  let scene: RoomPresence | undefined;
  const online = async () => {
    const map: OnlineMap = { [my.userId]: { device: my.device, scene } };
    const rows = await Q<{ user_id: string; device: Device }>(`select user_id, device from statuses where workspace_id = $1 and user_id <> $2 and state <> 'fora'`, [wsId, my.userId]);
    rows.forEach(r => { map[r.user_id] = { device: r.device }; });
    onOnline(map);
  };
  const f = () => { onChange(); online(); };
  bindScene?.(s => { scene = s; void online(); });
  window.addEventListener('sala8bit-live', f);
  const t = window.setInterval(() => { botTick(wsId).catch(() => {}); }, 5000);
  setTimeout(f, 0);
  return () => { bindScene?.(() => {}); window.removeEventListener('sala8bit-live', f); window.clearInterval(t); };
}

const rpc = async (fn: string, args: Record<string, unknown>) => { await rawRpc(me, fn, args); };
export const setState = (wsId: string, state: MemberState, day: string, device?: Device) => rpc('set_state', { p_ws: wsId, p_state: state, p_day: day, p_device: device ?? null });
export const startMeeting = (wsId: string, subject: string, members: string[], visitors: number, outsiders: number) =>
  rpc('start_meeting', { p_ws: wsId, p_subject: subject, p_members: members, p_visitors: visitors, p_outsiders: outsiders });
export const joinMeeting = (meetingId: string) => rpc('join_meeting', { p_meeting: meetingId });
export const leaveMeeting = (wsId: string) => rpc('leave_meeting', { p_ws: wsId });
export const callAttention = (wsId: string, to: string) => rpc('call_attention', { p_ws: wsId, p_to: to });
export const ackAttention = (wsId: string, from: string) => rpc('ack_attention', { p_ws: wsId, p_from: from });

export const createTask = async (wsId: string, t: NewTask) => (await rawRpc<Task>(me, 'create_task', {
  p_ws: wsId, p_title: t.title, p_desc: t.description, p_line: t.line_id, p_area: t.area_id, p_type: t.type_id,
  p_dir_to: t.dir_to, p_due_date: t.due_date, p_due_time: t.due_time, p_est: t.est_min
}))[0];
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

export const setSaturday = (wsId: string, userId: string, day: string, works: boolean) => rpc('set_saturday', { p_ws: wsId, p_user: userId, p_day: day, p_works: works });
export const setInstagram = (wsId: string, handle: string, followers: number) => rpc('set_instagram', { p_ws: wsId, p_handle: handle, p_followers: followers });
export const gloryScores = (wsId: string, month: string) => asUser<GloryScore>(me, `select * from glory_scores($1, $2)`, [wsId, month]);
export const daySummary = (wsId: string, day: string) => asUser<DaySummary>(me, `select * from day_summary($1, $2)`, [wsId, day]);
export const myTimeLog = (wsId: string, userId: string, day: string) => asUser<TimeLogRow>(me, `select task_id, seconds from task_time_log where workspace_id = $1 and user_id = $2 and day = $3`, [wsId, userId, day]);

export const createAgentToken = async (wsId: string, device: string, platform: string) => (await asUser<{ t: string }>(me, `select create_agent_token($1,$2,$3) t`, [wsId, device, platform]))[0].t;
export const dayApps = (wsId: string, userId: string, day: string) => asUser<DayApp>(me, `select * from day_apps($1,$2,$3)`, [wsId, userId, day]);
export const backendInfo = () => ({ url: '', key: '' });
