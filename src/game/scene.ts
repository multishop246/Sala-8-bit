// Desenho da sala em pixel art (320 px de largura). Coordenadas em pixels da sala.
import type { Avatar } from '../lib/types';
import { DEFAULT_AVATAR, drawPerson, lerpC } from './sprites';

export const W = 320;
export const COLS_X = [14, 70, 126, 182];
export const ROW0 = 78, ROW_H = 58, DESK_W = 44;
export const BOSS = { x: 252, y: 102, w: 56 };
export const COPA = { x: 246, y: 50, w: 72, h: 16 };
export const MEET = { x: 240, y: 132, w: 78 };
export const MIN_H = 192;

export type R = (x: number, y: number, w: number, h: number, c: string) => void;
export interface DeskSlot { n: number; x: number; y: number }

export function deskLayout(total: number) {
  const slots: DeskSlot[] = [];
  for (let i = 0; i < total; i++) slots.push({ n: i + 1, x: COLS_X[i % 4], y: ROW0 + Math.floor(i / 4) * ROW_H });
  const rows = Math.max(1, Math.ceil(total / 4));
  return { slots, height: Math.max(MIN_H, ROW0 + rows * ROW_H - 8) };
}

const hsh = (n: number) => { n = Math.imul(n ^ 61, 2654435761); return (n >>> 0) / 4294967296; };

// ---------------------------------------------------------------- céu pela hora do dia
const SKY: [number, string, string][] = [[0, '#0f1630', '#1b2747'], [330, '#0f1630', '#1b2747'], [375, '#2b2f5a', '#f39c6b'], [450, '#5aa0e6', '#cfe8ff'], [720, '#4a95e8', '#a9d8ff'], [960, '#5d9be0', '#ffe0a8'], [1050, '#3c3f7a', '#f08a5d'], [1110, '#1d2550', '#5a4a7a'], [1170, '#0f1630', '#1b2747'], [1440, '#0f1630', '#1b2747']];
function skyAt(m: number): [string, string] {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [a, t1, b1] = SKY[i], [b, t2, b2] = SKY[i + 1];
    if (m >= a && m <= b) { const t = (m - a) / (b - a || 1); return [lerpC(t1, t2, t), lerpC(b1, b2, t)]; }
  }
  return [SKY[0][1], SKY[0][2]];
}
const darkAt = (m: number) => (m < 360 || m > 1140 ? 1 : m < 450 ? (450 - m) / 90 : m > 1050 ? (m - 1050) / 90 : 0);
const BLD = [[7, 26, 6], [13, 22, 5], [18, 28, 7], [25, 19, 6], [31, 24, 5], [36, 27, 9]].map(([x, y, w]) => {
  const cells: [number, number, boolean][] = [];
  for (let wy = y + 2; wy < 38; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) cells.push([wx, wy, hsh(wx * 31 + wy) < 0.38]);
  return { x, y, w, cells };
});
const STARS = Array.from({ length: 14 }, (_, i) => [7 + Math.floor(hsh(i * 7 + 1) * 38), 9 + Math.floor(hsh(i * 13 + 5) * 14)]);

function drawWindow(r: R, m: number, frame: number) {
  r(5, 7, 42, 34, '#2a3350');
  const [top, bot] = skyAt(m), dk = darkAt(m);
  for (let y = 9; y < 39; y++) r(7, y, 38, 1, lerpC(top, bot, (y - 9) / 29));
  if (dk > 0.5) STARS.forEach(([x, y], i) => { if ((frame + i * 5) % 40 > 2) r(x, y, 1, 1, '#c9d4ff'); });
  if (m >= 390 && m <= 1110) {
    const t = (m - 390) / 720, sx = Math.round(9 + t * 31), sy = Math.round(28 - Math.sin(t * Math.PI) * 16), sc = t < 0.15 || t > 0.85 ? '#ffb36b' : '#ffe7a3';
    r(sx, sy, 4, 4, sc); r(sx + 1, sy - 1, 2, 1, sc); r(sx + 1, sy + 4, 2, 1, sc); r(sx - 1, sy + 1, 1, 2, sc); r(sx + 4, sy + 1, 1, 2, sc);
  } else { r(36, 12, 4, 4, '#f3e9c6'); r(37, 11, 2, 1, '#f3e9c6'); r(35, 13, 1, 2, '#f3e9c6'); r(38, 12, 2, 2, lerpC(top, bot, 0.1)); }
  if (dk < 0.6) { const cl = Math.floor(frame / 5) % 32; r(7 + cl, 13, 6, 2, '#f4f6fa'); r(8 + cl, 12, 3, 1, '#f4f6fa'); }
  const bc = lerpC('#6b7a96', '#0b1122', dk);
  BLD.forEach(b => { r(b.x, b.y, b.w, 39 - b.y, bc); b.cells.forEach(([x, y, l]) => { if (dk > 0.4) { if (l) r(x, y, 1, 1, '#f6d27a'); } else r(x, y, 1, 1, '#9fb3cf'); }); });
  r(25, 9, 2, 30, '#5b6170');
}

const DIG: Record<string, string[]> = { 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '001', '001'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };
function drawClock(r: R, m: number, frame: number) {
  r(282, 7, 25, 13, '#3a3f4c'); r(283, 8, 23, 11, '#11131a');
  const s = String(Math.floor(m / 60) % 24).padStart(2, '0') + String(m % 60).padStart(2, '0'), xs = [285, 289, 296, 300];
  [...s].forEach((ch, i) => DIG[ch].forEach((row, ry) => [...row].forEach((b, cx) => { if (b === '1') r(xs[i] + cx, 11 + ry, 1, 1, '#ff6b5a'); })));
  if (frame % 8 < 5) { r(293, 12, 1, 1, '#ff6b5a'); r(293, 14, 1, 1, '#ff6b5a'); }
}

// ---------------------------------------------------------------- fundo
export function drawBackground(r: R, H: number, m: number, frame: number) {
  r(0, 0, W, 46, '#7a3f34');
  for (let y = 0; y < 46; y += 5) { r(0, y, W, 1, '#5e2f27'); for (let x = (y / 5) % 2 ? 0 : 6; x < W; x += 12) r(x, y + 1, 1, 4, '#5e2f27'); }
  r(0, 46, W, 3, '#3b2a24'); r(0, 46, W, 1, '#5a4136');
  r(0, 49, W, H - 49, '#9a6a43');
  for (let y = 49; y < H; y += 6) { r(0, y, W, 1, '#7d5434'); for (let x = ((y - 49) / 6) % 2 ? 10 : 34; x < W; x += 48) r(x, y + 1, 1, 5, '#7d5434'); }
  drawWindow(r, m, frame);
  // quadro de tarefas (preenchido na versão 0.3)
  r(56, 7, 74, 34, '#d9dde3'); r(57, 8, 72, 32, '#f4f6f8');
  ['#ef5a6f', '#f2c94c', '#5ad18a'].forEach((c, i) => { r(59 + i * 24, 10, 21, 2, c); if (i) r(57 + i * 24, 13, 1, 26, '#d9dde3'); });
  // mural da glória (preenchido na versão 0.4)
  r(140, 8, 76, 33, '#17122a'); r(140, 8, 76, 5, '#3a2f10'); r(140, 12, 76, 1, '#b8902f');
  for (let i = 0; i < 4; i++) { r(143 + i * 18, 15, 16, 25, i % 2 ? '#1d1834' : '#211b3b'); r(143 + i * 18, 31, 16, 9, '#b8902f'); r(143 + i * 18, 31, 16, 1, '#f2c94c'); }
  [148, 177, 206].forEach((x, i) => { if ((frame + i * 3) % 10 < 6) r(x, 9, 1, 1, '#fff3c4'); });
  // planta e relógio
  r(226, 30, 8, 10, '#c26a3d'); r(224, 22, 12, 9, '#4f9a5c'); r(227, 18, 6, 5, '#5bb36a');
  drawClock(r, m, frame);
}

// ---------------------------------------------------------------- copa
export function drawCopa(r: R, frame: number) {
  const { x, y, w } = COPA;
  // armário alto e máquina de café na parede
  r(x + 2, 24, 18, 22, '#cfd5e0'); r(x + 2, 24, 18, 1, '#e8ecf2'); r(x + 10, 26, 1, 18, '#aab2c2');
  r(x + 48, 30, 12, 16, '#2b2f3a'); r(x + 49, 31, 10, 4, '#3a4050'); r(x + 52, 37, 4, 1, '#5ad18a');
  // bancada
  r(x, y, w, 4, '#e8ecf2'); r(x, y, w, 1, '#ffffff'); r(x, y + 4, w, 12, '#8b93a7'); r(x, y + 15, w, 1, '#4e5568');
  for (let i = 0; i < 4; i++) r(x + 4 + i * 17, y + 7, 14, 6, '#7a8296');
  // xícaras e vapor
  [[x + 26, '#f4f6fa'], [x + 32, '#e76f8a'], [x + 38, '#3fb6a8']].forEach(([cx, c]) => { r(cx as number, y - 3, 3, 3, c as string); r((cx as number) + 3, y - 2, 1, 1, c as string); });
  const s = Math.floor(frame / 3) % 3; r(x + 27, y - 5 - s, 1, 1, '#ffffff'); r(x + 33, y - 6 + s % 2, 1, 1, '#ffffff');
}

// ---------------------------------------------------------------- mesa do gestor
export function drawBossArea(r: R) {
  const { x, y, w } = BOSS;
  r(x - 8, y - 24, w + 16, 46, '#5a1f2a'); r(x - 6, y - 22, w + 12, 42, '#6e2734');
  for (let i = 0; i < w + 8; i += 6) r(x - 4 + i, y - 20, 3, 1, '#c9a83a');
  const cx = x + w / 2;
  r(cx - 9, y - 16, 18, 16, '#3a1f17'); r(cx - 8, y - 17, 16, 1, '#3a1f17'); r(cx - 8, y - 15, 16, 1, '#5e3a2a'); r(cx - 1, y - 14, 2, 1, '#c9a83a');
}
export function drawBossDesk(r: R) {
  const { x, y, w } = BOSS;
  r(x, y, w, 10, '#6b4430'); r(x, y, w, 1, '#8a5c40'); r(x, y + 10, w, 7, '#4e3122'); r(x, y + 10, w, 1, '#c9a83a');
  r(x + 2, y + 17, 3, 4, '#2e1c13'); r(x + w - 5, y + 17, 3, 4, '#2e1c13');
  r(x + w / 2 - 6, y + 12, 12, 3, '#c9a83a'); r(x + 4, y + 3, 4, 4, '#ffffff'); r(x + 44, y + 2, 6, 5, '#2b2f3a'); r(x + 45, y + 3, 4, 2, '#3fc1c9');
}

// ---------------------------------------------------------------- sala de reunião
export function drawMeetingRoom(r: R, H: number, busy: boolean) {
  const { x, y, w } = MEET, h = H - y - 4;
  r(x, y, w, h, '#36456e'); r(x + 2, y + 2, w - 4, h - 4, busy ? '#4a5d92' : '#3d4f80');
  for (let yy = y + 6; yy < y + h - 2; yy += 6) r(x + 2, yy, w - 4, 1, '#34446f');
  r(x, y, w, 2, '#9fb0d6'); r(x, y, 2, h, '#9fb0d6'); r(x + w - 2, y, 2, h, '#9fb0d6'); r(x, y + h - 2, w, 2, '#9fb0d6');
  r(x + 30, y, 18, 2, '#3d4f80'); // porta
  // quadro na parede da sala
  r(x + 8, y + 5, 22, 10, '#f4f6f8'); r(x + 10, y + 7, 14, 1, '#8b7bff'); r(x + 10, y + 10, 10, 1, '#c7cbd3');
}
export function drawMeetingTable(r: R) {
  const tx = MEET.x + 14, ty = MEET.y + 30;
  r(tx, ty, 50, 14, '#6b4430'); r(tx, ty, 50, 1, '#8a5c40'); r(tx, ty + 14, 50, 3, '#4e3122');
  r(tx + 6, ty + 4, 6, 4, '#f4f6fa'); r(tx + 36, ty + 5, 8, 3, '#2b2f3a');
}
/** posições (canto superior esquerdo do sprite sentado) atrás da mesa de reunião */
export function meetingSeats(n: number) {
  const out: { x: number; y: number }[] = [];
  const tx = MEET.x + 14, ty = MEET.y + 30;
  for (let i = 0; i < n; i++) {
    if (i < 4) out.push({ x: tx + 1 + i * 12, y: ty - 15 });
    else out.push({ x: i % 2 ? tx + 52 : tx - 13, y: ty - 6 + Math.floor((i - 4) / 2) * 12 });
  }
  return out;
}

// ---------------------------------------------------------------- mesas
export function drawChair(r: R, cx: number, y: number) { r(cx - 8, y - 13, 16, 13, '#2f3648'); r(cx - 7, y - 14, 14, 1, '#2f3648'); r(cx - 7, y - 12, 14, 1, '#465069'); }
export function drawDesk(r: R, x: number, y: number, n: number) {
  r(x, y, DESK_W, 10, '#ece7de'); r(x, y, DESK_W, 1, '#f8f5ef'); r(x, y + 10, DESK_W, 6, '#b9b1a4'); r(x, y + 16, DESK_W, 1, '#6d5a48');
  r(x + 2, y + 16, 2, 5, '#5a5f6b'); r(x + 40, y + 16, 2, 5, '#5a5f6b'); r(x + 30, y + 11, 10, 4, '#a89f91'); r(x + 34, y + 13, 2, 1, '#6d655a');
  r(x + 4, y + 3, 3, 3, '#ffffff'); r(x + 7, y + 4, 1, 1, '#ffffff'); r(x + 34, y + 3, 7, 4, '#fdfdfb'); r(x + 35, y + 4, 5, 1, '#c7cbd3');
  if (n % 2) { r(x + 10, y + 2, 3, 3, '#c26a3d'); r(x + 10, y, 3, 2, '#5bb36a'); }
}
export function drawLaptop(r: R, cx: number, y: number, open: boolean, color = '#5ad18a') {
  if (open) { r(cx - 6, y - 7, 12, 9, '#b8bec9'); r(cx - 6, y - 7, 12, 1, '#d4d9e1'); r(cx - 1, y - 4, 2, 2, color); r(cx - 7, y + 2, 14, 1, '#8f96a3'); }
  else { r(cx - 6, y + 2, 12, 2, '#b8bec9'); r(cx - 6, y + 2, 12, 1, '#d4d9e1'); }
}
export function drawPhone(r: R, x: number, y: number) { r(x, y, 3, 5, '#1c1d26'); r(x, y + 1, 3, 3, '#6ea8ff'); }
export function drawHands(r: R, cx: number, y: number, skin: string, frame: number) {
  const f = frame % 2; r(cx - 8, y + (f ? 1 : 0), 2, 2, skin); r(cx + 6, y + (f ? 0 : 1), 2, 2, skin);
}

export function person(c: CanvasRenderingContext2D, x: number, y: number, av: Partial<Avatar>, opts: { stand?: boolean; crown?: boolean; blink?: boolean } = {}) {
  drawPerson(c, x, y, { ...DEFAULT_AVATAR, ...av }, opts);
}
/** visitante genérico na reunião */
export function guest(c: CanvasRenderingContext2D, x: number, y: number, i: number) {
  const tones = ['#e0ac85', '#c68b62', '#f6d3b8', '#8d5a3b'];
  person(c, x, y, { sex: i % 2 ? 'f' : 'm', skin: tones[i % 4], hair: i % 2 ? '#3b2418' : '#141010', hs: i % 2 ? 'longo' : 'curto', out: 'social', oc: '#6b7390' });
}
