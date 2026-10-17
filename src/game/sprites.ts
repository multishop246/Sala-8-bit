// Sprites em pixel art dos personagens (12 px de largura).
// Cada grade é um mapa linha → texto de 12 caracteres; "." é transparente.
import type { Avatar } from '../lib/types';
import { HATC, HATS, NOEL, THEME, themeVariant } from './themes';

type Grid = Record<string, string>;
type ColorMap = Record<string, string>;

const FACE: Grid = { 2: '...SSSSSS...', 3: '..SSSSSSSS..', 4: '..SSSSSSSS..', 5: '..SSSSSSSS..', 6: '..SSESSESS..', 7: '..SSSSSSSS..', 8: '..SSSmmSSS..', 9: '...SSSSSS...', 10: '....NSSN....', 11: '....NNNN....' };
const TORSO: Grid = { 12: '...OOOOOO...', 13: '..OOOOOOOO..', 14: '.OOOOOOOOOO.', 15: '.AOOOOOOOOA.', 16: '.AOOOOOOOOA.', 17: '.AOOOOOOOOA.', 18: '.SOOOOOOOOS.', 19: '..OOOOOOOO..' };
const LEGS: Grid = { 20: '..PPPPPPPP..', 21: '..PPPPPPPP..', 22: '..PPP..PPP..', 23: '..PPP..PPP..', 24: '..PPP..PPP..', 25: '..BBB..BBB..' };

export const HAIR: Record<string, Grid> = {
  curto: { 2: '...HHHHHH...', 3: '..HHHHHHHH..', 4: '..HHHHHHHH..', 5: '..H......H..' },
  franja: { 2: '...HHHHHH...', 3: '..HHHHHHHH..', 4: '..HHHHHHHH..', 5: '..HHHHH..H..' },
  longo: { 2: '...HHHHHH...', 3: '..HHHHHHHH..', 4: '.HHHHHHHHHH.', 5: '.HH......HH.', 6: '.H........H.', 7: '.H........H.', 8: '.H........H.', 9: '.HH......HH.', 10: '.HH......HH.', 11: '.HH......HH.', 12: '.H........H.', 13: '.H........H.' },
  coque: { 0: '....HHHH....', 1: '....DHHD....', 2: '...HHHHHH...', 3: '..HHHHHHHH..', 4: '..HHHHHHHH..', 5: '..H......H..' },
  cacheado: { 0: '...HHHHHH...', 1: '.HHHHHHHHHH.', 2: 'HHHHHHHHHHHH', 3: 'HHHHHHHHHHHH', 4: 'HHHHHHHHHHHH', 5: 'HH........HH', 6: 'HH........HH', 7: 'HH........HH', 8: '.H........H.' },
  rabo: { 2: '...HHHHHH...', 3: '..HHHHHHHHH.', 4: '..HHHHHHHHHH', 5: '..H......HHH', 6: '..........HH', 7: '..........HH', 8: '...........H', 9: '...........H' },
  raspado: { 2: '...DDDDDD...', 3: '..DDDDDDDD..', 4: '..D......D..' },
  careca: {}
};
export const HAIR_STYLES: [string, string][] = [['curto', 'Curto'], ['franja', 'Franja'], ['longo', 'Longo'], ['coque', 'Coque'], ['cacheado', 'Cacheado'], ['rabo', 'Rabo de cavalo'], ['raspado', 'Raspado'], ['careca', 'Careca']];

const ACC: Record<string, Grid> = {
  nenhum: {},
  relogio: { 16: '..........G.', 17: '..........w.' },
  fone: { 2: '...GGGGGG...', 5: '.G........G.', 6: '.V........V.', 7: '.G........G.' }
};
export const ACCESSORIES: [string, string][] = [['nenhum', 'Nenhum'], ['relogio', 'Relógio']];

const BEARDS: Record<string, Grid> = {
  curta: { 8: '..X......X..', 9: '..XXX..XXX..', 10: '...XXXXXX...' },
  cheia: { 7: '..H......H..', 8: '..HHH..HHH..', 9: '..HHHHHHHH..', 10: '...HHHHHH...' },
  cavanhaque: { 8: '...HHHHHH...', 9: '...H.mm.H...', 10: '.....HH.....' },
  bigode: { 8: '...HHHHHH...', 9: '...H.mm.H...' }
};
export const BEARD_STYLES: [string, string][] = [['nenhuma', 'Sem barba'], ['curta', 'Curta'], ['cheia', 'Cheia'], ['cavanhaque', 'Cavanhaque'], ['bigode', 'Bigode']];

export const OUTFITS: Record<string, { n: string; base?: string; hidden?: boolean; ov: Grid }> = {
  camiseta: { n: 'Camiseta', ov: { 12: '.....SS.....' } },
  moletom: { n: 'Moletom', ov: { 12: '..KKKKKKKK..', 13: '...K.SS.K...', 14: '....W..W....', 15: '....W..W....', 17: '...KKKKKK...' } },
  blazer: { n: 'Blazer', ov: { 12: '....WWWW....', 13: '...KWWWWK...', 14: '...KWWWWK...', 15: '....KWWK....', 16: '.....WW.....', 17: '.....KK.....' } },
  social: { n: 'Camisa e gravata', base: '#e8ecf2', ov: { 12: '....KTTK....', 13: '.....TT.....', 14: '.....TT.....', 15: '....TTTT....', 16: '.....TT.....' } },
  cardiga: { n: 'Cardigã', ov: { 12: '....WWWW....', 13: '.....WW.....', 14: '....KWW.....', 15: '.....WW.....', 16: '....KWW.....', 17: '.....WW.....', 18: '....KWW.....', 19: '.....WW.....' } },
  jaqueta: { n: 'Jaqueta', ov: { 12: '..KKKKKKKK..', 13: '......K.....', 14: '......K.....', 15: '......K.....', 16: '..KK..K.KK..', 17: '......K.....', 18: '......K.....', 19: '......K.....' } },
  terno: { n: 'Terno', ov: { 12: '....WTTW....', 13: '...KWTTWK...', 14: '...KWTTWK...', 15: '....KTTK....', 16: '.....TT.....', 17: '.....KK.....', 18: '.SKOOOOOKS..' } }
};

const CROWN: Grid = { '-4': '..P..PP..P..', '-3': '..Y..YY..Y..', '-2': '..YY.YY.YY..', '-1': '..YYYYYYYY..', 0: '..YRYBBYRY..', 1: '..DDDDDDDD..' };

export const SKINS = ['#f6d3b8', '#eec1a0', '#e0ac85', '#c68b62', '#a8704a', '#8d5a3b', '#6b4128', '#4a2c1c'];
export const HAIR_COLORS = ['#141010', '#3b2418', '#5a3a26', '#7a3b22', '#b5652e', '#d9a441', '#e8d9b0', '#9aa0a8', '#6a4fb0', '#d6487c'];
export const OUTFIT_COLORS = ['#e76f8a', '#3fb6a8', '#3d4a7a', '#e2a33b', '#b84a4a', '#4f7a52', '#8b7bff', '#2b2f3a', '#1d2b55'];

export const DEFAULT_AVATAR: Avatar = { sex: 'f', skin: '#e0ac85', hair: '#3b2418', hs: 'curto', beard: 'nenhuma', acc: 'nenhum', out: 'camiseta', oc: '#8b7bff' };

// ------------------------------------------------------------- cores
export function hx(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
export function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function shade(h: string, a: number) {
  const [r, g, b] = hx(h);
  return a < 0 ? toHex(r * (1 + a), g * (1 + a), b * (1 + a)) : toHex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a);
}
export function lerpC(a: string, b: string, t: number) {
  const A = hx(a), B = hx(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export const inkFor = (h: string) => { const [r, g, b] = hx(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#141a2b' : '#ffffff'; };

function drawGrid(c: CanvasRenderingContext2D, ox: number, oy: number, g: Grid, map: ColorMap,
  fn?: (ch: string, r: number, i: number, col: string | undefined) => string | undefined) {
  for (const k in g) {
    const r = +k, s = g[k];
    for (let i = 0; i < 12; i++) {
      const ch = s[i];
      if (ch === '.' || ch === undefined) continue;
      let col: string | undefined = map[ch];
      if (fn) col = fn(ch, r, i, col);
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(ox + i, oy + r, 1, 1);
    }
  }
}

export interface DrawOpts { stand?: boolean; blink?: boolean; music?: boolean; crown?: boolean }

const hsh = (n: number) => { n = Math.imul(n ^ 61, 2654435761); return (n >>> 0) / 4294967296; };

/** Desenha o personagem com o canto superior esquerdo em (ox, oy). Ocupa 12×20 (sentado) ou 12×26 (em pé).
 *  Se a.theme estiver definido, veste a roupa temática (variação a.vi da equipe). */
export function drawPerson(c: CanvasRenderingContext2D, ox: number, oy: number, a: Avatar, o: DrawOpts = {}) {
  const th = a.theme ? THEME[a.theme] : undefined;
  const v = th ? themeVariant(th, a.vi ?? 0) : undefined;
  const out = OUTFITS[a.out] || OUTFITS.camiseta;
  let base = out.base || a.oc, tie = a.oc;
  if (v) { base = v.b; tie = v.t || shade(v.b, -0.35); }
  const sk = (v && v.skin) || a.skin;
  const m: ColorMap = {
    S: sk, N: shade(sk, -0.13), m: shade(sk, -0.3), E: o.blink ? shade(sk, -0.25) : '#1c1d26',
    O: base, A: shade(base, -0.16), K: shade(base, -0.32), W: '#eef1f5', T: tie, P: (v && v.legs) || '#2c3349', B: '#171a23',
    H: a.hair, D: shade(a.hair, -0.3)
  };
  if (o.stand) drawGrid(c, ox, oy, LEGS, m);
  const s2 = (v && v.s2) || '#f4f6fa';
  let sd = 7; for (const ch of a.out + a.oc + a.hs) sd = (sd * 31 + ch.charCodeAt(0)) | 0;
  const pf = v && v.pat ? (ch: string, r: number, i: number, col: string | undefined) => {
    if (ch !== 'O' && ch !== 'A') return col;
    switch (v.pat) {
      case 'stripes': return r % 2 ? s2 : col;
      case 'dots': return (r + i) % 4 === 0 ? s2 : col;
      case 'plaid': return (r + i) % 2 ? v.b : s2;
      case 'check': return (r + i) % 2 ? '#1c1d26' : '#f4f6fa';
      case 'zig': return (r === 15 && i % 2) || (r === 16 && i % 2 === 0) ? s2 : col;
      case 'confetti': return hsh(r * 12 + i + sd) < 0.22 ? ['#f2c94c', '#3fc1c9', '#ffffff'][Math.floor(hsh(r + i * 7) * 3)] : col;
      case 'ribs': return r >= 14 && r <= 18 && r % 2 === 0 && i > 2 && i < 9 ? s2 : col;
      default: return col;
    }
  } : undefined;
  drawGrid(c, ox, oy, TORSO, m, pf);
  if (!v || v.keepOv) drawGrid(c, ox, oy, out.ov, m);
  if (v && v.extra) drawGrid(c, ox, oy, v.extra as Grid, { ...m, ...(v.xc as ColorMap || {}) });
  drawGrid(c, ox, oy, FACE, m);
  if (a.sex === 'f') drawGrid(c, ox, oy, { 5: '....E..E....', 8: '.....ll.....' }, { E: '#1c1d26', l: '#c9606a' });
  if (a.sex === 'm' && BEARDS[a.beard]) drawGrid(c, ox, oy, BEARDS[a.beard], { H: a.hair, X: lerpC(a.hair, sk, 0.4), m: lerpC(sk, '#a8464a', 0.55) });
  if (v && v.nose) drawGrid(c, ox, oy, { 7: '.....nn.....' }, { n: v.nose });
  if (!(v && v.noHair)) drawGrid(c, ox, oy, HAIR[a.hs] || {}, m, (ch, r, i, col) => (a.hs === 'cacheado' && ch === 'H' && (r + i) % 3 === 0 ? m.D : col));
  if (th && th.ribbon) drawGrid(c, ox, oy, { 14: '...R........', 15: '..R.R.......' }, { R: th.ribbon });
  if (v && v.mask) drawGrid(c, ox, oy, { 5: '...MMMMMM...', 6: '..MM.MM.MM..' }, { M: v.mask });
  if (v && v.visor) drawGrid(c, ox, oy, { 6: '..VVVVVVVV..' }, { V: v.visor });
  const acc = o.music ? 'fone' : a.acc;
  drawGrid(c, ox, oy, ACC[acc] || {}, { G: '#22252f', w: '#e8c547', V: o.music ? '#f2c94c' : '#8b7bff' });
  if (v && v.beard) drawGrid(c, ox, oy, NOEL.beard, { W: '#f4f6fa' });
  if (v && v.hat) drawGrid(c, ox, oy, HATS[v.hat], { ...HATC, ...(v.hc as ColorMap || {}) });
  if (o.crown) drawGrid(c, ox, oy, CROWN, { Y: '#f2c94c', D: '#b8902f', P: '#fff3c4', R: '#e0384f', B: '#3d7bd9' });
}

/** Lê o tom de pele e a cor do cabelo de uma foto de rosto. A foto não sai do aparelho. */
export function sampleFace(img: HTMLImageElement) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
  x.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 64, 64);
  const px = (x0: number, y0: number, ww: number, hh: number) => {
    const d = x.getImageData(x0, y0, ww, hh).data, arr: number[][] = [];
    for (let i = 0; i < d.length; i += 4) arr.push([d[i], d[i + 1], d[i + 2], 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]]);
    return arr.sort((p, q) => p[3] - q[3]);
  };
  const mean = (a: number[][]) => { let r = 0, g = 0, b = 0; a.forEach(p => { r += p[0]; g += p[1]; b += p[2]; }); const n = a.length || 1; return toHex(r / n, g / n, b / n); };
  const sk = px(24, 30, 16, 14), hp = px(12, 2, 40, 12);
  return { skin: mean(sk.slice(Math.floor(sk.length * 0.3), Math.floor(sk.length * 0.75))), hair: mean(hp.slice(0, Math.floor(hp.length * 0.35))) };
}
