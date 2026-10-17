// Diálogos da versão 0.4: SABADÃO, Instagram, sua mesa (roupa temática) e relatório do dia.
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { Avatar } from '../game/Avatar';
import { THEME, TITLES, themesNow } from '../game/themes';
import * as live from '../lib/live';
import { updateMember } from '../lib/data';
import type { Avatar as AvatarT } from '../lib/types';
import { todayStr, useLive } from '../live/LiveProvider';
import { useWs } from '../lib/workspace';
import { addDays, catOf, dow, fmtDay } from '../board/logic';
import { Card } from '../board/Board';
import { titleThemeOf } from '../glory/glory';
import { buildReport, reportName } from '../report/report';
import { canPickFolder, pickFolder, saveFile, savedFolderName } from '../report/save';

export const nextSaturday = () => { let d = todayStr(); while (dow(d) !== 6) d = addDays(d, 1); return d; };

export function SabadoDialog({ onClose }: { onClose: () => void }) {
  const { me, members } = useWs();
  const L = useLive();
  const [day, setDay] = useState(nextSaturday());
  const team = members.filter(m => m.kind === 'membro' && m.consent_at);
  const val = (u: string) => L.saturdays.find(s => s.user_id === u && s.day === day)?.works ?? null;
  const days = [0, 7, 14, 21].map(n => addDays(nextSaturday(), n));
  return (
    <Modal title="SABADÃO" onClose={onClose}>
      <p className="muted">Quem trabalha no sábado? Quem marcar folga tem as entregas daquele sábado levadas para segunda-feira automaticamente.</p>
      <div className="row">{days.map(d => <button key={d} className="opt" style={{ padding: '6px 12px' }} aria-pressed={d === day} onClick={() => setDay(d)}>{fmtDay(d)}</button>)}</div>
      <div className="list">{team.map(m => {
        const v = val(m.user_id), can = m.user_id === me.user_id || me.is_admin;
        return <div key={m.user_id} className="item">
          <span className="row" style={{ flexWrap: 'nowrap' }}><Avatar avatar={L.look(m)} size={24} /><b>{m.display_name}</b><span className={'small ' + (v === true ? 'ok' : v === false ? 'err' : 'muted')}>{v === true ? 'trabalha' : v === false ? 'folga' : 'não marcou'}</span></span>
          {can ? <span className="btns"><button className={v === true ? 'cta sm' : 'ghost sm'} onClick={() => L.act.setSaturday(m.user_id, day, true)}>Trabalho</button><button className={v === false ? 'cta sm' : 'ghost sm'} onClick={() => L.act.setSaturday(m.user_id, day, false)}>Folga</button></span> : <span />}
        </div>;
      })}</div>
      <p className="small muted">No sábado cada pessoa que trabalha tem 4 horas de capacidade para entregas.</p>
    </Modal>
  );
}

export function InstagramDialog({ onClose }: { onClose: () => void }) {
  const { me } = useWs();
  const L = useLive();
  const ig = L.instagram;
  const [handle, setHandle] = useState(ig?.handle || '');
  const [f, setF] = useState(String(ig?.followers ?? ''));
  const next = (Math.floor((ig?.followers || 0) / 100) + 1) * 100;
  return (
    <Modal title="Instagram" onClose={onClose}>
      <div className="kv">
        <div><span>Seguidores</span><b>{(ig?.followers || 0).toLocaleString('pt-BR')}</b></div>
        <div><span>Faltam para {next.toLocaleString('pt-BR')}</span><b>{next - (ig?.followers || 0)}</b></div>
      </div>
      <p className="small muted">{ig?.handle ? `${ig.handle} · ` : ''}{ig ? `atualizado ${new Date(ig.updated_at).toLocaleString('pt-BR')} (${ig.source === 'api' ? 'automático' : 'manual'})` : 'Ainda não configurado.'} A cada 100 seguidores novos, cai confete na sala.</p>
      {me.is_admin && <div className="stack" style={{ gap: 8 }}>
        <div className="row">
          <div className="field" style={{ flex: '1 1 160px' }}><label htmlFor="igh">Perfil</label><input id="igh" value={handle} onChange={e => setHandle(e.target.value)} placeholder="@suamarca" /></div>
          <div className="field" style={{ flex: '1 1 120px' }}><label htmlFor="igf">Seguidores</label><input id="igf" type="number" min={0} value={f} onChange={e => setF(e.target.value)} /></div>
        </div>
        <div><button className="cta sm" disabled={f === '' || Number(f) < 0} onClick={() => L.act.setInstagram(handle, Number(f))}>Atualizar</button></div>
        <p className="small muted">Para atualizar sozinho, siga "Instagram automático" em docs/INSTALACAO.md (precisa de conta profissional ligada a uma página do Facebook).</p>
      </div>}
    </Modal>
  );
}

export function MyDeskDialog({ onClose }: { onClose: () => void }) {
  const { ws, me, catalog, reload } = useWs();
  const L = useLive();
  const cat = useMemo(() => catOf(catalog), [catalog]);
  const [busy, setBusy] = useState(false);
  const av = me.avatar as AvatarT;
  const title = L.titles[me.user_id];
  const opts: { id: string | null; n: string }[] = [{ id: null, n: 'Roupa de sempre' }];
  if (ws.settings.recursos?.datas_comemorativas) themesNow(new Date(L.now)).forEach(t => opts.push({ id: t.id, n: t.n }));
  if (title && ws.settings.recursos?.mural_gloria) opts.push({ id: titleThemeOf(title), n: THEME[titleThemeOf(title)].n });
  const current = L.look(me).theme || null;
  const active = L.view(me.user_id)?.status?.active_task_id;
  const t = L.board.tasks.find(x => x.id === active && x.col === 'fazendo');
  const pick = async (id: string | null) => {
    setBusy(true);
    try { await updateMember(ws.id, me.user_id, { avatar: { ...av, theme: id } }); await reload(); } finally { setBusy(false); }
  };
  return (
    <Modal title="Sua mesa" onClose={onClose}>
      <div className="nowtask"><span className="lbl">Executando agora</span>{t ? <Card t={t} cat={cat} compact onOpen={() => {}} /> : <p className="small muted">Nenhuma tarefa em execução.</p>}</div>
      {title && <div className="note">★ Você é <b>{TITLES[title].n}</b> este mês. A plaquinha dourada está na sua mesa.</div>}
      <div><span className="lbl">Roupa temática</span>
        <div className="grid4" style={{ marginTop: 6 }}>{opts.map(o => (
          <button key={o.id || 'normal'} className="opt" disabled={busy} aria-pressed={current === o.id} onClick={() => pick(o.id)}>
            <Avatar avatar={{ ...L.look(me), theme: o.id }} stand size={36} />{o.n}</button>))}</div>
        {opts.length === 1 && <p className="small muted" style={{ marginTop: 6 }}>Não há roupa temática neste mês. Em outubro tem Outubro Rosa (e Halloween a partir do dia 25), em dezembro tem Natal, em junho e julho tem festa junina, e assim por diante.</p>}
        <p className="small muted" style={{ marginTop: 6 }}>Cada pessoa da equipe ganha uma variação diferente. A cor dos seus cards não muda.</p>
      </div>
    </Modal>
  );
}

/** Gera o PDF do dia e salva na pasta escolhida (ou baixa). */
export function ReportDialog({ onClose, ended }: { onClose: () => void; ended: boolean }) {
  const { ws, me, catalog } = useWs();
  const L = useLive();
  const [folder, setFolder] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [msg, setMsg] = useState('');
  useEffect(() => { savedFolderName().then(setFolder); }, []);
  const day = todayStr();
  const name = reportName(day, me.display_name || 'Relatório');
  const go = async () => {
    setState('busy');
    try {
      const [sum, log] = await Promise.all([live.daySummary(ws.id, day), live.myTimeLog(ws.id, me.user_id, day)]);
      const blob = await buildReport({ ws, me, day, summary: sum.find(s => s.user_id === me.user_id), timeLog: log, board: L.board, catalog, endedAt: ended ? new Date() : null });
      const r = await saveFile(blob, name);
      setMsg(r.where === 'pasta' ? `Salvo na pasta "${r.folder}".` : 'O arquivo foi baixado.');
      setState('done');
    } catch (e) { setMsg((e as Error).message); setState('idle'); }
  };
  return (
    <Modal title="Relatório do dia" onClose={onClose}>
      {ended && <p className="ok">Expediente encerrado. Até amanhã!</p>}
      <p className="muted">O relatório traz o tempo em cada tarefa, as entregas, reuniões, pausas e a colaboração do dia, em PDF.</p>
      <div className="note">Arquivo: <b>{name}</b><br />
        {canPickFolder() ? <>Pasta: <b>{folder || 'nenhuma escolhida (vai para Downloads)'}</b> <button className="linkbtn" onClick={async () => { const f = await pickFolder(); if (f) setFolder(f); }}>{folder ? 'Trocar pasta' : 'Escolher pasta'}</button></>
          : <>Neste navegador o arquivo vai para a pasta de Downloads. No Chrome ou no Edge do computador dá para escolher a pasta; no app de computador (versão 0.5) ele salva sozinho na pasta do cadastro.</>}
      </div>
      {msg && <p className={state === 'done' ? 'ok' : 'err'}>{msg}</p>}
      <div className="btns"><button className="cta" disabled={state === 'busy'} onClick={go}>{state === 'busy' ? 'Gerando…' : state === 'done' ? 'Gerar de novo' : 'Gerar relatório'}</button><button className="ghost" onClick={onClose}>Fechar</button></div>
    </Modal>
  );
}
