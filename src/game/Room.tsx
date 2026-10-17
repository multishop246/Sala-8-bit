// Sala em pixel art com as mesas fixas da equipe.
// Etapa 1: mostra quem ocupa cada mesa. Presença ao vivo, copa e reunião chegam na etapa 2.
import { useEffect, useMemo, useRef } from 'react';
import type { Avatar, Member } from '../lib/types';
import { DEFAULT_AVATAR, drawPerson } from './sprites';

const W = 320;
const COLS_X = [14, 70, 126, 182];
const ROW0 = 78, ROW_H = 58, DESK_W = 44;
const BOSS = { x: 252, w: 56 };

export interface DeskSlot { n: number; x: number; y: number }
export function deskLayout(total: number) {
  const slots: DeskSlot[] = [];
  for (let i = 0; i < total; i++) slots.push({ n: i + 1, x: COLS_X[i % 4], y: ROW0 + Math.floor(i / 4) * ROW_H });
  const rows = Math.max(1, Math.ceil(total / 4));
  return { slots, height: ROW0 + rows * ROW_H - 8 };
}

type R = (x: number, y: number, w: number, h: number, c: string) => void;

function drawBackground(r: R, H: number) {
  // parede de tijolos
  r(0, 0, W, 46, '#7a3f34');
  for (let y = 0; y < 46; y += 5) {
    r(0, y, W, 1, '#5e2f27');
    for (let x = (y / 5) % 2 ? 0 : 6; x < W; x += 12) r(x, y + 1, 1, 4, '#5e2f27');
  }
  r(0, 46, W, 3, '#3b2a24'); r(0, 46, W, 1, '#5a4136');
  // piso de madeira
  r(0, 49, W, H - 49, '#9a6a43');
  for (let y = 49; y < H; y += 6) {
    r(0, y, W, 1, '#7d5434');
    for (let x = ((y - 49) / 6) % 2 ? 10 : 34; x < W; x += 48) r(x, y + 1, 1, 5, '#7d5434');
  }
  // janela e quadro
  r(10, 8, 40, 28, '#2a3350'); r(12, 10, 36, 24, '#6fa8dc'); r(29, 10, 2, 24, '#2a3350'); r(12, 21, 36, 2, '#2a3350');
  r(60, 9, 70, 30, '#f4f6f8'); r(62, 11, 66, 2, '#ef5a6f'); r(62, 15, 20, 2, '#f2c94c'); r(62, 19, 30, 2, '#5ad18a');
  r(140, 9, 76, 32, '#17122a'); r(140, 9, 76, 5, '#3a2f10'); r(140, 13, 76, 1, '#b8902f');
  for (let i = 0; i < 4; i++) { r(143 + i * 18, 16, 16, 24, i % 2 ? '#1d1834' : '#211b3b'); r(143 + i * 18, 32, 16, 8, '#b8902f'); }
  // plantas
  r(232, 30, 8, 10, '#c26a3d'); r(230, 22, 12, 9, '#4f9a5c'); r(233, 18, 6, 5, '#5bb36a');
}

function drawDesk(r: R, x: number, y: number, n: number) {
  r(x, y, DESK_W, 10, '#ece7de'); r(x, y, DESK_W, 1, '#f8f5ef'); r(x, y + 10, DESK_W, 6, '#b9b1a4'); r(x, y + 16, DESK_W, 1, '#6d5a48');
  r(x + 2, y + 16, 2, 5, '#5a5f6b'); r(x + 40, y + 16, 2, 5, '#5a5f6b'); r(x + 30, y + 11, 10, 4, '#a89f91'); r(x + 34, y + 13, 2, 1, '#6d655a');
  r(x + 4, y + 3, 3, 3, '#ffffff'); r(x + 7, y + 4, 1, 1, '#ffffff'); r(x + 34, y + 3, 7, 4, '#fdfdfb'); r(x + 35, y + 4, 5, 1, '#c7cbd3');
  if (n % 2) { r(x + 10, y + 2, 3, 3, '#c26a3d'); r(x + 10, y, 3, 2, '#5bb36a'); }
}

function drawChair(r: R, cx: number, y: number) {
  r(cx - 8, y - 13, 16, 13, '#2f3648'); r(cx - 7, y - 14, 14, 1, '#2f3648'); r(cx - 7, y - 12, 14, 1, '#465069');
}

function drawLaptop(r: R, cx: number, y: number, open: boolean) {
  if (open) { r(cx - 6, y - 7, 12, 9, '#b8bec9'); r(cx - 6, y - 7, 12, 1, '#d4d9e1'); r(cx - 1, y - 4, 2, 2, '#5ad18a'); r(cx - 7, y + 2, 14, 1, '#8f96a3'); }
  else { r(cx - 6, y + 2, 12, 2, '#b8bec9'); r(cx - 6, y + 2, 12, 1, '#d4d9e1'); }
}

function drawBossChair(r: R, y: number) {
  const cx = BOSS.x + BOSS.w / 2;
  r(cx - 9, y - 16, 18, 16, '#3a1f17'); r(cx - 8, y - 17, 16, 1, '#3a1f17'); r(cx - 8, y - 15, 16, 1, '#5e3a2a');
}

export interface RoomProps {
  desks: number;
  members: Member[];
  /** modo escolha de mesa */
  pick?: { selected: number | null; onSelect: (n: number) => void; me: { name: string; avatar: Partial<Avatar> } };
  onMemberClick?: (m: Member) => void;
}

export function Room({ desks, members, pick, onMemberClick }: RoomProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { slots, height } = useMemo(() => deskLayout(desks), [desks]);
  const H = Math.max(height, 150);
  const byDesk = useMemo(() => new Map(members.filter(m => m.desk).map(m => [m.desk as number, m])), [members]);
  const bosses = members.filter(m => m.kind === 'gestor' && m.display_name);

  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    const r: R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    c.clearRect(0, 0, W, H);
    drawBackground(r, H);
    // área do gestor: tapete + mesa de madeira
    const by = ROW0 + 4;
    r(BOSS.x - 8, by - 24, BOSS.w + 16, 50, '#5a1f2a'); r(BOSS.x - 6, by - 22, BOSS.w + 12, 46, '#6e2734');
    for (let i = 0; i < BOSS.w + 8; i += 6) r(BOSS.x - 4 + i, by - 20, 3, 1, '#c9a83a');
    drawBossChair(r, by);
    const boss = bosses[0];
    if (boss) drawPerson(c, BOSS.x + BOSS.w / 2 - 6, by - 17, { ...DEFAULT_AVATAR, ...boss.avatar }, { crown: true });
    r(BOSS.x, by, BOSS.w, 10, '#6b4430'); r(BOSS.x, by, BOSS.w, 1, '#8a5c40'); r(BOSS.x, by + 10, BOSS.w, 7, '#4e3122'); r(BOSS.x, by + 10, BOSS.w, 1, '#c9a83a');
    r(BOSS.x + 2, by + 17, 3, 4, '#2e1c13'); r(BOSS.x + BOSS.w - 5, by + 17, 3, 4, '#2e1c13');
    r(BOSS.x + BOSS.w / 2 - 6, by + 12, 12, 3, '#c9a83a'); r(BOSS.x + 44, by + 2, 6, 5, '#2b2f3a'); r(BOSS.x + 45, by + 3, 4, 2, '#3fc1c9');

    for (const s of slots) {
      const cx = s.x + DESK_W / 2;
      const m = byDesk.get(s.n);
      const mine = pick && pick.selected === s.n;
      drawChair(r, cx, s.y);
      const av = m ? m.avatar : mine ? pick!.me.avatar : null;
      if (av) drawPerson(c, cx - 6, s.y - 17, { ...DEFAULT_AVATAR, ...av });
      drawDesk(r, s.x, s.y, s.n);
      drawLaptop(r, cx, s.y, !!av);
      if (pick && !m) {
        c.globalAlpha = mine ? 0.9 : 0.35;
        r(s.x - 2, s.y + 23, DESK_W + 4, 2, mine ? '#8b7bff' : '#c9c1ff');
        c.globalAlpha = 1;
      }
    }
  }, [slots, H, byDesk, bosses, pick]);

  const pct = (v: number, t: number) => `${(v / t) * 100}%`;
  return (
    <div className="room" style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={ref} width={W} height={H} className="px" aria-label="Sala com as mesas da equipe" />
      <div className="room-ov">
        {pick && slots.filter(s => !byDesk.has(s.n)).map(s => (
          <button key={'hit' + s.n} type="button" className="deskhit" aria-label={`Escolher mesa ${s.n}`}
            style={{ left: pct(s.x, W), top: pct(s.y - 18, H), width: pct(DESK_W, W), height: pct(36, H) }}
            onClick={() => pick.onSelect(s.n)} />
        ))}
        {slots.map(s => {
          const m = byDesk.get(s.n);
          const mine = pick && pick.selected === s.n;
          const label = m ? (m.display_name || 'Novo membro') : mine ? (pick!.me.name || 'Você') : `Mesa ${s.n}`;
          const cls = 'plate' + (!m && !mine ? ' empty' : '') + (mine ? ' mine' : '');
          const style = { left: pct(s.x + 16, W), top: pct(s.y + 10.9, H) };
          if (pick && !m) return <button key={s.n} type="button" className={cls} style={style} onClick={() => pick.onSelect(s.n)} aria-pressed={!!mine}>{label}</button>;
          if (m && onMemberClick) return <button key={s.n} type="button" className={cls} style={style} onClick={() => onMemberClick(m)}>{label}</button>;
          return <span key={s.n} className={cls} style={style}>{label}</span>;
        })}
        <span className="plate boss" style={{ left: pct(BOSS.x + BOSS.w / 2, W), top: pct(ROW0 + 4 + 11.5, H) }}>
          {bosses.length ? bosses.map(b => b.display_name).join(' · ') : 'Mesa do gestor'}
        </span>
      </div>
    </div>
  );
}

