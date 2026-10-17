import * as real from './live-supabase';
import * as demo from './live-demo';
import { isDemo } from './supabase';

const api: typeof real = isDemo ? demo : real;
export const { loadLive, subscribeLive, setState, startMeeting, joinMeeting, leaveMeeting, callAttention, ackAttention } = api;
