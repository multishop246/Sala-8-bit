import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Loading } from '../components/Loading';
import { Avatar } from '../game/Avatar';
import { signOut, useAuth } from '../lib/auth';
import * as db from '../lib/data';
import { isDemo, supabase } from '../lib/supabase';
import { profileDone, type CatalogItem, type Member, type Workspace } from '../lib/types';
import { WorkspaceContext } from '../lib/workspace';
import { Onboarding } from './Onboarding';
import { LiveProvider } from '../live/LiveProvider';

export function WorkspaceShell() {
  const { slug = '' } = useParams();
  const { session } = useAuth();
  const nav = useNavigate();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    try {
      const w = await db.workspaceBySlug(slug);
      if (!w) { setState('notfound'); return; }
      const [m, c] = await Promise.all([db.members(w.id), db.catalog(w.id)]);
      setWs(w); setMembers(m); setCatalog(c); setState('ok');
    } catch (e) { setErr((e as Error).message); setState('error'); }
  }, [slug]);

  useEffect(() => { reload(); }, [reload]);

  // mudanças de equipe (alguém entrou, escolheu mesa, trocou o visual) aparecem na hora
  useEffect(() => {
    if (!ws || isDemo) return;
    const ch = supabase.channel('members-' + ws.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `workspace_id=eq.${ws.id}` }, () => { db.members(ws.id).then(setMembers).catch(() => {}); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ws]);

  if (state === 'loading') return <Loading />;
  if (state !== 'ok' || !ws) return (
    <div className="center"><div className="card">
      <Brand />
      <h2>{state === 'notfound' ? 'Escritório não encontrado' : 'Algo deu errado'}</h2>
      <p className="muted">{state === 'notfound' ? 'O endereço pode estar errado, ou você ainda não faz parte desta equipe. Peça um convite ao administrador.' : err}</p>
      <button className="cta" onClick={() => nav('/')}>Voltar ao início</button>
    </div></div>
  );
  const me = members.find(m => m.user_id === session!.user.id);
  if (!me) return <Loading text="Você saiu desta equipe." />;
  const ctx = { ws, me, members, catalog, reload };
  if (!profileDone(me)) return <WorkspaceContext.Provider value={ctx}><Onboarding /></WorkspaceContext.Provider>;

  return (
    <WorkspaceContext.Provider value={ctx}>
      <div className="app">
        <header className="top">
          <Brand sub={ws.name} />
          <nav aria-label="Menu">
            <NavLink to={`/w/${ws.slug}`} end>Escritório</NavLink>
            <NavLink to={`/w/${ws.slug}/personagem`}>Meu personagem</NavLink>
            {me.is_admin && <NavLink to={`/w/${ws.slug}/config`}>Configurações</NavLink>}
            <button onClick={() => nav('/')}>Trocar escritório</button>
            <button onClick={() => signOut()}>Sair</button>
          </nav>
          <span className="row" title={me.display_name || ''}><Avatar avatar={me.avatar} crown={me.kind === 'gestor'} size={26} /></span>
        </header>
        <LiveProvider><Outlet /></LiveProvider>
      </div>
    </WorkspaceContext.Provider>
  );
}
