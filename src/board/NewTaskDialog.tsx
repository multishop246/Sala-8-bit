import { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { useLive } from '../live/LiveProvider';
import { useWs } from '../lib/workspace';
import {
  addDays, areaMembers, capCheck, catOf, dow, estimate, fmtD, fmtDay, hasPhases, minToHHMM, nextFree, slotsFor, teamLabel, todayISO
} from './logic';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function NewTaskDialog({ onClose, preset }: { onClose: () => void; preset?: { dirTo?: string } }) {
  const { ws, members, catalog } = useWs();
  const L = useLive();
  const cat = useMemo(() => catOf(catalog), [catalog]);
  const team = members.filter(m => m.kind === 'membro' && m.consent_at);
  const areas = cat.areas.filter(a => a.active);
  const linhas = cat.linhas.filter(l => l.active);
  const [title, setTitle] = useState('');
  const [line, setLine] = useState(linhas.length === 1 ? linhas[0].id : '');
  const [area, setArea] = useState(areas[0]?.id || '');
  const [type, setType] = useState('');
  const [desc, setDesc] = useState('');
  const [dirTo, setDirTo] = useState(preset?.dirTo || '');
  const [due, setDue] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tipos = cat.tipos.filter(t => t.parent_id === area && t.active);
  const grupos = [...new Set(tipos.map(t => t.grupo || 'Geral'))];
  const who = areaMembers(cat, area, team);
  const etapa = hasPhases(cat, area) ? 'roteiro' : null;
  const est = estimate(L.board, cat, area, type || null, etapa, dirTo || null);
  const today = todayISO();
  const check = (d: string) => capCheck(L.board, cat, team, ws.settings, area, dirTo || null, d, est.min);
  const sel = due ? check(due) : null;
  const suggestion = due && sel && !sel.fits ? nextFree(L.board, cat, team, ws.settings, area, dirTo || null, due, est.min) : null;
  const slots = slotsFor(team, dirTo || null, who);
  const nowMin = new Date(L.now).getHours() * 60 + new Date(L.now).getMinutes();
  const needDesc = tipos.length === 0;
  const valid = title.trim().length >= 2 && line && area && (needDesc ? desc.trim().length >= 3 : !!type) && due && sel?.fits;

  const submit = async () => {
    setBusy(true);
    const ok = await L.act.createTask({ title: title.trim(), description: desc.trim(), line_id: line, area_id: area, type_id: type || null, dir_to: dirTo || null, due_date: due!, due_time: time, est_min: est.min });
    if (ok) onClose(); else setBusy(false);
  };

  return (
    <Modal title="Criar tarefa" onClose={onClose} wide>
      <div className="field"><label htmlFor="nt">Título</label><input id="nt" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Ex.: Carrossel do lançamento" autoFocus /></div>
      <div className="cols2">
        <div className="field"><label htmlFor="nl">{ws.settings.rotulo_linha || 'Linha'}</label>
          <select id="nl" value={line} onChange={e => setLine(e.target.value)}><option value="">Escolha…</option>{linhas.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div className="field"><label htmlFor="na">Área</label>
          <select id="na" value={area} onChange={e => { setArea(e.target.value); setType(''); setDirTo(''); setDue(null); setTime(null); }}>{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      </div>
      {tipos.length > 0 && <div className="field"><label htmlFor="ny">Tipo</label>
        <select id="ny" value={type} onChange={e => setType(e.target.value)}><option value="">Escolha…</option>
          {grupos.map(g => <optgroup key={g} label={g}>{tipos.filter(t => (t.grupo || 'Geral') === g).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}</select></div>}
      <div className="field"><label htmlFor="nd">{needDesc ? 'Observação' : 'Observação (opcional)'}</label>
        <textarea id="nd" value={desc} onChange={e => setDesc(e.target.value)} maxLength={4000} placeholder={needDesc ? 'Descreva o que precisa ser feito' : 'Detalhes, links, referências…'} /></div>
      <div className="field"><label htmlFor="np">Para quem</label>
        <select id="np" value={dirTo} onChange={e => { setDirTo(e.target.value); setDue(null); setTime(null); }}>
          <option value="">{teamLabel(cat, area)}{etapa ? '' : ' (quem pegar primeiro)'}</option>
          {who.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
        </select></div>
      {etapa && <p className="small muted">Vídeo começa no <b>Roteiro</b> e passa por Captação, Edição e Finalização. A cada etapa concluída a tarefa volta para A fazer, vinculada a quem fez.</p>}
      <div className="cols2">
        <div className="field"><span className="lbl">Data de entrega</span>
          <Calendar value={due} onPick={d => { setDue(d); setTime(null); }} isDisabled={d => d < today || dow(d) === 0 || !check(d).fits} label={d => { const c = check(d); return c.closed ? 'sem expediente' : !c.fits ? 'lotado' : ''; }} /></div>
        <div className="field"><span className="lbl">Horário</span>
          <div className="timeg">
            <button type="button" className="tslot" aria-pressed={time === null} onClick={() => setTime(null)}>Ao longo do dia</button>
            {slots.map(m => { const past = due === today && m <= nowMin; return <button key={m} type="button" className="tslot" disabled={!due || past} aria-pressed={time === minToHHMM(m)} onClick={() => setTime(minToHHMM(m))}>{minToHHMM(m)}</button>; })}
          </div>
          <span className="small muted">Só os horários de trabalho de {dirTo ? L.nameOf(dirTo) : 'quem atende a área'}.</span></div>
      </div>
      <div className="note">
        Tempo estimado: <b>{fmtD(est.min)}</b> ({est.src}).
        {due && sel && (sel.fits ? <> Em {fmtDay(due)} {dirTo ? L.nameOf(dirTo) : teamLabel(cat, area)} ainda tem <b>{fmtD(sel.free)}</b> livres.</>
          : <span className="err"> {fmtDay(due)} está lotado. {suggestion ? <button type="button" className="linkbtn" onClick={() => setDue(suggestion)}>Usar {fmtDay(suggestion)}</button> : 'Escolha outro dia.'}</span>)}
      </div>
      <div className="btns"><button className="cta" disabled={!valid || busy} onClick={submit}>{busy ? 'Criando…' : 'Criar tarefa'}</button><button className="ghost" onClick={onClose}>Cancelar</button></div>
    </Modal>
  );
}

export function Calendar({ value, onPick, isDisabled, label }: { value: string | null; onPick: (d: string) => void; isDisabled: (d: string) => boolean; label?: (d: string) => string }) {
  const today = todayISO();
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const first = month + '-01';
  const start = addDays(first, -dow(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const [y, m] = month.split('-').map(Number);
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); setMonth(d.toLocaleDateString('sv-SE').slice(0, 7)); };
  return (
    <div className="cal">
      <div className="calhd"><button type="button" className="ghost sm" onClick={() => shift(-1)} disabled={month <= today.slice(0, 7)} aria-label="Mês anterior">‹</button>
        <b>{MONTHS[m - 1]} {y}</b><button type="button" className="ghost sm" onClick={() => shift(1)} aria-label="Próximo mês">›</button></div>
      <div className="calg">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i} className="cwd">{d}</span>)}
        {days.map(d => {
          const out = d.slice(0, 7) !== month, dis = isDisabled(d), l = !dis || d < today ? '' : label?.(d) || '';
          return <button key={d} type="button" className={'cday' + (out ? ' out' : '') + (d === today ? ' today' : '')} disabled={dis} aria-pressed={value === d} title={l || undefined} onClick={() => onPick(d)}>{Number(d.slice(8))}</button>;
        })}</div>
    </div>
  );
}
