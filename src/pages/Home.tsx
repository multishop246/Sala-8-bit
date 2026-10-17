import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Loading } from '../components/Loading';
import { signOut, takeNext, useAuth } from '../lib/auth';
import { createWorkspace, myWorkspaces, slugify } from '../lib/data';
import type { Workspace } from '../lib/types';
import { isDemo } from '../lib/supabase';
import { DEMO_INVITE } from '../demo/pg';

type MyWs = Workspace & { myKind: string; iAmAdmin: boolean };

export function Home() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [list, setList] = useState<MyWs[] | null>(null);
  const [mode, setMode] = useState<'list' | 'criar' | 'convite'>('list');
  const [err, setErr] = useState('');

  useEffect(() => {
    const next = takeNext();
    if (next && next !== '/') { nav(next, { replace: true }); return; }
    myWorkspaces(session!.user.id).then(ws => {
      setList(ws as MyWs[]);
      if (ws.length === 1) nav(`/w/${ws[0].slug}`, { replace: true });
    }).catch(e => setErr(e.message));
  }, [session, nav]);

  if (!list && !err) return <Loading />;
  return (
    <div className="center">
      <div className="card">
        <Brand sub={session!.user.email} />
        {err && <p className="err">{err}</p>}
        {mode === 'list' && <>
          {list && list.length > 0 ? <>
            <h2>Seus escritórios</h2>
            <div className="list">{list.map(w => (
              <Link key={w.id} to={`/w/${w.slug}`} className="item" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span><b>{w.name}</b><small>{w.iAmAdmin ? 'Administrador' : w.myKind === 'gestor' ? 'Gestor' : 'Membro'}</small></span><span className="muted">Entrar →</span>
              </Link>))}</div>
          </> : <>
            <h2>Bem-vindo!</h2>
            <p className="muted">Você ainda não está em nenhum escritório. Crie um para sua equipe ou entre pelo convite que recebeu.</p>
            {isDemo && <button className="cta" onClick={() => nav(`/convite/${DEMO_INVITE}`)}>Entrar na Agência Demonstração (já tem equipe)</button>}
          </>}
          <div className="choice">
            <button className="opt" onClick={() => setMode('criar')}><b>Criar escritório</b><span>Para sua equipe. Você vira o administrador.</span></button>
            <button className="opt" onClick={() => setMode('convite')}><b>Tenho um convite</b><span>Cole o link que o administrador enviou.</span></button>
          </div>
        </>}
        {mode === 'criar' && <CreateWs onBack={() => setMode('list')} />}
        {mode === 'convite' && <PasteInvite onBack={() => setMode('list')} />}
        <button className="linkbtn small" style={{ justifySelf: 'start' }} onClick={() => signOut()}>Sair desta conta</button>
      </div>
    </div>
  );
}

function CreateWs({ onBack }: { onBack: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [desks, setDesks] = useState(7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const s = touched ? slug : slugify(name);
  const valid = name.trim().length >= 2 && /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/.test(s);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const ws = await createWorkspace(name, s, desks); nav(`/w/${ws.slug}`); } catch (e2) { setErr((e2 as Error).message); setBusy(false); }
  };
  return (
    <form className="stack" onSubmit={submit}>
      <h2>Criar escritório</h2>
      <div className="field"><label htmlFor="wn">Nome da equipe ou empresa</label>
        <input id="wn" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Marketing Aromasil" maxLength={60} autoFocus /></div>
      <div className="field"><label htmlFor="ws">Endereço</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}><span className="muted small mono">/w/</span>
          <input id="ws" style={{ flex: 1 }} value={s} onChange={e => { setTouched(true); setSlug(slugify(e.target.value)); }} placeholder="marketing-aromasil" /></div>
        <span className="small muted">Só letras minúsculas, números e hífen.</span></div>
      <div className="field"><label htmlFor="wd">Quantas mesas</label>
        <select id="wd" value={desks} onChange={e => setDesks(+e.target.value)}>
          {Array.from({ length: 24 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? 'mesa' : 'mesas'}</option>)}
        </select>
        <span className="small muted">Uma por pessoa da equipe. O gestor tem mesa própria. Dá para mudar depois.</span></div>
      <p className="small muted">A empresa já começa com funções, áreas e tipos de tarefa de marketing prontos. Você ajusta tudo em Configurações.</p>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="nav"><button type="button" className="ghost" onClick={onBack}>Voltar</button><button className="cta" disabled={!valid || busy}>{busy ? 'Criando…' : 'Criar escritório'}</button></div>
    </form>
  );
}

function PasteInvite({ onBack }: { onBack: () => void }) {
  const nav = useNavigate();
  const [v, setV] = useState('');
  const token = (v.match(/convite\/([a-f0-9]{16,64})/i) || v.match(/^([a-f0-9]{16,64})$/i) || [])[1];
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); if (token) nav(`/convite/${token}`); }}>
      <h2>Entrar com convite</h2>
      <div className="field"><label htmlFor="iv">Link do convite</label>
        <input id="iv" value={v} onChange={e => setV(e.target.value)} placeholder="https://…/convite/…" autoFocus /></div>
      {v && !token && <p className="err">Esse link não parece um convite. Peça ao administrador para gerar um novo.</p>}
      <div className="nav"><button type="button" className="ghost" onClick={onBack}>Voltar</button><button className="cta" disabled={!token}>Continuar</button></div>
    </form>
  );
}
