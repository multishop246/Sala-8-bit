// Ponte com o app de computador (Tauri). No navegador comum, nada disso existe.
type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
const tauri = () => (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke;

export const inApp = () => typeof window !== 'undefined' && !!tauri();
const call = <T,>(cmd: string, args?: Record<string, unknown>) => { const f = tauri(); if (!f) return Promise.reject(new Error('Fora do app de computador')); return f<T>(cmd, args); };

export interface AgentNow { app: string; cat: string; idle: boolean; agents: number; music: boolean; estado: string; conectado: boolean; erro: string | null; pendentes: number }
export interface AgentInfo { versao: string; plataforma: string; aparelho: string; pareado: boolean; escritorio: string | null; pasta: string | null; agora: AgentNow }

export const agentInfo = () => call<AgentInfo>('agent_info');
export const agentPair = (supabaseUrl: string, anonKey: string, token: string) => call<void>('agent_pair', { supabaseUrl, anonKey, token });
export const agentUnpair = () => call<void>('agent_unpair');
export const chooseFolder = () => call<string | null>('choose_folder');
export const changeOffice = () => call<void>('change_office');
export const openIntegrations = () => call<void>('open_integrations');
export const focusLunchReminder = () => inApp() ? call<void>('focus_lunch_reminder') : Promise.resolve();
export async function saveReportInApp(filename: string, blob: Blob) {
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  return call<string>('save_report', { filename, bytes });
}

/** Link para baixar o app (troque em VITE_DOWNLOAD_URL se publicar em outro lugar). */
export const DOWNLOAD_URL = (import.meta.env.VITE_DOWNLOAD_URL as string | undefined) || 'https://github.com/multishop246/Sala-8-bit/releases/latest';
