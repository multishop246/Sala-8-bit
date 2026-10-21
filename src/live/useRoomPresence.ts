import { useCallback, useEffect, useRef, useState } from 'react';
import * as desktop from '../lib/desktop';
import { LOUNGE_AFTER_MS, RETURN_AFTER_MS, validPoint, type Point, type RoomPresence } from '../game/movement';

export function useRoomPresence(identity: string) {
  const initial = (): RoomPresence => ({ target: null, movedAt: 0, lastInputAt: Date.now(), idle: false });
  const current = useRef<RoomPresence>(initial());
  const [, setRevision] = useState(0);
  const publisher = useRef<(s: RoomPresence) => void>(() => {});
  const native = useRef<{ at: number; seconds: number } | null>(null);
  const lastPublish = useRef(0);
  const commit = useCallback((force = false) => {
    if (!force && Date.now() - lastPublish.current < 2000) return;
    lastPublish.current = Date.now(); setRevision(n => n + 1); publisher.current(current.current);
  }, []);
  useEffect(() => {
    current.current = initial(); native.current = null; commit(true);
    const human = () => {
      const now = Date.now(); current.current.lastInputAt = now; current.current.idle = false;
      native.current = null; commit();
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, human, { passive: true }));
    let stopped = false, pending = false;
    const poll = async () => {
      if (!desktop.inApp() || pending) return;
      pending = true;
      try {
        const s = await desktop.agentInfo();
        if (!stopped && Number.isFinite(s.agora.idle_seconds)) native.current = { at: Date.now(), seconds: s.agora.idle_seconds! };
      } catch { /* Browser presence continues while the native bridge is unavailable. */ }
      finally { pending = false; }
    };
    void poll();
    const tick = window.setInterval(() => {
      const now = Date.now(), n = native.current;
      if (n && now - n.at < 15000) current.current.lastInputAt = Math.max(current.current.lastInputAt, n.at - n.seconds * 1000);
      const idle = now - current.current.lastInputAt >= LOUNGE_AFTER_MS;
      const expired = current.current.target && now - Math.max(current.current.lastInputAt, current.current.movedAt) >= RETURN_AFTER_MS;
      if (idle !== current.current.idle || expired) { current.current.idle = idle; if (expired) current.current.target = null; commit(true); }
      if (now - lastPublish.current >= 10000) commit(true);
      void poll();
    }, 2000);
    return () => { stopped = true; window.clearInterval(tick); events.forEach(e => window.removeEventListener(e, human)); };
  }, [identity, commit]);
  const move = useCallback((target: Point) => {
    if (!validPoint(target)) return;
    const now = Date.now(); current.current = { target, movedAt: now, lastInputAt: now, idle: false }; commit(true);
  }, [commit]);
  const bind = useCallback((fn: (s: RoomPresence) => void) => { publisher.current = fn; fn(current.current); }, []);
  return { scene: current.current, move, bind };
}
