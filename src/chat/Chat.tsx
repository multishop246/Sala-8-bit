// Chat por demanda: toda mensagem fica ligada a uma tarefa do quadro.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../game/Avatar';
import { useLive } from '../live/LiveProvider';
import { useWs } from '../lib/workspace';
import { catOf, isOpen } from '../board/logic';

export const isOffTopic = (text: string, words: string[]) => { const s = text.toLowerCase(); return words.some(w => w.trim() && s.includes(w.trim().toLowerCase())); };

export function Chat({ withUser, setWithUser, presetTask, onOpenTask }: { withUser: string | null; setWithUser: (id: string) => void; presetTask?: string | null; onOpenTask: (id: string) => void }) {
  const { me } = useWs();
  const L = useLive();
  const others = L.views.filter(v => v.member.user_id !== me.user_id);
  const last = (id: string) => L.board.messages.filter(m => (m.from_user === id && m.to_user === me.user_id) || (m.to_user === id && m.from_user === me.user_id)).pop();
  const sorted = [...others].sort((a, b) => (last(b.member.user_id)?.created_at || '').localeCompare(last(a.member.user_id)?.created_at || ''));
  return (
    <div className="chat">
      <div className="clist" role="list">
        {sorted.map(v => {
          const id = v.member.user_id, lm = last(id), n = L.unread[id] || 0, call = L.callsToMe.some(c => c.from_user === id);
          return <button key={id} role="listitem" className={'cperson' + (withUser === id ? ' on' : '')} onClick={() => setWithUser(id)}>
            <Avatar avatar={L.look(v.member)} crown={v.member.kind === 'gestor'} size={26} />
            <span className="who"><b>{v.member.display_name}</b><span>{lm ? (lm.from_user === me.user_id ? 'Você: ' : '') + lm.text : 'Sem mensagens'}</span></span>
            {call ? <span className="badge att-b">!</span> : n ? <span className="badge">{n}</span> : null}
          </button>;
        })}
      </div>
      {withUser ? <Thread other={withUser} presetTask={presetTask} onOpenTask={onOpenTask} /> : <div className="thread empty"><p className="muted">Escolha um colega para conversar.</p></div>}
    </div>
  );
}

export function Thread({ other, presetTask, onOpenTask, compact }: { other: string; presetTask?: string | null; onOpenTask?: (id: string) => void; compact?: boolean }) {
  const { ws, me, catalog } = useWs();
  const L = useLive();
  const cat = useMemo(() => catOf(catalog), [catalog]);
  const msgs = L.board.messages.filter(m => (m.from_user === other && m.to_user === me.user_id) || (m.to_user === other && m.from_user === me.user_id));
  const [task, setTask] = useState<string>(presetTask || '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const unread = L.unread[other] || 0;
  const called = L.callsToMe.some(c => c.from_user === other);

  useEffect(() => { if (presetTask) setTask(presetTask); }, [presetTask]);
  useEffect(() => { if (unread) L.act.markRead(other); }, [unread, other]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (called) L.act.ackAttention(other); }, [called, other]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs.length, other]);

  // demandas para escolher: abertas que envolvem um dos dois, depois as outras abertas, e a da mensagem respondida
  const opts = L.board.tasks.filter(t => isOpen(t) || t.id === task);
  const involves = (t: typeof opts[number]) => [t.owner, t.creator, t.dir_to, t.linked_to].some(x => x === other || x === me.user_id);
  const ordered = [...opts.filter(involves), ...opts.filter(t => !involves(t))];
  const title = (id: string | null) => L.board.tasks.find(t => t.id === id)?.title || 'demanda encerrada';
  const off = isOffTopic(text, ws.settings.palavras_fora_do_assunto || []);

  const send = async () => {
    if (!task || !text.trim() || busy) return;
    setBusy(true);
    const ok = await L.act.sendMessage(other, task, text.trim());
    setBusy(false);
    if (ok) setText('');
    ta.current?.focus();
  };
  return (
    <div className={'thread' + (compact ? ' compact' : '')}>
      {!compact && <div className="thd"><b>{L.nameOf(other)}</b><span className="small muted">{L.view(other)?.online ? 'online' : 'offline'}</span></div>}
      <div className="msgs" ref={box} aria-live="polite">
        {!msgs.length && <p className="small muted">Nenhuma mensagem ainda. Toda conversa fica ligada a uma demanda do quadro.</p>}
        {msgs.map(m => {
          const mine = m.from_user === me.user_id;
          return <div key={m.id} className={'msg' + (mine ? ' me' : '') + (m.flagged ? ' flag' : '')}>
            <button className="about" onClick={() => m.task_id && onOpenTask?.(m.task_id)} disabled={!m.task_id || !onOpenTask}>{title(m.task_id)}</button>
            <span className="txt">{m.text}</span>
            {m.flagged && <span className="flagtag">Sinalizada: fora do assunto da demanda</span>}
            <span className="when">{new Date(m.created_at).toTimeString().slice(0, 5)}{mine && m.read_at ? ' · lida' : ''}</span>
            {!mine && m.task_id && <button className="reply" onClick={() => { setTask(m.task_id!); ta.current?.focus(); }}>Responder</button>}
          </div>;
        })}
      </div>
      <div className="compose">
        <select value={task} onChange={e => setTask(e.target.value)} aria-label="Demanda da mensagem">
          <option value="">Sobre qual demanda?</option>
          {ordered.map(t => <option key={t.id} value={t.id}>{t.title}{t.line_id ? ` · ${cat.byId.get(t.line_id)?.name || ''}` : ''}</option>)}
        </select>
        <div className="row2">
          <textarea ref={ta} value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={2000} placeholder={task ? 'Mensagem · Enter envia, Shift+Enter quebra linha' : 'Escolha a demanda primeiro'}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Mensagem" />
          <button className="cta" disabled={!task || !text.trim() || busy} onClick={send}>Enviar</button>
        </div>
        {off && <span className="err small">Essa mensagem parece fora do assunto da demanda. Ela vai ser enviada, mas fica sinalizada em vermelho.</span>}
      </div>
    </div>
  );
}
