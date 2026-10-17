import { useEffect, useState } from 'react';
import { Avatar } from '../game/Avatar';
import { MONTHS, TITLES } from '../game/themes';
import * as live from '../lib/live';
import type { GloryScore } from '../lib/types';
import { useLive } from '../live/LiveProvider';
import { useWs } from '../lib/workspace';
import { GLORY_CATS, assignTitles, fmtScore, monthStart, scoreOf, titleThemeOf, type GloryCat } from './glory';

export function MuralTab() {
  const { ws, members } = useWs();
  const L = useLive();
  const [scores, setScores] = useState<GloryScore[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => live.gloryScores(ws.id, monthStart(0)).then(setScores).catch(e => setErr(e.message));
    load();
    const i = window.setInterval(load, 60000);
    return () => window.clearInterval(i);
  }, [ws.id]);
  if (!ws.settings.recursos?.mural_gloria) return <p className="muted">O Mural da Glória está desligado. O administrador liga em Configurações → Regras.</p>;
  if (err) return <p className="err">{err}</p>;
  if (!scores) return <p className="muted">Carregando o ranking…</p>;
  const now = new Date(L.now), cur = MONTHS[now.getMonth()], prev = MONTHS[(now.getMonth() + 11) % 12];
  const { rank, win } = assignTitles(scores);
  const mem = (id: string) => members.find(m => m.user_id === id);
  const iaOff = scores.every(s => s.ia_min === 0);
  const holders = Object.entries(L.titles);
  return (
    <div className="stack">
      <div>
        <h3>Mural da Glória · {cur}</h3>
        <p className="small muted" style={{ maxWidth: '80ch' }}>Ranking parcial do mês, que zera no dia 1º. O 1º lugar de cada categoria ganha o título para usar no mês seguinte (embaixo do nome, na plaquinha dourada da mesa e com uma roupa exclusiva). Cada pessoa leva no máximo um título: se alguém lidera duas categorias, fica com aquela em que se destacou mais e a outra vai para o próximo colocado.</p>
      </div>
      {holders.length > 0 && <div className="note"><b>Títulos de {prev.toLowerCase()}, em uso agora:</b> {holders.map(([u, c]) => `${mem(u)?.display_name || '—'} (${TITLES[c].n})`).join(' · ')}</div>}
      <div className="gcards">
        {GLORY_CATS.map((c: GloryCat) => {
          const T = TITLES[c], w = win[c] ? mem(win[c]!) : undefined;
          return (
            <div key={c} className="gcard">
              <div className="gh">
                {w ? <Avatar avatar={{ ...L.look(w), theme: titleThemeOf(c) }} stand size={34} /> : <span className="gempty" />}
                <div style={{ minWidth: 0 }}><span className="lbl">{T.n}</span><b>{w?.display_name || '—'}</b><span className="small muted">{T.d}</span></div>
              </div>
              {c === 'ia' && iaOff ? <p className="small muted">Começa a contar com o app de computador (versão 0.5), que mede os agentes de IA rodando.</p> :
                <ol className="grank">{rank[c].slice(0, 5).map((s, i) => <li key={s.user_id} className={(i === 0 ? 'first' : '') + (win[c] === s.user_id ? ' win' : '')}>
                  <span>{i + 1}º {mem(s.user_id)?.display_name}</span><em>{fmtScore(scoreOf(s, c), c)}</em></li>)}</ol>}
            </div>);
        })}
      </div>
      <div><span className="lbl">Destaque de cada um</span>
        <div className="gpeople" style={{ marginTop: 6 }}>{scores.map(s => {
          const m = mem(s.user_id); if (!m) return null;
          const main = GLORY_CATS.find(c => win[c] === s.user_id);
          const pos = GLORY_CATS.filter(c => !(c === 'ia' && iaOff)).map(c => [c, rank[c].findIndex(x => x.user_id === s.user_id) + 1] as const);
          const best = [...pos].sort((a, b) => a[1] - b[1])[0];
          return <div key={s.user_id} className="gperson"><Avatar avatar={L.look(m)} size={30} />
            <div style={{ minWidth: 0 }}><b>{m.display_name}</b>
              {main ? <div className="gmain">★ {TITLES[main].n}</div> : best && <div className="small muted">Melhor posição: {best[1]}º em {TITLES[best[0]].s}</div>}
              <div className="small muted">{pos.map(([c, n]) => `${TITLES[c].s} ${n}º`).join(' · ')}</div></div></div>;
        })}</div></div>
      <p className="small muted">"Produtividade" conta o tempo trabalhando nas tarefas do quadro. Com o app de computador (versão 0.5), passa a contar todo o tempo produtivo.</p>
    </div>
  );
}
