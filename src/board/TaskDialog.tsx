import { useMemo, useState, type ReactNode } from 'react';
import { Modal } from '../components/Modal';
import { Avatar } from '../game/Avatar';
import { useLive } from '../live/LiveProvider';
import { useWs } from '../lib/workspace';
import { ETAPAS, catOf, etapaIdx, etapaName, fmtD, fmtDue, overdue, spentMin, teamAvg, teamLabel } from './logic';

type Mode = null | 'contest' | 'transfer' | 'help' | { refuse: 'transfer' | 'help'; id: string };

export function TaskDialog({ id, onClose, onChat }: { id: string; onClose: () => void; onChat?: (userId: string, taskId: string) => void }) {
  const { me, members, catalog } = useWs();
  const L = useLive();
  const cat = useMemo(() => catOf(catalog), [catalog]);
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState('');
  const [to, setTo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const b = L.board;
  const t = b.tasks.find(x => x.id === id);
  if (!t) return <Modal title="Tarefa" onClose={onClose}><p className="muted">Essa tarefa não existe mais.</p></Modal>;

  const membro = me.kind === 'membro';
  const mineNow = t.owner === me.user_id && t.col === 'fazendo';
  const team = members.filter(m => m.kind === 'membro' && m.consent_at && m.user_id !== me.user_id);
  const contest = b.contests.filter(c => c.task_id === t.id).sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
  const open = contest?.status === 'aberta' ? contest : null;
  const votes = contest ? b.votes.filter(v => v.contest_id === contest.id) : [];
  const voted = votes.some(v => v.user_id === me.user_id);
  const transfer = b.transfers.find(x => x.task_id === t.id && x.status === 'pendente');
  const helpMine = b.help.find(h => h.task_id === t.id && h.to_user === me.user_id && h.status === 'pendente');
  const helps = b.help.filter(h => h.task_id === t.id && h.status !== 'cancelada');
  const events = b.events.filter(e => e.task_id === t.id);
  const area = t.area_id ? cat.byId.get(t.area_id) : undefined;
  const type = t.type_id ? cat.byId.get(t.type_id) : undefined;
  const line = t.line_id ? cat.byId.get(t.line_id) : undefined;
  const active = L.view(me.user_id)?.status?.active_task_id === t.id;
  const canDelete = (t.creator === me.user_id || me.is_admin) && t.col !== 'fazendo';
  const run = async (fn: () => Promise<boolean>, close = false) => { setBusy(true); const ok = await fn(); setBusy(false); if (ok) { setMode(null); setText(''); setTo([]); if (close) onClose(); } };
  const pi = etapaIdx(t.etapa);
  const next = pi >= 0 && pi < 3 ? etapaName(ETAPAS[pi + 1][0]) : null;
  const talkTo = t.owner && t.owner !== me.user_id ? t.owner : t.creator !== me.user_id ? t.creator : null;

  const facts: [string, ReactNode][] = [
    ['Status', { afazer: 'A fazer', fazendo: 'Fazendo', feito: 'Feito' }[t.col]],
    ['Linha', line?.name || '—'],
    ['Área', `${area?.name || '—'}${type ? ' · ' + type.name : ''}`],
    ...(pi >= 0 ? [['Etapa', `${etapaName(t.etapa)} (${pi + 1} de 4)`] as [string, string]] : []),
    ['Entrega', <span className={overdue(t, L.now) ? 'late' : ''}>{fmtDue(t)}</span>],
    ['Tempo gasto', fmtD(spentMin(t, L.now)) + (t.running_since ? ' · rodando' : '')],
    ['Média da equipe', fmtD(teamAvg(b, cat, t))],
    ['Responsável', t.owner ? L.nameOf(t.owner) : t.dir_to ? L.nameOf(t.dir_to) : t.linked_to ? 'Vinculada a ' + L.nameOf(t.linked_to) : teamLabel(cat, t.area_id)],
    ['Criada por', L.nameOf(t.creator)],
    ...(helps.some(h => h.status === 'aceita') ? [['Ajuda', helps.filter(h => h.status === 'aceita').map(h => L.nameOf(h.to_user)).join(', ')] as [string, string]] : [])
  ];

  return (
    <Modal title={t.title} onClose={onClose} wide>
      {pi >= 0 && <div className="phase big">{ETAPAS.map(([k, n], i) => <span key={k} className={t.col === 'feito' || pi > i ? 'ok' : pi === i ? 'cur' : ''}>{n}</span>)}</div>}
      <div className="facts">{facts.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      {t.description && <p className="desc">{t.description}</p>}

      {/* pedidos esperando você */}
      {transfer && transfer.to_user === me.user_id && <div className="note action">
        <b>{L.nameOf(transfer.from_user)}</b> quer transferir esta tarefa para você.
        <div className="btns"><button className="cta sm" disabled={busy} onClick={() => run(() => L.act.answerTransfer(transfer.id, true, null))}>Aceitar</button>
          <button className="ghost sm" onClick={() => setMode({ refuse: 'transfer', id: transfer.id })}>Recusar</button></div></div>}
      {helpMine && <div className="note action">
        <b>{L.nameOf(helpMine.from_user)}</b> pediu sua ajuda: "{helpMine.note}"
        <div className="btns"><button className="cta sm" disabled={busy} onClick={() => run(() => L.act.answerHelp(helpMine.id, true, null))}>Ajudar</button>
          <button className="ghost sm" onClick={() => setMode({ refuse: 'help', id: helpMine.id })}>Recusar</button></div></div>}
      {mode && typeof mode === 'object' && <div className="stack" style={{ gap: 6 }}>
        <label className="lbl" htmlFor="rj">Por que você está recusando?</label>
        <textarea id="rj" value={text} onChange={e => setText(e.target.value)} placeholder="Ex.: estou fechando outra entrega até as 17h" autoFocus />
        <div className="btns"><button className="cta sm" disabled={busy || text.trim().length < 3} onClick={() => run(() => mode.refuse === 'transfer' ? L.act.answerTransfer(mode.id, false, text.trim()) : L.act.answerHelp(mode.id, false, text.trim()))}>Enviar recusa</button>
          <button className="ghost sm" onClick={() => setMode(null)}>Cancelar</button></div></div>}

      {/* votação */}
      {contest && <div className={'note' + (open ? ' action' : '')}>
        <b>{open ? 'Em votação' : contest.status === 'aprovada' ? 'Sugestão aprovada' : 'Sugestão recusada'}</b> · {L.nameOf(contest.by_user)} sugeriu: "{contest.text}"
        <div className="small" style={{ marginTop: 4 }}>{votes.filter(v => v.vote).length} a favor ({votes.filter(v => v.vote).map(v => L.nameOf(v.user_id)).join(', ') || '—'}) · {votes.filter(v => !v.vote).length} contra{votes.some(v => !v.vote) ? ` (${votes.filter(v => !v.vote).map(v => L.nameOf(v.user_id)).join(', ')})` : ''}</div>
        {open && membro && !voted && <div className="btns" style={{ marginTop: 6 }}><button className="cta sm" disabled={busy} onClick={() => run(() => L.act.voteContest(open.id, true))}>Votar a favor</button><button className="ghost sm" disabled={busy} onClick={() => run(() => L.act.voteContest(open.id, false))}>Votar contra</button></div>}
        {open && <div className="small muted" style={{ marginTop: 4 }}>A tarefa fica travada até a maioria da equipe decidir.</div>}
      </div>}
      {transfer && transfer.to_user !== me.user_id && <div className="note">Transferência para <b>{L.nameOf(transfer.to_user)}</b> aguardando resposta.</div>}
      {helps.length > 0 && <div className="note">{helps.map(h => <div key={h.id}>{L.nameOf(h.to_user)}: {h.status === 'pendente' ? 'pedido enviado' : h.status === 'aceita' ? 'está ajudando' : `recusou${h.justification ? ` ("${h.justification}")` : ''}`}</div>)}</div>}

      {/* ações */}
      {membro && mode === null && <div className="btns">
        {t.col === 'afazer' && <button className="cta" disabled={busy || !!open} onClick={() => run(() => L.act.startTask(t.id))}>{pi >= 0 ? `Iniciar etapa ${etapaName(t.etapa)}` : 'Iniciar tarefa'}</button>}
        {t.col === 'afazer' && !open && <button className="ghost" onClick={() => setMode('contest')}>Contestar com sugestão</button>}
        {mineNow && <button className="cta" disabled={busy} onClick={() => run(() => L.act.completeTask(t.id), true)}>{next ? `Concluir etapa ${etapaName(t.etapa)}` : 'Concluir tarefa'}</button>}
        {mineNow && !active && <button className="ghost" disabled={busy} onClick={() => run(() => L.act.setActiveTask(t.id))}>Executar agora</button>}
        {mineNow && !transfer && <button className="ghost" onClick={() => setMode('transfer')}>Transferir</button>}
        {mineNow && <button className="ghost" onClick={() => setMode('help')}>Pedir ajuda</button>}
        {mineNow && <button className="ghost" disabled={busy} onClick={() => run(() => L.act.returnTask(t.id))}>Devolver para A fazer</button>}
        {talkTo && onChat && <button className="ghost" onClick={() => onChat(talkTo, t.id)}>Conversar com {L.nameOf(talkTo)}</button>}
        {canDelete && <button className="danger" disabled={busy} onClick={() => confirm('Excluir esta tarefa?') && run(() => L.act.deleteTask(t.id), true)}>Excluir</button>}
      </div>}
      {!membro && talkTo && onChat && <div className="btns"><button className="ghost" onClick={() => onChat(talkTo, t.id)}>Conversar com {L.nameOf(talkTo)}</button></div>}
      {next && mineNow && mode === null && <p className="small muted">Ao concluir, a tarefa volta para A fazer na etapa {next}, vinculada a você, mas qualquer pessoa pode pegar.</p>}

      {mode === 'contest' && <div className="stack" style={{ gap: 6 }}>
        <label className="lbl" htmlFor="ct">Sua sugestão</label>
        <textarea id="ct" value={text} onChange={e => setText(e.target.value)} placeholder="Explique como fazer diferente e por quê" autoFocus />
        <p className="small muted">A equipe vota. Se a maioria aprovar, a sugestão entra na descrição da tarefa.</p>
        <div className="btns"><button className="cta sm" disabled={busy || text.trim().length < 3} onClick={() => run(() => L.act.contestTask(t.id, text.trim()))}>Enviar para votação</button><button className="ghost sm" onClick={() => setMode(null)}>Cancelar</button></div></div>}
      {(mode === 'transfer' || mode === 'help') && <div className="stack" style={{ gap: 6 }}>
        <span className="lbl">{mode === 'transfer' ? 'Transferir para' : 'Pedir ajuda para'}</span>
        <div className="picks">{team.map(m => {
          const on = to.includes(m.user_id);
          return <button key={m.user_id} type="button" className="opt" aria-pressed={on}
            onClick={() => setTo(mode === 'transfer' ? [m.user_id] : on ? to.filter(x => x !== m.user_id) : [...to, m.user_id])}>
            <Avatar avatar={L.look(m)} size={24} /><span><b style={{ fontSize: 13 }}>{m.display_name}</b><br />{L.view(m.user_id)?.online ? 'online' : 'offline'}</span></button>;
        })}</div>
        {mode === 'help' && <><label className="lbl" htmlFor="hn">No que você precisa de ajuda?</label><textarea id="hn" value={text} onChange={e => setText(e.target.value)} placeholder="Obrigatório" /></>}
        <div className="btns"><button className="cta sm" disabled={busy || !to.length || (mode === 'help' && text.trim().length < 3)}
          onClick={() => run(() => mode === 'transfer' ? L.act.requestTransfer(t.id, to[0]) : L.act.requestHelp(t.id, to, text.trim()))}>{mode === 'transfer' ? 'Pedir transferência' : 'Pedir ajuda'}</button>
          <button className="ghost sm" onClick={() => setMode(null)}>Cancelar</button></div>
        {mode === 'transfer' && <p className="small muted">A pessoa precisa aceitar. Se recusar, ela explica o motivo.</p>}</div>}

      {events.length > 0 && <div><div className="lbl" style={{ marginBottom: 6 }}>Histórico</div>
        <ul className="hist">{events.slice().reverse().map(e => <li key={e.id}><span className="mono small muted">{new Date(e.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><span>{e.actor ? <b>{L.nameOf(e.actor)} </b> : null}{e.text.replace(/ (roteiro|captacao|edicao|finalizacao)$/, (_, k) => ' ' + etapaName(k))}</span></li>)}</ul></div>}
    </Modal>
  );
}
