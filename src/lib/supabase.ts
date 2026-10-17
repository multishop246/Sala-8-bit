import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Modo demonstração: roda tudo no navegador, sem servidor. Dados ficam só neste aparelho. */
export const isDemo = (() => {
  if (import.meta.env.VITE_DEMO === '1') return true;
  try { return localStorage.getItem('sala8bit.demo') === '1'; } catch { return false; }
})();
export function setDemo(on: boolean) {
  try { if (on) localStorage.setItem('sala8bit.demo', '1'); else { localStorage.removeItem('sala8bit.demo'); localStorage.removeItem('sala8bit.demo.db'); localStorage.removeItem('sala8bit.demo.session'); } } catch { /* sem armazenamento */ }
  location.href = '/';
}

const hasEnv = !!(url && key && !url.includes('xxxxxxxx'));
/** false enquanto o banco não foi configurado: o site mostra o guia de configuração. */
export const configured = hasEnv || isDemo;

export const supabase: SupabaseClient = hasEnv && !isDemo
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : (null as unknown as SupabaseClient);
