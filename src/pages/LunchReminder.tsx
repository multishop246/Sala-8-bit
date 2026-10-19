import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { useLive } from '../live/LiveProvider';
import { useWs } from '../lib/workspace';
import { focusLunchReminder } from '../lib/desktop';
import { lunchOverdue } from '../lib/lunch';

export function LunchReminder() {
  const { ws, me } = useWs();
  const live = useLive();
  const current = live.view(me.user_id);
  const [dismissed, setDismissed] = useState('');
  const [busy, setBusy] = useState(false);
  const key = `sala8bit.lunch-reminder:${ws.id}:${me.user_id}:${current?.since}`;
  const due = lunchOverdue(current?.shown, current?.since || NaN, live.now);
  const visible = due && dismissed !== key;
  useEffect(() => {
    if (!due) return;
    try { if (localStorage.getItem(key)) { setDismissed(key); return; } } catch { /* local dismissal remains */ }
    focusLunchReminder().catch(() => {});
  }, [due, key]);
  const close = () => { setDismissed(key); try { localStorage.setItem(key, '1'); } catch { /* */ } };
  if (!visible) return null;
  return <Modal title="Já completou 1 hora de almoço" onClose={close}>
    <div className="stack">
      <p>Seu status ainda está em almoço. Se você já voltou, clique abaixo para retomar a contagem de trabalho.</p>
      <button className="cta" disabled={busy} onClick={async () => { setBusy(true); try { if (await live.act.setState('trabalhando')) close(); } finally { setBusy(false); } }}>Já voltei: voltar ao trabalho</button>
      <button className="ghost" onClick={close}>Ainda estou almoçando</button>
    </div>
  </Modal>;
}
