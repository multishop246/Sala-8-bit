// Mural da Glória: ranking do mês e regra de "um título por pessoa".
import type { GloryScore } from '../lib/types';
import { TITLES } from '../game/themes';

export type GloryCat = 'ajuda' | 'prod' | 'done' | 'ia';
export const GLORY_CATS: GloryCat[] = ['ajuda', 'prod', 'done', 'ia'];
export const scoreOf = (s: GloryScore, c: GloryCat) => (c === 'ajuda' ? s.ajudas : c === 'prod' ? s.tarefa_min : c === 'done' ? s.entregas : s.ia_min);
export const fmtScore = (v: number, c: GloryCat) => (c === 'ajuda' ? `${v} ${v === 1 ? 'ajuda' : 'ajudas'}` : c === 'done' ? `${v} ${v === 1 ? 'entrega' : 'entregas'}` : `${Math.floor(v / 60)}h ${String(v % 60).padStart(2, '0')}`);

/** Quem lidera duas categorias fica com aquela em que se destacou mais; a outra vai para o próximo colocado. */
export function assignTitles(scores: GloryScore[]) {
  const rank = {} as Record<GloryCat, GloryScore[]>;
  for (const c of GLORY_CATS) rank[c] = [...scores].sort((a, b) => scoreOf(b, c) - scoreOf(a, c));
  const lead = (c: GloryCat) => { const r = rank[c]; if (!r.length) return -1; const a = scoreOf(r[0], c), b = r[1] ? scoreOf(r[1], c) : 0; return (a - b) / Math.max(1, b); };
  const win = {} as Record<GloryCat, string | null>;
  const taken = new Set<string>();
  for (const c of [...GLORY_CATS].sort((a, b) => lead(b) - lead(a))) {
    const w = rank[c].find(s => scoreOf(s, c) > 0 && !taken.has(s.user_id));
    win[c] = w ? w.user_id : null;
    if (w) taken.add(w.user_id);
  }
  return { rank, win };
}
export const titleThemeOf = (c: GloryCat) => TITLES[c].theme;
export const monthStart = (offset = 0, d = new Date()) => new Date(d.getFullYear(), d.getMonth() + offset, 1).toLocaleDateString('sv-SE');
