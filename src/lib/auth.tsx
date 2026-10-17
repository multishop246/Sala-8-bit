import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, configured, isDemo } from './supabase';
import { DEMO_USER } from './data-demo';

interface AuthState { session: Session | null; loading: boolean }
const Ctx = createContext<AuthState>({ session: null, loading: true });

const DEMO_KEY = 'sala8bit.demo.session';
const demoSession = () => { try { return localStorage.getItem(DEMO_KEY) ? ({ user: { id: DEMO_USER.id, email: DEMO_USER.email } } as unknown as Session) : null; } catch { return null; } };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => isDemo ? { session: demoSession(), loading: false } : { session: null, loading: configured });
  useEffect(() => {
    if (isDemo) {
      const f = () => setState({ session: demoSession(), loading: false });
      window.addEventListener('sala8bit-auth', f);
      return () => window.removeEventListener('sala8bit-auth', f);
    }
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

const NEXT_KEY = 'sala8bit.next';
/** Guarda para onde voltar depois do login (ex.: link de convite). */
export const rememberNext = (path: string) => { try { localStorage.setItem(NEXT_KEY, path); } catch { /* sem armazenamento */ } };
export const takeNext = () => { try { const v = localStorage.getItem(NEXT_KEY); localStorage.removeItem(NEXT_KEY); return v; } catch { return null; } };

const demoLogin = (on: boolean) => { try { if (on) localStorage.setItem(DEMO_KEY, '1'); else localStorage.removeItem(DEMO_KEY); } catch { /* */ } window.dispatchEvent(new Event('sala8bit-auth')); };

export async function signInGoogle() {
  if (isDemo) return demoLogin(true);
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/' } });
  if (error) throw error;
}
/** Retorna true se entrou direto (demonstração); false se o link foi enviado por e-mail. */
export async function signInEmail(email: string) {
  if (isDemo) { demoLogin(true); return true; }
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/' } });
  if (error) throw error;
  return false;
}
export const signOut = async () => { if (isDemo) return demoLogin(false); await supabase.auth.signOut(); };
