import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Loading } from '../components/Loading';
import { useAuth } from '../lib/auth';
import { acceptInvite, invitePreview } from '../lib/data';
import type { InvitePreview } from '../lib/types';
import { Login } from './Login';

export function Invite() {
  const { token = '' } = useParams();
  const { session } = useAuth();
  const nav = useNavigate();
  const [p, setP] = useState<InvitePreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!session) return;
    invitePreview(token).then(r => { setP(r); if (r?.already_member) nav(`/w/${r.workspace_slug}`, { replace: true }); }).catch(e => setErr(e.message));
  }, [session, token, nav]);

  if (!session) return <Login title="Você foi convidado" hint="Entre com sua conta para aceitar o convite. Depois você cria seu personagem e escolhe sua mesa." />;
  if (p === undefined && !err) return <Loading />;

  const accept = async () => {
    setBusy(true); setErr('');
    try { const slug = await acceptInvite(token); nav(`/w/${slug}`, { replace: true }); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="center">
      <div className="card">
        <Brand sub={session.user.email} />
        {!p ? <><h2>Convite não encontrado</h2><p className="muted">O link pode estar incompleto. Peça um novo ao administrador da sua equipe.</p></>
          : !p.valid ? <><h2>Convite expirado</h2><p className="muted">O convite para <b>{p.workspace_name}</b> não vale mais. Peça um novo ao administrador.</p></>
          : <>
            <h2>{p.workspace_name}</h2>
            <p>Você foi convidado para entrar como <b>{p.kind === 'gestor' ? 'gestor (acompanha a equipe, com coroa)' : 'membro da equipe'}</b>.</p>
            {p.kind === 'gestor' && <div className="note">O gestor acompanha tudo, mas não é monitorado e não pega tarefas.</div>}
            <button className="cta" onClick={accept} disabled={busy}>{busy ? 'Entrando…' : 'Aceitar e entrar'}</button>
          </>}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="linkbtn small" style={{ justifySelf: 'start' }} onClick={() => nav('/')}>Ir para o início</button>
      </div>
    </div>
  );
}
