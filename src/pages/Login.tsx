import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { rememberNext, signInEmail, signInGoogle } from '../lib/auth';
import { isDemo } from '../lib/supabase';

export function Login({ title = 'Entre no seu escritório', hint }: { title?: string; hint?: string }) {
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (loc.pathname !== '/') rememberNext(loc.pathname); }, [loc.pathname]);

  const google = async () => { setErr(''); try { await signInGoogle(); } catch (e) { setErr(msg(e)); } };
  const mail = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { if (!(await signInEmail(email.trim()))) setSent(true); } catch (e2) { setErr(msg(e2)); } finally { setBusy(false); }
  };
  return (
    <div className="center">
      <div className="card">
        <Brand sub="Escritório virtual para equipes de marketing" />
        <h2>{title}</h2>
        {hint && <p className="muted">{hint}</p>}
        {sent ? (
          <div className="note"><b>Link enviado para {email}.</b><br />Abra seu e-mail neste aparelho e clique no link para entrar. Pode levar um minuto. Confira o spam.</div>
        ) : (
          <div className="login">
            <button className="google" type="button" onClick={google}>
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Continuar com Google
            </button>
            <div className="or">ou</div>
            <form className="login" onSubmit={mail}>
              <div className="field"><label htmlFor="em">Seu e-mail</label>
                <input id="em" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com.br" /></div>
              <button className="cta" disabled={busy || !email}>{busy ? 'Enviando…' : 'Receber link de acesso'}</button>
            </form>
          </div>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <p className="small muted">{isDemo ? 'Modo demonstração: qualquer botão entra direto, sem conta.' : 'Sem senha: você entra pelo Google ou por um link enviado ao seu e-mail.'}</p>
      </div>
    </div>
  );
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
