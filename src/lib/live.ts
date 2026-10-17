import * as real from './live-supabase';
import * as demo from '../demo/live-pglite';
import { isDemo } from './supabase';

const api: typeof real = isDemo ? demo : real;
export const {
  loadLive, subscribeLive, setState, startMeeting, joinMeeting, leaveMeeting, callAttention, ackAttention,
  createTask, startTask, setActiveTask, completeTask, returnTask, deleteTask, contestTask, voteContest,
  requestTransfer, answerTransfer, requestHelp, answerHelp, sendMessage, markRead
} = api;
