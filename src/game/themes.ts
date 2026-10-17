// Roupas temáticas (datas comemorativas e cores do mês) e roupas exclusivas dos títulos do Mural da Glória.
// Portado do protótipo v1. Cada pessoa da equipe recebe uma variação diferente do tema.
import { shade } from './sprites';

type Grid = Record<string, string>;
type G2 = Record<string, string | undefined>;
export interface Variant { b: string; s2?: string; pat?: string; keepOv?: number; hat?: string; hc?: G2; extra?: G2; xc?: G2; beard?: number; noHair?: number; legs?: string; nose?: string; t?: string; mask?: string; skin?: string; visor?: string }
export interface Theme { id: string; m?: number; from?: number; n: string; kind: string; c?: string; ribbon?: string; title?: string }

export const NOEL: { torso: Grid; hat: Grid; beard: Grid } ={torso:{12:"...WWWWWW...",13:"..RRRWWRRR..",14:".RRRRWWRRRR.",15:".RRRRWWRRRR.",16:".RRRRWWRRRR.",17:".KKKKYYKKKK.",18:".SRRRWWRRRS.",19:"..RRRWWRRR.."},
  hat:{0:"........WW..",1:".....RRRWW..",2:"...RRRRRR...",3:"..RRRRRRRR..",4:"..WWWWWWWW.."},beard:{7:"..W......W..",8:"..WWW..WWW..",9:"..WWWWWWWW..",10:"...WWWWWW...",11:"....WWWW...."}};
export const THEMES: Theme[] =[{id:'jan',m:1,n:'Janeiro Branco',kind:'mes',c:'#eef1f5'},{id:'fev',m:2,n:'Carnaval',kind:'carnaval'},{id:'mar',m:3,n:'Março Lilás',kind:'mes',c:'#b38be0'},{id:'abr',m:4,n:'Abril Azul',kind:'mes',c:'#4f8fe0'},
  {id:'mai',m:5,n:'Maio Amarelo',kind:'mes',c:'#f2c94c'},{id:'jun',m:6,n:'Festa Junina',kind:'junina'},{id:'jul',m:7,n:'Festa Julina',kind:'junina'},{id:'ago',m:8,n:'Agosto Lilás',kind:'mes',c:'#a06cc8'},
  {id:'set',m:9,n:'Setembro Amarelo',kind:'mes',c:'#f2c94c',ribbon:'#b8902f'},{id:'out',m:10,n:'Outubro Rosa',kind:'mes',c:'#e86aa6',ribbon:'#ffc2dc'},{id:'hal',m:10,from:25,n:'Halloween',kind:'halloween'},
  {id:'nov',m:11,n:'Novembro Azul',kind:'mes',c:'#3d7bd9',ribbon:'#cfe3ff'},{id:'nat',m:12,n:'Natal · Papai Noel',kind:'noel'}];
export const TITLES: Record<string, { n: string; s: string; p: string; d: string; theme: string }> = {
  ajuda: { n: 'Mão Amiga do Mês', s: 'Ajuda', p: 'Mão Amiga', d: 'Quem mais ajudou os colegas', theme: 'ttl_ajuda' },
  prod: { n: 'Máquina de Produtividade', s: 'Produtividade', p: 'Produtividade', d: 'Mais tempo trabalhando nas tarefas', theme: 'ttl_prod' },
  done: { n: 'Campeão de Entregas', s: 'Entregas', p: 'Entregas', d: 'Mais entregas e etapas concluídas', theme: 'ttl_done' },
  ia: { n: 'Mestre da IA', s: 'IA', p: 'Mestre IA', d: 'Mais tempo com agentes de IA', theme: 'ttl_ia' }
};
export const THEME: Record<string, Theme> = Object.fromEntries(THEMES.map(t => [t.id, t]));
Object.entries(TITLES).forEach(([k, t]) => { THEME[t.theme] = { id: t.theme, n: 'Roupa ' + t.n, kind: t.theme, title: k }; });
export const HATC: Record<string, string> ={R:'#c8312f',W:'#f4f6fa',G:'#2f8f4f',B:'#6b4428',K:'#1c1d26',Y:'#f2c94c',C:'#e86aa6',P:'#8b2fc9',O:'#e07b2f',y:'#e3c26a',b:'#8a5a2b'};
export const HATS: Record<string, Grid> ={noel:{0:"........WW..",1:".....RRRWW..",2:"...RRRRRR...",3:"..RRRRRRRR..",4:"..WWWWWWWW.."},beanie:{1:".....WW.....",2:"...RRRRRR...",3:"..RRRRRRRR..",4:"..WWWWWWWW.."},
  elf:{'-1':"......GG....",0:".....GGG....",1:"....GGGG....",2:"...GGGGGG...",3:"..RRRRRRRR.."},antlers:{'-1':"..B......B..",0:".BB......BB.",1:"..B......B.."},
  tophat:{'-2':"...KKKKKK...",'-1':"...KKKKKK...",0:"...KKKKKK...",1:"...KRRRRK...",2:"..KKKKKKKK.."},halo:{0:"...YYYYYY..."},band:{3:"..CCCCCCCC.."},cap:{1:"...CCCCCC...",2:"..CCCCCCCC..",3:"..CCCCCCCCCC"},
  straw:{1:"....yyyy....",2:"...ybbbby...",3:"yyyyyyyyyyyy"},witch:{'-2':".....KK.....",'-1':"....KKKK....",0:"....KKKK....",1:"...KPPPPK...",2:"KKKKKKKKKKKK"},stem:{0:".....GG.....",1:"....OOOO...."},ears:{1:"..K......K..",2:"..KK....KK.."},bat:{0:".K........K.",1:".KK......KK.",2:"..KK....KK.."}};
export const VARIANTS: Record<string, (th: Theme) => Variant[]> ={
 mes:th=>[{b:(th.c as string),keepOv:1},{b:shade((th.c as string),.3),pat:'stripes',keepOv:1},{b:shade((th.c as string),-.25),pat:'dots',keepOv:1},{b:shade((th.c as string),.5),keepOv:1,hat:'band',hc:{C:shade((th.c as string),-.3)}},{b:(th.c as string),keepOv:1,extra:{12:"..ZZZZZZZZ..",13:"........Z..."},xc:{Z:shade((th.c as string),-.45)}},{b:shade((th.c as string),-.4),pat:'stripes',s2:shade((th.c as string),.4),keepOv:1},{b:shade((th.c as string),.15),keepOv:1,hat:'cap',hc:{C:shade((th.c as string),-.35)}},{b:'#f4f6fa',pat:'stripes',s2:(th.c as string),keepOv:1}],
 noel:()=>[{b:'#c8312f',extra:NOEL.torso,xc:{R:'#c8312f',W:'#f4f6fa',K:'#171a23',Y:'#f2c94c'},beard:1,hat:'noel',noHair:1,legs:'#c8312f'},{b:'#c8312f',extra:{12:"...WWWWWW...",17:".KKKKYYKKKK."},xc:{W:'#f4f6fa',K:'#171a23',Y:'#f2c94c'},hat:'noel'},
  {b:'#2f8f4f',extra:{12:"..RRRRRRRR..",17:".KKKKYYKKKK."},xc:{R:'#c8312f',K:'#171a23',Y:'#f2c94c'},hat:'elf'},{b:'#8a5a3a',hat:'antlers',nose:'#e0384f',extra:{14:"....WWWW....",15:"....WWWW...."},xc:{W:'#e8d9b0'}},
  {b:'#c8312f',pat:'zig',s2:'#f4f6fa',hat:'beanie'},{b:'#2f8f4f',pat:'zig',s2:'#f4f6fa',hat:'beanie',hc:{R:'#2f8f4f'}},{b:'#f4f6fa',extra:{14:".....KK.....",16:".....KK.....",18:".....KK....."},xc:{K:'#1c1d26'},hat:'tophat',nose:'#f08a2c',noHair:1},{b:'#f8f3e6',hat:'halo',extra:{12:"...YYYYYY..."},xc:{Y:'#f2c94c'}}],
 junina:()=>[['#c8312f','#f4e9d8'],['#2f5fc8','#f4e9d8'],['#2f8f4f','#f2c94c'],['#e07b2f','#fff3e0'],['#8b2fc9','#f4e9d8'],['#d6487c','#fff0f6'],['#6b4428','#e8d9b0'],['#1d1f2a','#f2c94c']].map(([a,b2],i)=>({b:a,s2:b2,pat:'plaid',hat:'straw',extra:i%2?{12:".....SS.....",14:"..b.........",15:"..b........."}:{12:".....SS....."},xc:{b:'#8a5a2b'}})),
 carnaval:()=>{const cs=['#e83e8c','#3fc1c9','#f2c94c','#8b2fc9','#5ad18a','#e07b2f','#3d7bd9','#ef5a6f'];return cs.map((c,i)=>({b:c,pat:'confetti',keepOv:1,mask:cs[(i+3)%8]}))},
 halloween:()=>[{b:'#2b1d3a',hat:'witch',t:'#f08a2c'},{b:'#1c1d26',t:'#c62f45',extra:{12:"..WW....WW..",13:"..W......W.."},xc:{W:'#c62f45'}},{b:'#e07b2f',hat:'stem',extra:{14:"...K.K.K....",16:"....KKK....."},xc:{K:'#1c1d26'}},{b:'#f4f6fa',hat:'band',hc:{C:'#cfd5e6'},noHair:1},
  {b:'#1c1d26',pat:'ribs',s2:'#f4f6fa'},{b:'#5f7a4a',pat:'dots',s2:'#3e4a2e',skin:'#9cbf8a'},{b:'#1c1d26',hat:'ears'},{b:'#3a2a4a',hat:'bat',hc:{K:'#3a2a4a'}}],
 ttl_ajuda:()=>[{b:'#3fb68a',extra:{14:"....RR.RR...",15:"....RRRRR...",16:".....RRR....",17:"......R....."},xc:{R:'#ef5a6f'},hat:'halo'}],
 ttl_prod:()=>[{b:'#d4a72c',extra:{13:"......K.....",14:".....K......",15:"....KKKK....",16:"......K.....",17:".....K......"},xc:{K:'#1c1d26'},hat:'band',hc:{C:'#c62f45'}}],
 ttl_done:()=>[{b:'#1c1d26',pat:'check',extra:{15:".....YY.....",16:".....YY....."},xc:{Y:'#f2c94c'}}],
 ttl_ia:()=>[{b:'#16263a',extra:{13:"..C...C..C..",14:"..CCC.C.CC..",15:"....C.CCC...",16:"..CC..C..C.."},xc:{C:'#3fc1c9'},visor:'#3fc1c9'}]};

/** Variação do tema para a pessoa: vi = posição dela na equipe, para cada um ficar diferente. */
export function themeVariant(th: Theme, vi: number): Variant {
  const vs = VARIANTS[th.kind](th);
  if (vs.length === 1) return vs[0];
  let h = 7; for (const ch of th.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return vs[(Math.max(0, vi) + Math.abs(h) % 7) % vs.length];
}
/** Temas disponíveis no mês (Halloween só a partir do dia 25 de outubro). */
export function themesNow(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  return THEMES.filter(t => t.m === m && (!t.from || day >= t.from));
}
export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
