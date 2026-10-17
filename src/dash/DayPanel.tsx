import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../game/Avatar';
import * as live from '../lib/live';
import type { DaySummary } from '../lib/types';
import { STATE_COLOR, STATE_LABEL, todayStr, useLive } from '../live/LiveProvider';
import { useWs } from '../lib/workspace';
import { capOf, catOf, fmtD, loadOf } from '../board/logic';

export function DayPanel() {
  const { ws, members, catalog } = useWs();
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
  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p className="muted">Carregando o painel…</p>;
  const team = members.filter(m => m.kind === 'membro' && m.consent_at);
  const budget = ws.settings.cafe_min ?? 15;
  const sum = (k: keyof DaySummary) => rows.filter(r => team.some(m => m.user_id === r.user_id)).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return (
    <div className="stack">
      <div className="kpis">
        <div><span>Tempo em tarefas</span><b>{fmtD(sum('tarefa_min'))}</b></div>
        <div><span>Entregas hoje</span><b>{sum('entregas')}</b></div>
        <div><span>Em reunião</span><b>{fmtD(sum('reuniao_min'))}</b></div>
        <div><span>Ajudas aceitas</span><b>{sum('ajudas')}</b></div>
      </div>
      <div className="tablewrap"><table style={{ minWidth: 760 }}>
        <thead><tr><th>Pessoa</th><th>Agora</th><th>Em tarefas</th><th>Reunião</th><th>Café</th><th>Almoço</th><th>Entregas</th><th>Ajudas</th><th>Carga de hoje</th></tr></thead>
        <tbody>{team.map(m => {
          const r = rows.find(x => x.user_id === m.user_id), v = L.view(m.user_id);
          const cap = capOf(m, day, ws.settings), load = loadOf(L.board, cat, m.user_id, day);
          const over = (r?.cafe_min || 0) > budget;
          return <tr key={m.user_id}>
            <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar avatar={L.look(m)} size={22} /><b>{m.display_name}</b></div></td>
            <td><span className="state"><i style={{ background: v && v.shown !== 'fora' && v.shown !== 'encerrado' ? STATE_COLOR[v.shown] : '#555c70' }} />{v ? (v.shown === 'pausa_gestor' ? `Pausa, ${L.gestorName}` : STATE_LABEL[v.shown]) : '—'}</span></td>
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
      <p className="small muted" style={{ maxWidth: '80ch' }}>"Em tarefas" é o cronômetro das tarefas do quadro, que só corre enquanto a pessoa está trabalhando nelas. O café que passa do limite aparece em vermelho. O tempo por aplicativo (produtivo, referência criativa, distração e ocioso) chega com o app de computador, na versão 0.5.</p>
    </div>
  );
}
