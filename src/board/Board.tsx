import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useLive } from '../live/LiveProvider';
import { useToast } from '../components/Toast';
import { useWs } from '../lib/workspace';
import type { Col, Task } from '../lib/types';
import { ETAPAS, catOf, etapaIdx, etapaName, fmtD, fmtDue, overdue, spentMin, teamAvg, teamLabel, todayISO, type Cat } from './logic';
import { NewTaskDialog } from './NewTaskDialog';
import { TaskDialog } from './TaskDialog';

const COLS: [Col, string, string][] = [['afazer', 'A fazer', '#ef5a6f'], ['fazendo', 'Fazendo', '#f2c94c'], ['feito', 'Feito hoje', '#5ad18a']];

export function Board({ openTask, setOpenTask, onChat, showAll = false }: { openTask: string | null; setOpenTask: (id: string | null) => void; onChat?: (userId: string, taskId: string) => void; showAll?: boolean }) {
  const { ws, me, members, catalog } = useWs();
  const L = useLive();
  const toast = useToast();
  const cat = useMemo(() => catOf(catalog), [catalog]);
  const [lineF, setLineF] = useState('');
  const [personF, setPersonF] = useState('');
  const [creating, setCreating] = useState(false);
  const team = members.filter(m => m.kind === 'membro' && m.consent_at);
  const isMembro = me.kind === 'membro';
  const b = L.board;
  const today = todayISO();
  const involves = (t: Task, id: string) => t.owner === id || (!t.owner && (t.dir_to === id || t.linked_to === id)) || (!t.owner && t.creator === id)
    || b.help.some(h => h.task_id === t.id && h.to_user === id && h.status !== 'recusada' && h.status !== 'cancelada')
    || b.transfers.some(x => x.task_id === t.id && x.to_user === id && x.status === 'pendente');
  const rank = (t: Task) => {
    if (!isMembro) return 0;
    if (t.owner === me.user_id) return 0;
    if (involves(t, me.user_id)) return 1;
    if (t.creator === me.user_id) return 2;
    return 3;
  };
  const visible = (col: Col) => b.tasks
    .filter(t => t.col === col && (showAll || col !== 'feito' || (t.done_at && new Date(t.done_at).toLocaleDateString('sv-SE') === today)))
    .filter(t => !lineF || t.line_id === lineF)
    .filter(t => !personF || involves(t, personF))
    .map((t, i) => [t, i] as const).sort((x, y) => rank(x[0]) - rank(y[0]) || (x[0].due_date + (x[0].due_time || '99')).localeCompare(y[0].due_date + (y[0].due_time || '99')) || x[1] - y[1]).map(x => x[0]);

  const move = async (id: string, to: Col) => {
    const t = b.tasks.find(x => x.id === id); if (!t || t.col === to) return;
    if (!isMembro) { toast('O gestor só acompanha o quadro.'); return; }
    if (t.col === 'afazer' && to === 'fazendo') await L.act.startTask(id);
    else if (t.col === 'fazendo' && to === 'feito') {
      if (t.owner !== me.user_id) { toast('Só quem está executando pode concluir.'); return; }
      const ok = await L.act.completeTask(id);
      if (ok) toast(t.etapa && t.etapa !== 'finalizacao' ? `Etapa concluída · voltou para A fazer em ${etapaName(ETAPAS[etapaIdx(t.etapa) + 1][0])}` : 'Tarefa concluída');
    } else if (t.col === 'fazendo' && to === 'afazer') {
      if (t.owner !== me.user_id) { toast('Só quem está executando pode devolver.'); return; }
      await L.act.returnTask(id);
    } else toast(t.col === 'afazer' ? 'Inicie a tarefa antes de concluir.' : 'Tarefas concluídas não voltam.');
  };
  const drag = useDrag(move);

  return (
    <div>
      <div className="boardbar">
        {isMembro && <button className="cta" onClick={() => setCreating(true)}>+ Criar tarefa</button>}
        <label className="lbl" htmlFor="bfl">{ws.settings.rotulo_linha || 'Linha'}</label>
        <select id="bfl" value={lineF} onChange={e => setLineF(e.target.value)}><option value="">Todas</option>{cat.linhas.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <label className="lbl" htmlFor="bfp">Colaborador</label>
        <select id="bfp" value={personF} onChange={e => setPersonF(e.target.value)}><option value="">Todos</option>{team.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}{m.user_id === me.user_id ? ' (você)' : ''}</option>)}</select>
        <span className="small muted">{isMembro ? 'Suas tarefas aparecem primeiro · arraste os cards entre as colunas' : 'Você acompanha o quadro da equipe'}</span>
      </div>
      {cat.linhas.length === 0 && <div className="note" style={{ marginBottom: 12 }}>Antes de criar tarefas, o administrador cadastra as {(ws.settings.rotulo_linha || 'linha').toLowerCase()}s em Configurações → Funções e tarefas.</div>}
      <div className="kanban">
        {COLS.map(([k, n, c]) => {
          const ts = visible(k);
          return (
            <div key={k} className="col" data-col={k}>
              <h3><span className="dot" style={{ background: c }} />{showAll && k === 'feito' ? 'Feito' : n} · {ts.length}</h3>
              {ts.map(t => <Card key={t.id} t={t} cat={cat} onOpen={() => { if (!drag.justDragged()) setOpenTask(t.id); }} onDown={e => isMembro && drag.down(e, t.id)} />)}
              {!ts.length && <span className="small muted">Vazio</span>}
            </div>);
        })}
      </div>
      {creating && <NewTaskDialog onClose={() => setCreating(false)} />}
      {openTask && <TaskDialog id={openTask} onClose={() => setOpenTask(null)} onChat={onChat} />}
    </div>
  );
}

export function Card({ t, cat, onOpen, onDown, compact }: { t: Task; cat: Cat; onOpen: () => void; onDown?: (e: RPointerEvent) => void; compact?: boolean }) {
  const { me, members } = useWs();
  const L = useLive();
  const b = L.board;
  const owner = members.find(m => m.user_id === (t.owner || t.creator));
  const color = (owner?.avatar as { oc?: string })?.oc || '#888';
  const mine = t.owner === me.user_id;
  const helping = b.help.some(h => h.task_id === t.id && h.to_user === me.user_id && h.status === 'aceita');
  const contest = b.contests.find(c => c.task_id === t.id && c.status === 'aberta');
  const transfer = b.transfers.find(x => x.task_id === t.id && x.status === 'pendente');
  const helpers = b.help.filter(h => h.task_id === t.id && h.status === 'aceita').map(h => L.nameOf(h.to_user));
  const vinc = me.kind === 'membro' && t.col !== 'feito' && (mine || helping || (!t.owner && (t.dir_to === me.user_id || t.linked_to === me.user_id)) || transfer?.to_user === me.user_id
    || b.help.some(h => h.task_id === t.id && h.to_user === me.user_id && h.status === 'pendente'));
  const area = t.area_id ? cat.byId.get(t.area_id) : undefined;
  const type = t.type_id ? cat.byId.get(t.type_id) : undefined;
  const line = t.line_id ? cat.byId.get(t.line_id) : undefined;
  const pi = etapaIdx(t.etapa);
  const active = L.view(t.owner || '')?.status?.active_task_id === t.id;
  const who = t.owner ? `Com ${L.nameOf(t.owner)}` : t.dir_to ? `Para ${L.nameOf(t.dir_to)}` : t.linked_to ? `Vinculada a ${L.nameOf(t.linked_to)}` : teamLabel(cat, t.area_id);
  const late = overdue(t, L.now);
  const done = t.col === 'feito';
  const badges: [string, string][] = [];
  if (mine) badges.push(['Sua', 'me']); else if (helping) badges.push(['Você ajuda', 'me']);
  if (contest) { const v = b.votes.filter(x => x.contest_id === contest.id); badges.push([`Em votação · ${v.filter(x => x.vote).length} a favor, ${v.filter(x => !x.vote).length} contra`, 'vote']); }
  if (transfer) badges.push([`Transferência para ${L.nameOf(transfer.to_user)}`, 'tr']);
  if (helpers.length) badges.push([`Ajuda: ${helpers.join(', ')}`, 'help']);
  if (late) badges.push(['Atrasada', 'late']);
  if (t.col === 'fazendo' && t.owner && !active) badges.push(['Pausada', 'paused']);
  return (
    <div className={'card' + (mine ? ' mine' : '') + (vinc ? ' vinc' : '')} role="button" tabIndex={0} data-task={t.id} style={{ borderLeftColor: color }}
      onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }} onPointerDown={onDown}>
      <span className="t">{t.title}</span>
      <div className="cchips">{line && <span className="chip2 line">{line.name}</span>}<span className="chip2">{area?.name || 'Sem área'}{type ? ' · ' + type.name : ''}</span></div>
      {pi >= 0 && <div className="phase">{ETAPAS.map(([k, n], i) => <i key={k} className={done || pi > i ? 'ok' : pi === i ? 'cur' : ''} title={n} />)}<em>{done ? 'Concluído' : `${etapaName(t.etapa)} · ${pi + 1} de 4`}</em></div>}
      {!compact && <div className="cfacts">
        <div><span>Entrega</span><b className={late ? 'late' : ''}>{done ? 'Entregue ' + (t.done_at ? new Date(t.done_at).toTimeString().slice(0, 5) : '') : fmtDue(t)}</b></div>
        <div><span>Tempo</span><b>{fmtD(spentMin(t, L.now))}{t.running_since ? <span className="rec" title="Cronômetro rodando"> ●</span> : null}</b></div>
        <div><span>Média equipe</span><b>{fmtD(teamAvg(b, cat, t))}</b></div>
      </div>}
      <div className="cfoot"><span>{who}</span><span>por {L.nameOf(t.creator)}</span></div>
      {badges.length > 0 && <div className="badges">{badges.map(([x, c]) => <span key={x} className={'bdg ' + c}>{x}</span>)}</div>}
    </div>
  );
}

// arrastar com o card acompanhando o ponteiro (mouse e toque)
function useDrag(onDrop: (id: string, to: Col) => void) {
  const just = useRef(false);
  const down = (e: RPointerEvent, id: string) => {
    if (e.button > 0) return;
    const c = e.currentTarget as HTMLElement;
    const sx = e.clientX, sy = e.clientY;
    let g: HTMLElement | null = null, ox = 0, oy = 0, lx = sx, over: HTMLElement | null = null, r0: DOMRect | null = null;
    const colAt = (x: number, y: number) => { if (g) g.style.visibility = 'hidden'; const el = document.elementFromPoint(x, y); if (g) g.style.visibility = ''; return (el?.closest('.col[data-col]') as HTMLElement) || null; };
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!g) {
        if (Math.hypot(dx, dy) < 6) return;
        if (ev.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) * 1.5) { cleanup(); return; }
        r0 = c.getBoundingClientRect(); ox = sx - r0.left; oy = sy - r0.top;
        g = c.cloneNode(true) as HTMLElement; g.classList.add('dghost'); g.removeAttribute('data-task');
        Object.assign(g.style, { width: r0.width + 'px', left: r0.left + 'px', top: r0.top + 'px', transform: 'rotate(2deg) scale(1.04)' });
        document.body.appendChild(g); c.classList.add('drag'); document.body.classList.add('grabbing');
      }
      ev.preventDefault();
      const tilt = Math.max(-7, Math.min(7, (ev.clientX - lx) * 0.6)); lx = ev.clientX;
      g.style.left = ev.clientX - ox + 'px'; g.style.top = ev.clientY - oy + 'px'; g.style.transform = `rotate(${2 + tilt}deg) scale(1.04)`;
      const col = colAt(ev.clientX, ev.clientY);
      if (col !== over) { over?.classList.remove('over'); over = col; col?.classList.add('over'); }
      if (ev.clientY > innerHeight - 40) scrollBy(0, 12); else if (ev.clientY < 40) scrollBy(0, -12);
    };
    const cleanup = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    const up = () => {
      cleanup();
      if (!g) return;
      just.current = true; setTimeout(() => { just.current = false; }, 80);
      document.body.classList.remove('grabbing'); over?.classList.remove('over');
      const to = over?.dataset.col as Col | undefined;
      const ghost = g;
      ghost.classList.add('fly');
      requestAnimationFrame(() => { Object.assign(ghost.style, { left: r0!.left + 'px', top: r0!.top + 'px', transform: 'none', opacity: to ? '0' : '1' }); });
      setTimeout(() => { ghost.remove(); c.classList.remove('drag'); }, 230);
      if (to) onDrop(id, to);
    };
    addEventListener('pointermove', mv, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  return { down, justDragged: () => just.current };
}
