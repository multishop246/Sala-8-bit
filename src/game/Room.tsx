import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { PixelRoom, type RoomProps } from './PixelRoom';
import { officeLayout, loungeSeat, REFERENCE_SPOTS, referencePoint, brainstormSeat } from './office-layout';
import { destinationMode, findPath, type Point } from './movement';
import type { ActorState, OfficeWorld } from './world3d';
import { STATE_COLOR } from '../live/LiveProvider';
import { TITLES } from './themes';
import './room3d.css';
export { CAT_COLOR, deskLayout } from './PixelRoom';

export function Room(props: RoomProps) {
  const { desks, live, pick } = props;
  const layout = useMemo(() => officeLayout(desks), [desks]);
  const host = useRef<HTMLDivElement>(null), labels = useRef<HTMLDivElement>(null);
  const world = useRef<OfficeWorld | null>(null), latest = useRef(props); latest.current = props;
  const [failed, setFailed] = useState(false), [ready, setReady] = useState(false), [expanded, setExpanded] = useState(false);
  const [hint, setHint] = useState('Clique no chão para mover seu personagem');
  const modeById = useRef(new Map<string, string>());
  useEffect(() => {
    if (!host.current || failed) return;
    let stopped = false, raf = 0, observer: ResizeObserver | undefined;
    const nodes = new Map<string, HTMLButtonElement>();
    let last = performance.now(), lastSync = -1;
    const activate = (action: string) => {
      const p = latest.current, l = p.live;
      if (action === 'own-desk') { p.onOwnDesk?.(); return; }
      if (action.startsWith('desk-table:')) {
        p.onOwnDesk?.();
        return;
      }
      if (action === 'studio' && p.onStudio) { p.onStudio(); return; }
      if (action === 'brainstorm' && p.onBrainstorm) { p.onBrainstorm(); return; }
      if (action.startsWith('person:')) { p.onPerson?.(action.slice(7)); return; }
      if (action === 'board') l?.onBoard?.();
      else if (action === 'copa') p.onCopa?.();
      else if (action === 'meeting') p.onMeetingRoom?.();
      else if (action === 'boss') p.onBoss?.();
      else if (action === 'mural' && l?.wall?.mural) l.onMural?.();
      else if (action === 'instagram' && l?.wall?.instagram != null) l.onInstagram?.();
      else if (action === 'sabado' && l?.wall?.sabadao) l.onSabado?.();
      else if (['lounge', 'studio', 'brainstorm'].includes(action)) {
        const target = layout.reference ? REFERENCE_SPOTS[action === 'lounge' ? 'loungeWalk' : action === 'studio' ? 'capture' : 'brainstorm'] : action === 'lounge' ? { x: -6.2, z: layout.back + 4.3 } : action === 'studio' ? { x: -7.1, z: layout.front - 2.7 } : { x: 6.2, z: layout.front - 4.4 };
        l?.moveCharacter?.(target);
      }
    };
    const addLabel = (key: string, text: string, className: string, action?: () => void) => {
      let node = nodes.get(key);
      if (!node) { node = document.createElement('button'); node.type = 'button'; node.className = className; nodes.set(key, node); labels.current?.append(node); }
      if (node.textContent !== text) node.textContent = text;
      node.onclick = action || null; node.tabIndex = action ? 0 : -1; return node;
    };
    void import('./world3d').then(({ OfficeWorld }) => {
      if (stopped || !host.current) return;
      const w = new OfficeWorld(host.current, layout, latest.current.visualSeed); world.current = w; setReady(true);
      observer = new ResizeObserver(() => w.resize()); observer.observe(host.current);
      w.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); if (!stopped) setFailed(true); });
      w.renderer.domElement.addEventListener('click', event => {
        const p = latest.current, result = w.hit(event.clientX, event.clientY);
        if (p.pick) return;
        if (result.action) { activate(result.action); return; }
        const mine = p.live?.views.find(v => v.member.user_id === p.live?.meId);
        if (!result.point || !mine || mine.shown !== 'trabalhando') { if (mine) setHint('Volte ao trabalho para passear pelo escritório'); return; }
        const actor = w.actors.get(mine.member.user_id), from = actor?.root.position || result.point;
        const path = findPath(from, result.point, layout.blocks, layout.width, layout.depth), destination = path[path.length - 1];
        if (destination) { p.live?.moveCharacter?.(destination); w.mark(destination); setHint('Seu personagem retorna à mesa após 15 segundos sem interação'); }
      });
      const render = (time: number) => {
        if (stopped) return;
        const dt = Math.min((time - last) / 1000, .06); last = time;
        const p = latest.current, l = p.live, states: ActorState[] = [];
        const actorsSeen = new Set<string>();
        if (time - lastSync > 200) {
          lastSync = time;
          let cafe = 0, meeting = 0, lounge = 0, boss = 0, capture = 0, brainstorm = 0;
          for (const m of p.members) {
            const v = l?.views.find(v => v.member.user_id === m.user_id);
            if (l && (!v || ['fora', 'encerrado', 'almoco'].includes(v.shown))) continue;
            const desk = layout.desks.find(d => d.n === m.desk);
            let target: Point = m.kind === 'gestor' ? layout.reference ? REFERENCE_SPOTS.manager : { x: 8.8, z: layout.back + 2.95 } : desk || { x: 0, z: 0 };
            let sitting = true, facing = m.kind === 'gestor' ? 0 : desk?.facing ?? Math.PI, mode = 'desk';
            if (v && l) {
              const scene = v.scene;
              mode = destinationMode({ state: v.shown, capturing: v.capturing || !!l.capturing?.(m.user_id), agents: v.agents,
                idleSeconds: v.agentOn && v.status?.idle_seconds != null ? v.status.idle_seconds : scene?.idle || v.idle ? 300 : null, lastInputAt: scene?.lastInputAt ?? Date.now(),
                movedAt: scene?.movedAt ?? 0, target: scene?.target ?? null, now: Date.now(), activity: v.status?.room_activity });
              if (mode === 'roam' && scene?.target) { target = scene.target; sitting = false; }
              else if (mode === 'lounge') { target = loungeSeat(lounge++, layout.back); facing = 0; }
              else if (mode === 'brainstorm') { const i = brainstorm++, seat = brainstormSeat(i); target = layout.reference ? seat : { x: 8.1, z: layout.front - 3.7 }; facing = layout.reference ? seat.facing : Math.PI; if (i >= 4) { target = { x: target.x - Math.sin(facing) * .85, z: target.z - Math.cos(facing) * .85 }; sitting = false; } }
              else if (mode === 'capture') { const i = capture++; target = layout.reference ? referencePoint(386 + (i % 4) * 47, 579 + (i % 4) * 24 + Math.floor(i / 4) * 35) : { x: -9.2 + (i % 3) * 1.15, z: layout.front - 2.5 }; sitting = false; facing = .5; }
              if (v.shown === 'cafe') { const i = cafe++; target = layout.reference ? referencePoint(298 + i * 22, 459 + i * 12) : { x: -9.5, z: layout.back + 6 + i * .8 }; sitting = false; facing = -Math.PI / 2; }
              else if (v.shown === 'reuniao') { const i = meeting++; target = layout.reference ? REFERENCE_SPOTS.meeting[i % 6] : { x: .1 + (i % 3) * 1.6, z: layout.front - 2.8 + (i < 3 ? 1.1 : -1.1) }; facing = i < 3 ? Math.PI : 0; }
              else if (v.shown === 'pausa_gestor') { const i = boss++; target = layout.reference ? referencePoint(1226 + i * 30, 657 + i * 14) : { x: 7.1 + (i % 3) * .9, z: layout.back + 5.6 }; sitting = false; facing = Math.PI; }
            }
            modeById.current.set(m.user_id, mode);
            states.push({ id: m.user_id, avatar: l?.look?.(m) || m.avatar, target, sitting, facing, music: !!v?.music, agents: v?.agents || 0, crown: m.kind === 'gestor', mode });
          }
          if (p.pick?.selected) { const d = layout.desks.find(d => d.n === p.pick?.selected); if (d) states.push({ id: 'preview', avatar: p.pick.me.avatar, target: d, sitting: true, facing: d.facing, music: false, agents: 0, crown: false, mode: 'desk' }); }
          const guests = l?.meetings[0];
          for (let i = 0; i < Math.min(guests ? guests.visitors + guests.outsiders : 0, 6 - meeting); i++) states.push({ id: 'guest-' + i, avatar: { oc: '#a193b7' }, target: layout.reference ? REFERENCE_SPOTS.meeting[(i + meeting) % 6] : { x: .1 + ((i + meeting) % 3) * 1.6, z: layout.front - 2.8 + (i + meeting < 3 ? 1.1 : -1.1) }, sitting: true, facing: i + meeting < 3 ? Math.PI : 0, music: false, agents: 0, crown: false, mode: 'guest' });
          w.sync(states, l?.meId || 'preview'); w.setNotes(l?.wall?.notes || []);
          w.setGlory(Object.keys(TITLES).map(cat => { const id = Object.keys(l?.titles || {}).find(id => l?.titles?.[id] === cat); const member = p.members.find(m => m.user_id === id); return { name: member?.display_name || '—', avatar: member ? l?.look?.(member) || member.avatar : {}, title: TITLES[cat].s }; }));
          const me = l?.views.find(v => v.member.user_id === l.meId);
          w.mark(me && modeById.current.get(me.member.user_id) === 'roam' ? me.scene?.target || null : null);
        }
        w.render(dt, time / 1000);
        for (const label of w.labels) {
          if (label.key === 'glory' && l && !l.wall?.mural) continue;
          const node = addLabel(label.key, `${label.number} ${label.title}`, 'room3d-zone', label.action ? () => activate(label.action!) : undefined), point = w.project(label.point);
          if (!node.querySelector('.zone-number')) {
            const number = document.createElement('span'); number.className = 'zone-number'; number.textContent = String(label.number);
            node.replaceChildren(number, document.createTextNode(' ' + label.title));
          }
          node.style.left = point.x + 'px'; node.style.top = point.y + 'px';
        }
        for (const m of p.members) {
          const actor = w.actors.get(m.user_id), v = l?.views.find(v => v.member.user_id === m.user_id);
          if (!actor) continue; actorsSeen.add('actor-' + m.user_id);
          const point = w.project(actor.root.position.clone().add(new Vector3(0, 2.3, 0)));
          const mode = modeById.current.get(m.user_id), title = l?.titles?.[m.user_id];
          const status = mode === 'lounge' ? ' · no lounge' : mode === 'capture' ? ' · Gravando' : mode === 'brainstorm' ? ' · Brainstorm' : v?.agents ? ` · IA ×${v.agents}` : '';
          const node = addLabel('actor-' + m.user_id, (m.display_name || 'Colega') + status, 'room3d-person' + (m.user_id === l?.meId ? ' mine' : ''), () => p.onPerson?.(m.user_id));
          node.style.left = point.x + 'px'; node.style.top = point.y + 'px'; node.style.setProperty('--status', v ? STATE_COLOR[v.shown] : '#aaa');
          node.title = [l?.taskTitle?.(m.user_id), title ? TITLES[title].n : null].filter(Boolean).join(' · ');
          if (l?.callsToMe.some(c => c.from_user === m.user_id)) { node.textContent = '● ATENÇÃO · ' + m.display_name; node.onclick = () => p.onAttention?.(m.user_id); }
        }
        for (const [key, node] of nodes) if (key.startsWith('actor-') && !actorsSeen.has(key)) { node.remove(); nodes.delete(key); }
        if (p.pick) for (const d of layout.desks) {
          const owner = p.members.find(m => m.desk === d.n), selected = p.pick.selected === d.n;
          const point = w.project(new Vector3(d.x, 1.1, d.z));
          const node = addLabel('desk-' + d.n, owner?.display_name || (selected ? p.pick.me.name || 'Você' : `Mesa ${d.n}`), 'room3d-person' + (selected ? ' mine' : ''), owner ? undefined : () => latest.current.pick?.onSelect(d.n));
          node.style.left = point.x + 'px'; node.style.top = point.y + 'px'; node.setAttribute('aria-pressed', String(selected));
        }
        raf = requestAnimationFrame(render);
      };
      raf = requestAnimationFrame(render);
    }).catch(error => { console.error('Sala 3D:', error); if (!stopped) setFailed(true); });
    return () => { stopped = true; cancelAnimationFrame(raf); observer?.disconnect(); world.current?.dispose(); world.current = null; nodes.forEach(n => n.remove()); };
  }, [layout, failed]);
  useEffect(() => {
    if (!expanded) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [expanded]);
  if (failed) return <><p className="note">O modo 3D não está disponível neste dispositivo. A sala continua acessível abaixo.</p><div className="btns"><button onClick={props.onStudio}>Gravar no estúdio</button><button onClick={props.onBrainstorm}>Brainstorm</button><button onClick={props.onOwnDesk}>Voltar à minha mesa</button></div><PixelRoom {...props} /></>;
  return <div className={'office3d' + (expanded ? ' expanded' : '')}>
    <div className="room3d-header"><div><span className="eyebrow">SEU ESCRITÓRIO VIRTUAL</span><b>Sala 8-bit <span>3D</span></b></div><button type="button" className="ghost sm" onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Reduzir escritório' : 'Ampliar escritório'}>{expanded ? 'Reduzir ↙' : 'Ampliar ↗'}</button></div>
    <div className={'room3d-stage' + (layout.reference ? ' reference-scene' : '')}>{layout.reference && <img className="room3d-reference" src="/scenery/office-reference-clean-v4.png" alt="" aria-hidden="true" onError={() => setFailed(true)} />}<div className="room3d-world" ref={host} /><div ref={labels} className="room3d-labels" />{!ready && <div className="room3d-loading">Preparando seu escritório 3D…</div>}</div>
    <div className="room3d-footer"><span><i />{pick ? 'Escolha uma mesa livre para o seu personagem' : hint}</span>{live && <span>{live.views.filter(v => v.online).length} pessoas online</span>}</div>
  </div>;
}
