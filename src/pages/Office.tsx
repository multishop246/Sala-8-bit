import { useEffect, useState } from 'react';
import * as desktop from '../lib/desktop';
import { Modal } from '../components/Modal';
import { Board, Card } from '../board/Board';
import { Chat, Thread } from '../chat/Chat';
import { catOf } from '../board/logic';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../game/Avatar';
import { Room } from '../game/Room';
import { fmtClock, fmtDur, STATE_COLOR, STATE_LABEL, useLive, type PersonView } from '../live/LiveProvider';
import type { MemberState } from '../lib/types';
import { useWs } from '../lib/workspace';
import { DayPanel } from '../dash/DayPanel';
import { MuralTab } from '../glory/MuralTab';
import { InstagramDialog, MyDeskDialog, ReportDialog, SabadoDialog, nextSaturday } from './OfficeDialogs';
import { isOpen } from '../board/logic';
import { TITLES } from '../game/themes';
import { LunchReminder } from './LunchReminder';
import { AIConnections } from '../components/AIConnections';

type Dlg = { kind: 'copa' } | { kind: 'meet' } | { kind: 'person'; id: string } | { kind: 'end' } | { kind: 'sabado' } | { kind: 'instagram' } | { kind: 'mydesk' } | { kind: 'report'; ended: boolean } | null;
type Tab = 'quadro' | 'chat' | 'painel' | 'mural';

export function Office() {
  const { ws, me, members } = useWs();
  const L = useLive();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [tab, setTab] = useState<Tab>('quadro');
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [presetTask, setPresetTask] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [boardPopup, setBoardPopup] = useState(false);
  const openChat = (userId: string, taskId?: string | null) => { setDlg(null); setOpenTask(null); setChatWith(userId); setPresetTask(taskId || null); setTab('chat'); setTimeout(() => document.getElementById('tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const unreadTotal = Object.values(L.unread).reduce((a, b) => a + b, 0);
  const ready = members.filter(m => m.display_name && m.consent_at);
  const mine = L.view(me.user_id);
  const gestor = me.kind === 'gestor';
  const label = (s: MemberState) => (s === 'pausa_gestor' ? `Pausa, ${L.gestorName || 'gestor'}` : STATE_LABEL[s]);
  const myMeeting = L.meetings.find(m => m.people.includes(me.user_id));

  const copa = async () => {
    if (gestor) return setDlg({ kind: 'person', id: me.user_id });
    const st = mine?.shown;
    if (st === 'cafe' || st === 'almoco') { await L.act.setState('trabalhando'); return; }
    if (st === 'encerrado') return;
    if (L.inLunchWindow && !mine?.lunchDone) return setDlg({ kind: 'copa' });
    await L.act.setState('cafe');
  };
  const meetingRoom = async () => { if (myMeeting) await L.act.leaveMeeting(); else setDlg({ kind: 'meet' }); };
  const boss = async () => {
    if (gestor) return;
    if (!L.gestorName) return setDlg({ kind: 'person', id: me.user_id });
    await L.act.setState(mine?.shown === 'pausa_gestor' ? 'trabalhando' : 'pausa_gestor');
  };
  const attention = async (from: string) => { openChat(from); };

  const sorted = [...L.views].sort((a, b) => (a.member.kind === b.member.kind ? (a.member.desk || 0) - (b.member.desk || 0) : a.member.kind === 'gestor' ? -1 : 1));
  const freeDesks = ws.desks - ready.filter(m => m.kind === 'membro' && m.desk).length;
  const rec = ws.settings.recursos || { sabadao: false, datas_comemorativas: false, mural_gloria: false, instagram: false };
  const colorOf = (id: string | null) => ((members.find(m => m.user_id === id)?.avatar as { oc?: string })?.oc) || '#ffe27a';
  const today = new Date(L.now).toLocaleDateString('sv-SE');
  const notes = L.board.tasks.filter(t => isOpen(t) || (t.done_at && new Date(t.done_at).toLocaleDateString('sv-SE') === today))
    .map(t => ({ col: (t.col === 'afazer' ? 0 : t.col === 'fazendo' ? 1 : 2) as 0 | 1 | 2, color: colorOf(t.owner || t.creator) }));
  const sat = nextSaturday();
  const activeTask = (uid: string) => { const a = L.view(uid)?.status?.active_task_id; return L.board.tasks.find(t => t.id === a && t.col === 'fazendo'); };
  const goTab = (t: Tab) => { setTab(t); setTimeout(() => document.getElementById('tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const person = (id: string) => setDlg(id === me.user_id && me.kind === 'membro' ? { kind: 'mydesk' } : { kind: 'person', id });

  return (
    <>
      <LunchReminder />
      <AIConnections />
      {L.callsToMe.length > 0 && <div className="alerts" style={{ marginBottom: 14 }}>
        {L.callsToMe.map(c => { const f = members.find(m => m.user_id === c.from_user); return (
          <div key={c.id} className="alert" role="alert"><span><b>{f?.display_name || 'Um colega'}</b> chamou sua atenção</span><button className="cta sm" onClick={() => attention(c.from_user)}>Responder</button></div>); })}
      </div>}
      <div className="grid2">
        <aside className="stack">
          <MyCard view={mine} label={label} onCopa={copa} onMeet={meetingRoom} onBoss={boss} onEnd={() => setDlg({ kind: 'end' })} onReport={() => setDlg({ kind: 'report', ended: false })} onDesk={() => setDlg({ kind: 'mydesk' })} inMeeting={!!myMeeting} gestor={gestor} />
          <div className="panel">
            <h3>Equipe · {L.views.filter(v => v.online).length} online</h3>
            {sorted.map(v => (
              <button key={v.member.user_id} className="mrow" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'inherit' }} onClick={() => setDlg({ kind: 'person', id: v.member.user_id })}>
                <Avatar avatar={L.look(v.member)} crown={v.member.kind === 'gestor'} size={30} />
                <span className="who"><b>{v.member.display_name}{v.member.user_id === me.user_id && <span className="chip acc" style={{ marginLeft: 6 }}>você</span>}</b>{L.titles[v.member.user_id] && <span className="gmain small">★ {TITLES[L.titles[v.member.user_id]].n}</span>}
                  <span className="state"><i style={{ background: v.shown === 'fora' || v.shown === 'encerrado' ? '#555c70' : STATE_COLOR[v.shown] }} />
                    {v.member.kind === 'gestor' && v.shown === 'trabalhando' ? 'No escritório' : label(v.shown)}{v.online && v.device === 'celular' ? ' · celular' : ''}</span></span>
                <span className="small muted mono">{v.shown === 'cafe' ? (v.cafeLeft < 0 ? `+${Math.ceil(-v.cafeLeft / 60)}m` : fmtClock(v.cafeLeft)) : v.shown !== 'fora' ? fmtDur(L.now - v.since) : ''}</span>
              </button>))}
            <p className="small muted" style={{ marginTop: 8 }}>{freeDesks} {freeDesks === 1 ? 'mesa livre' : 'mesas livres'} de {ws.desks}.
              {me.is_admin && freeDesks > 0 && <> <Link to={`/w/${ws.slug}/config?aba=convites`}>Convidar</Link></>}</p>
          </div>
        </aside>
        <section className="stack">
          <Room desks={ws.desks} members={ready}
            live={{
              views: L.views, meetings: L.meetings, callsToMe: L.callsToMe, meId: me.user_id, now: L.now, gestorName: L.gestorName, look: L.look,
              taskTitle: uid => activeTask(uid)?.title || null,
              capturing: uid => !!L.view(uid)?.capturing,
              moveCharacter: L.moveCharacter,
              titles: rec.mural_gloria ? L.titles : {},
              wall: { notes, instagram: rec.instagram ? (L.ready ? (L.instagram?.followers ?? 0) : null) : null, sabadao: !!rec.sabadao, mural: !!rec.mural_gloria },
              sabado: ready.filter(m => m.kind === 'membro').map(m => ({ name: m.display_name || '', works: L.saturdays.find(x => x.user_id === m.user_id && x.day === sat)?.works ?? null })),
              onSabado: () => setDlg({ kind: 'sabado' }), onInstagram: () => setDlg({ kind: 'instagram' }), onMural: () => goTab('mural'), onBoard: () => { setOpenTask(null); setBoardPopup(true); }
            }}
            onPerson={person} onCopa={copa} onMeetingRoom={meetingRoom} onBoss={boss} onAttention={attention} />
          <div className="panel" id="tabs">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'quadro'} onClick={() => setTab('quadro')}>Quadro de tarefas</button>
              <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>Chat{unreadTotal ? <span className="badge">{unreadTotal}</span> : null}</button>
              <button role="tab" aria-selected={tab === 'painel'} onClick={() => setTab('painel')}>Painel do dia</button>
              {rec.mural_gloria && <button role="tab" aria-selected={tab === 'mural'} onClick={() => setTab('mural')}>Mural da Glória</button>}
            </div>
            {tab === 'quadro' ? !boardPopup && <Board openTask={openTask} setOpenTask={setOpenTask} onChat={openChat} />
              : tab === 'painel' ? <DayPanel />
              : tab === 'mural' ? <MuralTab />
              : <Chat withUser={chatWith} setWithUser={id => { setChatWith(id); setPresetTask(null); }} presetTask={presetTask} onOpenTask={id => { setTab('quadro'); setOpenTask(id); }} />}
          </div>
          <p className="small muted">Clique na <b>copa</b> para pausar, na <b>sala de reunião</b> para sinalizar uma reunião{L.gestorName ? <>, na <b>mesa de {L.gestorName}</b> para a pausa do gestor</> : null} e em um colega para ver o status ou chamar a atenção.</p>
        </section>
      </div>

      {boardPopup && <Modal title="Quadro de tarefas" board onClose={() => { if (openTask) setOpenTask(null); else setBoardPopup(false); }}>
        <Board showAll openTask={openTask} setOpenTask={setOpenTask} onChat={(uid, task) => { setBoardPopup(false); openChat(uid, task); }} />
      </Modal>}
      {dlg?.kind === 'copa' && <Modal title="Copa" onClose={() => setDlg(null)}>
        <p className="muted">É horário de almoço. Qual pausa você vai fazer?</p>
        <div className="choice">
          <button className="opt" onClick={async () => { setDlg(null); await L.act.setState('cafe'); }}><b>Café</b><span>Restam {fmtClock(Math.max(0, mine?.cafeLeft || 0))} hoje</span></button>
          <button className="opt" onClick={async () => { setDlg(null); await L.act.setState('almoco'); }}><b>Almoço</b><span>Uma vez por dia</span></button>
        </div>
      </Modal>}
      {dlg?.kind === 'meet' && <MeetingDialog onClose={() => setDlg(null)} />}
      {dlg?.kind === 'person' && <PersonDialog view={L.view(dlg.id)} label={label} onClose={() => setDlg(null)} onChat={openChat} onTask={id => { setDlg(null); setTab('quadro'); setOpenTask(id); }} />}
      {dlg?.kind === 'end' && <Modal title="Encerrar expediente" onClose={() => setDlg(null)}>
        <p className="muted">Você sai do escritório até amanhã e o relatório do dia é gerado em PDF. Se precisar voltar hoje, é só clicar em "Voltar ao trabalho".</p>
        <div className="btns"><button className="cta" onClick={async () => { const ok = await L.act.setState('encerrado'); setDlg(ok ? { kind: 'report', ended: true } : null); }}>Encerrar expediente</button><button className="ghost" onClick={() => setDlg(null)}>Cancelar</button></div>
      </Modal>}
      {dlg?.kind === 'sabado' && <SabadoDialog onClose={() => setDlg(null)} />}
      {dlg?.kind === 'instagram' && <InstagramDialog onClose={() => setDlg(null)} />}
      {dlg?.kind === 'mydesk' && <MyDeskDialog onClose={() => setDlg(null)} />}
      {dlg?.kind === 'report' && <ReportDialog ended={dlg.ended} onClose={() => setDlg(null)} />}
    </>
  );
}

function MyCard({ view, label, onCopa, onMeet, onBoss, onEnd, onReport, onDesk, inMeeting, gestor }: {
  view?: PersonView; label: (s: MemberState) => string; onCopa: () => void; onMeet: () => void; onBoss: () => void; onEnd: () => void; onReport: () => void; onDesk: () => void; inMeeting: boolean; gestor: boolean;
}) {
  const L = useLive();
  if (!view) return <div className="panel"><p className="muted">Entrando no escritório…</p></div>;
  const s = view.shown, m = view.member;
  const over = view.cafeLeft < 0;
  const ended = s === 'encerrado';
  return (
    <div className="panel me-card">
      <div className="me-head">
        <Avatar avatar={L.look(m)} crown={gestor} size={40} />
        <div><b>{m.display_name}</b>
          <span className="state"><i style={{ background: STATE_COLOR[s] }} />{gestor && s === 'trabalhando' ? 'No escritório · acompanhando' : label(s)} · {fmtDur(L.now - view.since)}</span></div>
      </div>
      {!gestor && <div className="kv">
        <div><span>Café restante hoje</span><b className={over ? 'over' : ''}>{over ? `+${Math.ceil(-view.cafeLeft / 60)} min` : fmtClock(view.cafeLeft)}</b></div>
        <div><span>Almoço</span><b>{view.lunchDone ? (s === 'almoco' ? 'agora' : 'feito') : 'pendente'}</b></div>
      </div>}
      {!gestor && <NowTask userId={m.user_id} />}
      {over && !gestor && <p className="small" style={{ color: '#ff9aa8' }}>O café passou do limite do dia. O tempo extra conta como distração.</p>}
      <div className="btns">
        {ended ? <><button className="cta" onClick={() => L.act.setState('trabalhando')}>Voltar ao trabalho</button><button className="ghost" onClick={onReport}>Relatório do dia</button></> : <>
          {!gestor && <button className={s === 'cafe' || s === 'almoco' ? 'cta' : 'ghost'} onClick={onCopa}>{s === 'cafe' ? 'Voltar do café' : s === 'almoco' ? 'Voltar do almoço' : 'Ir para a copa'}</button>}
          <button className={inMeeting ? 'cta' : 'ghost'} onClick={onMeet}>{inMeeting ? 'Sair da reunião' : 'Sinalizar reunião'}</button>
          {!gestor && L.gestorName && <button className={s === 'pausa_gestor' ? 'cta' : 'ghost'} onClick={onBoss}>{s === 'pausa_gestor' ? `Voltar da pausa` : `Pausa, ${L.gestorName}`}</button>}
          <button className="ghost" onClick={onEnd}>Encerrar expediente</button>
          {!gestor && <button className="ghost" onClick={onDesk}>Sua mesa</button>}
          {!gestor && <button className="ghost" onClick={onReport}>Relatório do dia</button>}
        </>}
      </div>
      {!gestor && <AgentLine on={view.agentOn} />}
      {!gestor && L.gestorName && <p className="small muted">"Pausa, {L.gestorName}": quando o gestor chama você para algo urgente fora do sistema. Conta como tempo produtivo.</p>}
    </div>
  );
}

function MeetingDialog({ onClose }: { onClose: () => void }) {
  const { me } = useWs();
  const L = useLive();
  const [subject, setSubject] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [vis, setVis] = useState(0);
  const [out, setOut] = useState(0);
  const [busy, setBusy] = useState(false);
  const others = L.views.filter(v => v.member.user_id !== me.user_id);
  const avail = (v: PersonView) => ['trabalhando', 'cafe', 'pausa_gestor'].includes(v.shown);
  const mine = L.view(me.user_id);
  const blocked = mine?.shown === 'encerrado' || mine?.shown === 'fora';
  return (
    <Modal title="Sinalizar reunião" onClose={onClose}>
      {L.meetings.length > 0 && <div className="stack" style={{ gap: 6 }}>
        <span className="lbl">Reunião acontecendo</span>
        {L.meetings.map(m => <div key={m.id} className="item"><span><b>{m.subject}</b><small>{m.people.length + m.visitors + m.outsiders} pessoas</small></span>
          <button className="cta sm" disabled={busy || blocked} onClick={async () => { setBusy(true); if (await L.act.joinMeeting(m.id)) onClose(); else setBusy(false); }}>Entrar</button></div>)}
        <span className="lbl" style={{ marginTop: 6 }}>Ou comece outra</span>
      </div>}
      <div className="field"><label htmlFor="ms">Assunto</label><input id="ms" value={subject} onChange={e => setSubject(e.target.value)} maxLength={80} placeholder="Ex.: Alinhamento da campanha de Natal" autoFocus /></div>
      <div><span className="lbl">Quem participa</span>
        <div className="picks" style={{ marginTop: 6 }}>{others.map(v => {
          const on = sel.includes(v.member.user_id), ok = avail(v);
          return <button key={v.member.user_id} type="button" className="opt" aria-pressed={on} disabled={!ok}
            onClick={() => setSel(s => on ? s.filter(x => x !== v.member.user_id) : [...s, v.member.user_id])}>
            <Avatar avatar={L.look(v.member)} crown={v.member.kind === 'gestor'} size={24} /><span><b style={{ fontSize: 13 }}>{v.member.display_name}</b><br />{ok ? (on ? 'Vai participar' : 'Disponível') : STATE_LABEL[v.shown]}</span></button>;
        })}</div></div>
      <div className="row">
        <div className="field"><label htmlFor="mv">Visitantes</label><select id="mv" value={vis} onChange={e => setVis(+e.target.value)}>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></div>
        <div className="field"><label htmlFor="mo">Pessoas de outros setores</label><select id="mo" value={out} onChange={e => setOut(+e.target.value)}>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></div>
      </div>
      {blocked && <p className="err">Entre no escritório antes de marcar uma reunião.</p>}
      <div className="btns"><button className="cta" disabled={busy || blocked || subject.trim().length < 2} onClick={async () => { setBusy(true); if (await L.act.startMeeting(subject.trim(), sel, vis, out)) onClose(); else setBusy(false); }}>Começar reunião</button>
        <button className="ghost" onClick={onClose}>Cancelar</button></div>
      <p className="small muted">Quem você marcar entra na reunião junto. Para sair, clique de novo na sala de reunião. Se quem criou sair, a reunião acaba para todos.</p>
    </Modal>
  );
}

function PersonDialog({ view, label, onClose, onChat, onTask }: { view?: PersonView; label: (s: MemberState) => string; onClose: () => void; onChat: (id: string, task?: string | null) => void; onTask: (id: string) => void }) {
  const { me } = useWs();
  const L = useLive();
  const [busy, setBusy] = useState(false);
  if (!view) return null;
  const m = view.member, self = m.user_id === me.user_id;
  const called = L.callsFromMe.some(c => c.to_user === m.user_id);
  const ctx = view.shown === 'reuniao' && view.meeting ? ` · ${view.meeting.subject}` : '';
  return (
    <Modal title={self ? 'Você' : m.display_name || ''} onClose={onClose}>
      <div className="me-head" style={{ gridTemplateColumns: '48px minmax(0,1fr)' }}>
        <Avatar avatar={L.look(m)} crown={m.kind === 'gestor'} size={48} />
        <div><b>{m.display_name}</b>
          <span className="small muted">{m.kind === 'gestor' ? 'Gestor · acompanha a equipe' : [m.main_role, ...m.adj_roles].filter(Boolean).join(' · ')}</span><br />
          <span className="state"><i style={{ background: view.shown === 'fora' || view.shown === 'encerrado' ? '#555c70' : STATE_COLOR[view.shown] }} />
            {m.kind === 'gestor' && view.shown === 'trabalhando' ? 'No escritório' : label(view.shown)}{ctx}{view.shown !== 'fora' ? ` · há ${fmtDur(L.now - view.since)}` : ''}{view.online && view.device === 'celular' ? ' · pelo celular' : ''}</span></div>
      </div>
      {m.kind === 'membro' && <div className="kv">
        <div><span>Café restante hoje</span><b className={view.cafeLeft < 0 ? 'over' : ''}>{view.cafeLeft < 0 ? `+${Math.ceil(-view.cafeLeft / 60)} min` : fmtClock(view.cafeLeft)}</b></div>
        <div><span>Jornada</span><b style={{ fontSize: 13 }}>{m.schedule ? `${m.schedule.e1}–${m.schedule.s1} · ${m.schedule.e2}–${m.schedule.s2}` : '—'}</b></div>
      </div>}
      {m.kind === 'membro' && <NowTask userId={m.user_id} onOpen={onTask} />}
      {!self && <div className="btns">
        <button className="ghost" onClick={() => onChat(m.user_id, L.view(m.user_id)?.status?.active_task_id)}>Abrir conversa</button>
        <button className="cta" disabled={busy || called} onClick={async () => { setBusy(true); await L.act.callAttention(m.user_id); setBusy(false); }}>{called ? 'Atenção chamada · aguardando' : 'Chamar atenção'}</button>
      </div>}
      {!self && <Thread other={m.user_id} compact presetTask={L.view(m.user_id)?.status?.active_task_id || null} onOpenTask={onTask} />}
      {!self && <p className="small muted">"Chamar atenção" coloca uma placa ATENÇÃO na sua mesa para {m.display_name} até que responda.</p>}
    </Modal>
  );
}

function NowTask({ userId, onOpen }: { userId: string; onOpen?: (id: string) => void }) {
  const { catalog } = useWs();
  const L = useLive();
  const cat = useMemo(() => catOf(catalog), [catalog]);
  const active = L.view(userId)?.status?.active_task_id;
  const t = L.board.tasks.find(x => x.id === active && x.col === 'fazendo');
  return (
    <div className="nowtask">
      <span className="lbl">Executando agora</span>
      {t ? <Card t={t} cat={cat} compact onOpen={() => onOpen?.(t.id)} /> : <p className="small muted">Nenhuma tarefa em execução.</p>}
    </div>
  );
}

function AgentLine({ on }: { on: boolean }) {
  const [info, setInfo] = useState<desktop.AgentInfo | null>(null);
  const app = desktop.inApp();
  useEffect(() => {
    if (!app) return;
    const load = () => desktop.agentInfo().then(setInfo).catch(() => {});
    load(); const i = window.setInterval(load, 10000);
    return () => window.clearInterval(i);
  }, [app]);
  if (app && info) {
    const a = info.agora;
    return <p className="small agentline"><i className={'pdot ' + (a.conectado ? 'okc' : 'offc')} />
      {a.conectado ? <>App de computador medindo{a.app ? <> · <b>{a.app}</b></> : null}{a.agents ? ` · IA ${a.agents}` : ''}{a.estado === 'encerrado' ? ' · pausado (expediente encerrado)' : ''}</>
        : info.pareado ? <>App de computador sem conexão{a.pendentes ? ` · ${a.pendentes} min guardados para enviar` : ''}{a.erro ? <span className="muted"> ({a.erro})</span> : null}</>
        : <>Conectando o app de computador…</>}</p>;
  }
  if (on) return <p className="small agentline"><i className="pdot okc" />App de computador conectado neste momento.</p>;
  return <p className="small muted agentline">Use o <a href={desktop.DOWNLOAD_URL} target="_blank" rel="noreferrer">app de computador</a> (Windows e macOS) para medir o tempo produtivo automaticamente.</p>;
}
