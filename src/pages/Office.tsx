import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../game/Avatar';
import { Room } from '../game/Room';
import { useWs } from '../lib/workspace';
import type { Member } from '../lib/types';

export function Office() {
  const { ws, me, members } = useWs();
  const [sel, setSel] = useState<Member | null>(null);
  const ready = members.filter(m => m.display_name && m.consent_at);
  const team = ready.filter(m => m.kind === 'membro');
  const bosses = ready.filter(m => m.kind === 'gestor');
  const pending = members.length - ready.length;
  const freeDesks = ws.desks - team.filter(m => m.desk).length;

  return (
    <>
      <div className="banner">
        <span><b>Versão 0.1</b> · equipe, mesas e configurações já funcionam. Presença ao vivo, tarefas, chat e mural chegam nas próximas versões.</span>
        {me.is_admin && freeDesks > 0 && <Link to={`/w/${ws.slug}/config?aba=convites`} className="cta sm" style={{ textDecoration: 'none' }}>Convidar equipe</Link>}
      </div>
      <div className="grid2">
        <aside className="panel">
          <h3>Equipe · {team.length}</h3>
          {[...bosses, ...team].map(m => (
            <button key={m.user_id} className="mrow" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'inherit' }} onClick={() => setSel(m)}>
              <Avatar avatar={m.avatar} crown={m.kind === 'gestor'} size={30} />
              <span className="who"><b>{m.display_name}{m.user_id === me.user_id && <span className="chip acc" style={{ marginLeft: 6 }}>você</span>}</b>
                <span>{m.kind === 'gestor' ? 'Gestor' : [m.main_role, ...m.adj_roles].filter(Boolean).join(' · ')}</span></span>
              <span className="small muted">{m.kind === 'gestor' ? '♛' : m.desk ? `Mesa ${m.desk}` : '—'}</span>
            </button>
          ))}
          {pending > 0 && <p className="small muted" style={{ marginTop: 8 }}>{pending} {pending === 1 ? 'pessoa ainda está' : 'pessoas ainda estão'} criando o personagem.</p>}
          <p className="small muted" style={{ marginTop: 8 }}>{freeDesks} {freeDesks === 1 ? 'mesa livre' : 'mesas livres'} de {ws.desks}.</p>
        </aside>
        <section className="stack">
          <Room desks={ws.desks} members={ready} onMemberClick={setSel} />
          {sel && (
            <div className="panel" aria-live="polite">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row"><Avatar avatar={sel.avatar} crown={sel.kind === 'gestor'} size={44} />
                  <div><h3 style={{ margin: 0 }}>{sel.display_name}</h3>
                    <span className="muted small">{sel.kind === 'gestor' ? 'Gestor · acompanha a equipe' : [sel.main_role, ...sel.adj_roles].filter(Boolean).join(' · ')}</span></div></div>
                <button className="ghost sm" onClick={() => setSel(null)}>Fechar</button>
              </div>
              {sel.kind === 'membro' && sel.schedule && (
                <p className="small muted" style={{ marginTop: 10 }}>Jornada {sel.schedule.e1}–{sel.schedule.s1} · {sel.schedule.e2}–{sel.schedule.s2}{sel.desk ? ` · Mesa ${sel.desk}` : ''}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
