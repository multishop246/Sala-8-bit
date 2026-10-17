import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../game/Avatar';
import * as live from '../lib/live';
import type { DayApp, DaySummary } from '../lib/types';
import { CAT_COLOR } from '../game/Room';
import { STATE_COLOR, STATE_LABEL, todayStr, useLive } from '../live/LiveProvider';
import { useWs } from '../lib/workspace';
import { capOf, catOf, fmtD, loadOf } from '../board/logic';

export function DayPanel() {
  const { ws, me, members, catalog } = useWs();
  const L = useLive();
  const cat = useMemo(() => catOf(catalog), [catalog]);
  const [rows, setRows] = useState<DaySummary[] | null>(null);
  const [err, setErr] = useState('');
  const day = todayStr();
  useEffect(() => {
    const load = () => live.daySummary(ws.id, day).then(setRows).catch(e => setErr(e.message));
    load();
    const i = window.setInterval(load, 30000);
    return () => window.clearInterval(i);
  }, [ws.id, day]);
  const canAll = me.is_admin || me.kind === 'gestor';
  const [who, setWho] = useState<string>(me.kind === 'membro' ? me.user_id : '');
  const [apps, setApps] = useState<DayApp[] | null>(null);
  useEffect(() => {
    if (!who) { setApps(null); return; }
    live.dayApps(ws.id, who, day).then(setApps).catch(() => setApps([]));
  }, [ws.id, who, day, rows]);
  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p className="muted">Carregando o painel…</p>;
  const team = members.filter(m => m.kind === 'membro' && m.consent_at);
  const budget = ws.settings.cafe_min ?? 15;
  const aprov = (r?: DaySummary) => { if (!r || !r.rastreado_min) return null; const base = r.produtivo_min - r.bonus_ia_min, den = base + r.com_min + r.dis_min + r.ocioso_min; return den ? Math.min(100, Math.round(base / den * 100)) : null; };
  const anyApp = rows.some(r => r.rastreado_min > 0);
  const sum = (k: keyof DaySummary) => rows.filter(r => team.some(m => m.user_id === r.user_id)).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return (
    <div className="stack">
      <div className="kpis">
        <div><span>Tempo em tarefas</span><b>{fmtD(sum('tarefa_min'))}</b></div>
        <div><span>Entregas hoje</span><b>{sum('entregas')}</b></div>
        <div><span>Em reunião</span><b>{fmtD(sum('reuniao_min'))}</b></div>
        <div><span>Ajudas aceitas</span><b>{sum('ajudas')}</b></div>
        {anyApp && <div><span>Tempo produtivo</span><b>{fmtD(sum('produtivo_min'))}</b></div>}
      </div>
      <div className="tablewrap"><table className="daytable" style={{ minWidth: anyApp ? 1280 : 760 }}>
        <thead><tr><th>Pessoa</th><th>Agora</th>{anyApp && <><th>Produtivo</th><th title="Pinterest, YouTube, Behance…">Referência</th><th>Comunicação</th><th>Distração</th><th>Ocioso</th><th title="Minutos com agentes de IA rodando (e o bônus do multiplicador)">Com IA</th><th>Aproveitamento</th></>}<th>Em tarefas</th><th>Reunião</th><th>Café</th><th>Almoço</th><th>Entregas</th><th>Ajudas</th><th>Carga de hoje</th></tr></thead>
        <tbody>{team.map(m => {
          const r = rows.find(x => x.user_id === m.user_id), v = L.view(m.user_id);
          const cap = capOf(m, day, ws.settings), load = loadOf(L.board, cat, m.user_id, day);
          const over = (r?.cafe_min || 0) > budget;
          return <tr key={m.user_id}>
            <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar avatar={L.look(m)} size={22} /><b>{m.display_name}</b></div></td>
            <td><span className="state"><i style={{ background: v && v.shown !== 'fora' && v.shown !== 'encerrado' ? STATE_COLOR[v.shown] : '#555c70' }} />{v ? (v.shown === 'pausa_gestor' ? `Pausa, ${L.gestorName}` : STATE_LABEL[v.shown]) : '—'}</span></td>
            {anyApp && (r?.rastreado_min ? <>
              <td className="mono">{fmtD(r.produtivo_min)}</td><td className="mono">{fmtD(r.ref_min)}</td><td className="mono">{fmtD(r.com_min)}</td>
              <td className="mono">{fmtD(r.dis_min)}</td><td className="mono">{fmtD(r.ocioso_min)}</td>
              <td className="mono" style={{ color: '#7fe3e9' }}>{fmtD(r.ia_min)}{r.bonus_ia_min ? ` +${fmtD(r.bonus_ia_min)}` : ''}</td>
              <td>{aprov(r) !== null ? <div className="meter"><span><i style={{ width: `${aprov(r)}%`, background: 'var(--accent)' }} /></span><b className="mono small">{aprov(r)}%</b></div> : '—'}</td>
            </> : <td colSpan={7} className="small muted">sem o app de computador</td>)}
            <td className="mono">{fmtD(r?.tarefa_min || 0)}</td>
            <td className="mono">{fmtD(r?.reuniao_min || 0)}</td>
            <td className="mono">{r?.cafe_min || 0}/{budget} min{over && <span className="late"> +{(r?.cafe_min || 0) - budget}</span>}</td>
            <td className="mono">{r?.almoco_min ? fmtD(r.almoco_min) : '—'}</td>
            <td className="mono">{r?.entregas || 0}</td>
            <td className="mono">{r?.ajudas || 0}</td>
            <td><div className="meter"><span><i style={{ width: `${cap ? Math.min(100, load / cap * 100) : 100}%`, background: load > cap ? 'var(--dis)' : 'var(--prod)' }} /></span><b className="mono small">{fmtD(load)} / {fmtD(cap)}</b></div></td>
          </tr>;
        })}</tbody>
      </table></div>
      <p className="small muted" style={{ maxWidth: '80ch' }}>Produtivo = apps das funções + referência criativa + reuniões + pausa do gestor + agentes de IA trabalhando enquanto a pessoa está longe do teclado. Com 2 ou mais agentes rodando, cada agente extra soma +0,5× (o bônus aparece em "Com IA"). Aproveitamento = produtivo ÷ (produtivo + comunicação + distração + ocioso). "Em tarefas" é o cronômetro das tarefas do quadro. As colunas do app só aparecem para quem usa o app de computador.</p>
      {(me.kind === 'membro' || canAll) && <div className="panel" style={{ background: 'var(--deep)' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>{who === me.user_id ? 'Seus apps hoje' : 'Apps hoje'}</h3>
          {canAll && <select value={who} onChange={e => setWho(e.target.value)} aria-label="Pessoa">
            {me.kind === 'gestor' && <option value="">Escolha…</option>}
            {team.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}{m.user_id === me.user_id ? ' (você)' : ''}</option>)}</select>}
        </div>
        {!who ? null : !apps ? <p className="small muted">Carregando…</p> : !apps.length ? <p className="small muted">Nada registrado hoje. Os apps aparecem aqui quando a pessoa usa o app de computador.</p> :
          <div className="applist">{apps.map(a => <div key={a.app + a.category}><span><i className="dot" style={{ background: CAT_COLOR[a.category] || '#888' }} /> {a.app} <span className="small muted">· {CATNAME[a.category] || a.category}</span></span><b className="mono">{fmtD(a.minutes)}</b></div>)}</div>}
        {who === me.user_id && <p className="small muted" style={{ marginTop: 8 }}>Isto é tudo o que o app registra sobre você: o nome do app (o navegador aparece só como "Navegando na internet") e a categoria, minuto a minuto.</p>}
      </div>}
    </div>
  );
}

const CATNAME: Record<string, string> = { prod: 'produtivo', ref: 'referência criativa', com: 'comunicação', dis: 'distração', idle: 'ocioso', ia: 'IA trabalhando', meet: 'reunião', gestor: 'pausa do gestor', pausa: 'pausa' };
