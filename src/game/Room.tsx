// Sala em pixel art. Dois modos:
//  · escolha de mesa (cadastro): mostra mesas livres para clicar;
//  · ao vivo: cada pessoa aparece onde está (mesa, copa, reunião, mesa do gestor).
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Avatar, Member } from '../lib/types';
import type { PersonView } from '../live/LiveProvider';
import { fmtClock, STATE_COLOR } from '../live/LiveProvider';
import {
  BOSS, COPA, DESK_W, MEET, W, deskLayout, drawBackground, drawBossArea, drawBossDesk, drawChair, drawCopa, drawDesk,
  drawHands, drawLaptop, drawMeetingRoom, drawMeetingTable, drawPhone, guest, meetingSeats, person, type R
} from './scene';
import { DEFAULT_AVATAR } from './sprites';

export { deskLayout };

interface LiveProps {
  views: PersonView[];
  meetings: { id: string; subject: string; visitors: number; outsiders: number; people: string[] }[];
  callsToMe: { from_user: string }[];
  meId: string;
  now: number;
  gestorName: string | null;
}
export interface RoomProps {
  desks: number;
  members: Member[];
  pick?: { selected: number | null; onSelect: (n: number) => void; me: { name: string; avatar: Partial<Avatar> } };
  live?: LiveProps;
  onPerson?: (userId: string) => void;
  onCopa?: () => void;
  onMeetingRoom?: () => void;
  onBoss?: () => void;
  onAttention?: (fromUserId: string) => void;
}

const pct = (v: number, t: number) => `${(v / t) * 100}%`;

export function Room({ desks, members, pick, live, onPerson, onCopa, onMeetingRoom, onBoss, onAttention }: RoomProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const { slots, height: H } = useMemo(() => deskLayout(desks), [desks]);
  const byDesk = useMemo(() => new Map(members.filter(m => m.desk && m.kind === 'membro').map(m => [m.desk as number, m])), [members]);
  const gestores = useMemo(() => members.filter(m => m.kind === 'gestor'), [members]);

  useEffect(() => { const t = window.setInterval(() => setFrame(f => f + 1), 300); return () => window.clearInterval(t); }, []);

  // quem está onde
  const layout = useMemo(() => {
    const vOf = (id: string) => live?.views.find(v => v.member.user_id === id);
    const atDesk = (m: Member) => !live || vOf(m.user_id)?.shown === 'trabalhando';
    const cafe = live ? live.views.filter(v => v.shown === 'cafe') : [];
    const boss = live ? live.views.filter(v => v.shown === 'pausa_gestor') : [];
    const gestorHere = live ? live.views.filter(v => v.member.kind === 'gestor' && v.shown === 'trabalhando').map(v => v.member) : gestores;
    const meet = live?.meetings[0];
    const meetPeople = meet ? meet.people.map(id => vOf(id)?.member).filter(Boolean) as Member[] : [];
    return { vOf, atDesk, cafe, boss, gestorHere, meet, meetPeople };
  }, [live, gestores]);

  const cafeSpot = (i: number) => ({ x: COPA.x + 2 + i * 17, y: COPA.y - 2 });
  const bossSpot = (i: number) => ({ x: BOSS.x - 14 - i * 11, y: BOSS.y - 14 });

  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    const r: R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const d = new Date(live?.now || Date.now());
    const m = d.getHours() * 60 + d.getMinutes();
    c.clearRect(0, 0, W, H);
    drawBackground(r, H, m, frame);
    drawCopa(r, frame);
    drawMeetingRoom(r, H, !!layout.meet);

    // reunião: pessoas atrás da mesa, depois a mesa
    if (layout.meet) {
      const nGuests = layout.meet.visitors + layout.meet.outsiders;
      const seats = meetingSeats(layout.meetPeople.length + nGuests);
      layout.meetPeople.forEach((mm, i) => seats[i] && person(c, seats[i].x, seats[i].y, mm.avatar, { crown: mm.kind === 'gestor', blink: (frame + i * 7) % 17 === 0 }));
      for (let g = 0; g < nGuests; g++) { const s = seats[layout.meetPeople.length + g]; if (s) guest(c, s.x, s.y, g); }
    }
    drawMeetingTable(r);

    // mesa do gestor
    drawBossArea(r);
    const g = layout.gestorHere[0];
    if (g) person(c, BOSS.x + BOSS.w / 2 - 6, BOSS.y - 17, g.avatar, { crown: true, blink: frame % 23 === 0 });
    drawBossDesk(r);

    // mesas da equipe
    for (const s of slots) {
      const cx = s.x + DESK_W / 2;
      const mm = byDesk.get(s.n);
      const chosen = pick && pick.selected === s.n;
      drawChair(r, cx, s.y);
      const here = mm ? layout.atDesk(mm) : false;
      const av = here ? mm!.avatar : chosen ? pick!.me.avatar : null;
      if (av) person(c, cx - 6, s.y - 17, av, { blink: (frame + s.n * 5) % 19 === 0 });
      drawDesk(r, s.x, s.y, s.n);
      const v = mm ? layout.vOf(mm.user_id) : undefined;
      const phone = here && v?.device === 'celular';
      drawLaptop(r, cx, s.y, !!av && !phone);
      if (here && live) {
        if (phone) drawPhone(r, cx + 4, s.y - 2);
        else drawHands(r, cx, s.y, (av as Avatar).skin || DEFAULT_AVATAR.skin, frame);
      }
      if (pick && !mm) { c.globalAlpha = chosen ? 0.9 : 0.35; r(s.x - 2, s.y + 23, DESK_W + 4, 2, chosen ? '#8b7bff' : '#c9c1ff'); c.globalAlpha = 1; }
    }

    // em pé: pausa do gestor e copa (desenhados por último, na frente)
    layout.boss.forEach((v, i) => { const p = bossSpot(i); person(c, p.x, p.y, v.member.avatar, { stand: true, blink: (frame + i) % 21 === 0 }); });
    layout.cafe.slice(0, 4).forEach((v, i) => {
      const p = cafeSpot(i);
      person(c, p.x, p.y, v.member.avatar, { stand: true, blink: (frame + i * 3) % 13 === 0 });
      r(p.x + 9, p.y + 14, 3, 3, '#f4f6fa'); // xícara na mão
    });
  }, [frame, slots, H, byDesk, pick, live, layout]);

  const calls = new Set(live?.callsToMe.map(c => c.from_user));
  const box = (x: number, y: number, w: number, h: number): CSSProperties => ({ left: pct(x, W), top: pct(y, H), width: pct(w, W), height: pct(h, H) });
  const inMeeting = !!live?.meetings.some(m => m.people.includes(live.meId));

  return (
    <div className="room" style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={ref} width={W} height={H} className="px" aria-label="Sala com as mesas da equipe" />
      <div className="room-ov">
        {/* áreas clicáveis (ficam embaixo das plaquinhas) */}
        {live && onCopa && <button className="deskhit" aria-label="Copa: fazer uma pausa" style={box(COPA.x, 22, COPA.w, COPA.y - 4)} onClick={onCopa} />}
        {live && onMeetingRoom && <button className="deskhit" aria-label={inMeeting ? 'Sair da reunião' : 'Sala de reunião'} style={box(MEET.x, MEET.y, MEET.w, H - MEET.y - 4)} onClick={onMeetingRoom} />}
        {live && onBoss && <button className="deskhit" aria-label="Mesa do gestor" style={box(BOSS.x - 4, BOSS.y - 22, BOSS.w + 8, 44)} onClick={onBoss} />}
        {slots.map(s => {
          const mm = byDesk.get(s.n);
          if (pick && !mm) return <button key={'h' + s.n} type="button" className="deskhit" aria-label={`Escolher mesa ${s.n}`} style={box(s.x, s.y - 18, DESK_W, 36)} onClick={() => pick.onSelect(s.n)} />;
          if (mm && onPerson) return <button key={'h' + s.n} type="button" className="deskhit" aria-label={`Mesa de ${mm.display_name}`} style={box(s.x, s.y - 18, DESK_W, 36)} onClick={() => onPerson(mm.user_id)} />;
          return null;
        })}

        {live && <span className="wl" style={{ left: pct(COPA.x + 30, W), top: pct(19, H) }}>Copa</span>}
        {live && <span className="wl" style={{ left: pct(MEET.x + MEET.w / 2, W), top: pct(H - 13, H) }}>{inMeeting ? 'Reunião · clique para sair' : 'Sala de reunião'}</span>}

        {/* plaquinhas das mesas */}
        {slots.map(s => {
          const mm = byDesk.get(s.n);
          const chosen = pick && pick.selected === s.n;
          const label = mm ? (mm.display_name || 'Novo membro') : chosen ? (pick!.me.name || 'Você') : `Mesa ${s.n}`;
          const v = mm && live ? layout.vOf(mm.user_id) : undefined;
          const cls = 'plate' + (!mm && !chosen ? ' empty' : '') + (chosen ? ' mine' : '');
          const style = { left: pct(s.x + 16, W), top: pct(s.y + 10.9, H) };
          const dot = v ? <i className="pdot" style={{ background: v.shown === 'fora' || v.shown === 'encerrado' ? '#555c70' : STATE_COLOR[v.shown] }} /> : null;
          if (pick && !mm) return <button key={s.n} type="button" className={cls} style={style} onClick={() => pick.onSelect(s.n)} aria-pressed={!!chosen}>{label}</button>;
          if (mm && onPerson) return <button key={s.n} type="button" className={cls} style={style} onClick={() => onPerson(mm.user_id)}>{dot}{label}</button>;
          return <span key={s.n} className={cls} style={style}>{dot}{label}</span>;
        })}
        <span className="plate boss" style={{ left: pct(BOSS.x + BOSS.w / 2, W), top: pct(BOSS.y + 11.5, H) }}>{gestores.length ? gestores.map(g => g.display_name).join(' · ') : 'Mesa do gestor'}</span>

        {live && <>
          {slots.map(s => {
            const mm = byDesk.get(s.n); if (!mm) return null;
            const v = layout.vOf(mm.user_id); if (!v) return null;
            const txt = v.shown === 'almoco' ? `almoçando · ${Math.floor((live.now - v.since) / 60000)} min` : v.shown === 'fora' ? 'fora do sistema' : v.shown === 'encerrado' ? 'encerrou o expediente' : null;
            return txt ? <span key={'s' + s.n} className="sign" style={{ left: pct(s.x + DESK_W / 2, W), top: pct(s.y + 21.5, H) }}>{txt}</span> : null;
          })}
          {slots.map(s => {
            const mm = byDesk.get(s.n); if (!mm) return null;
            const v = layout.vOf(mm.user_id); if (!v || v.shown !== 'trabalhando') return null;
            return <button key={'b' + s.n} className="bub" style={{ left: pct(s.x + DESK_W / 2, W), top: pct(s.y - 18.5, H) }} onClick={() => onPerson?.(mm.user_id)}>
              <i style={{ background: STATE_COLOR.trabalhando }} />{v.device === 'celular' ? 'Pelo celular' : 'No escritório'}</button>;
          })}
          {layout.cafe.slice(0, 4).map((v, i) => {
            const p = cafeSpot(i), over = v.cafeLeft < 0;
            return <span key={'c' + v.member.user_id}>
              <span className="bub" style={{ left: pct(p.x + 6, W), top: pct(p.y - 1 - (i % 2) * 6, H) }} title="Café restante hoje"><i style={{ background: over ? '#ef5a6f' : STATE_COLOR.cafe }} /><span className={'tm' + (over ? ' over' : '')} style={{ marginLeft: 0 }}>{over ? `+${Math.ceil(-v.cafeLeft / 60)} min` : fmtClock(v.cafeLeft)}</span></span>
              <button className="tag" style={{ left: pct(p.x + 6, W), top: pct(p.y + 26.5, H) }} onClick={() => onPerson?.(v.member.user_id)}>{v.member.display_name}</button>
            </span>;
          })}
          {layout.boss.map((v, i) => {
            const p = bossSpot(i);
            return <span key={'g' + v.member.user_id}>
              {i === 0 && <span className="bub" style={{ left: pct(p.x + 6, W), top: pct(p.y - 1, H) }}><i style={{ background: STATE_COLOR.pausa_gestor }} />Pausa, {live.gestorName || 'gestor'}</span>}
              <button className="tag" style={{ left: pct(p.x + 6, W), top: pct(p.y + 26.5, H) }} onClick={() => onPerson?.(v.member.user_id)}>{v.member.display_name}</button>
            </span>;
          })}
          {layout.meet && <span className="bub" style={{ left: pct(MEET.x + MEET.w / 2, W), top: pct(MEET.y + 1, H) }}>
            <i style={{ background: STATE_COLOR.reuniao }} />{layout.meet.subject} · {layout.meet.people.length + layout.meet.visitors + layout.meet.outsiders}</span>}
          {slots.map(s => {
            const mm = byDesk.get(s.n); if (!mm || !calls.has(mm.user_id)) return null;
            return <button key={'a' + s.n} className="att" style={{ left: pct(s.x + 11, W), top: pct(s.y + 1.6, H) }} onClick={() => onAttention?.(mm.user_id)} title={`${mm.display_name} chamou sua atenção · clique para responder`}>ATENÇÃO</button>;
          })}
          {gestores.filter(g => calls.has(g.user_id)).slice(0, 1).map(g => (
            <button key="ag" className="att" style={{ left: pct(BOSS.x + 10, W), top: pct(BOSS.y + 1.6, H) }} onClick={() => onAttention?.(g.user_id)}>ATENÇÃO</button>
          ))}
        </>}
      </div>
    </div>
  );
}
