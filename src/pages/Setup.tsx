import { Brand } from '../components/Brand';
import { setDemo } from '../lib/supabase';

/** Aparece quando o site ainda não foi ligado a um projeto Supabase. */
export function Setup() {
  return (
    <div className="center">
      <div className="card wide">
        <Brand sub="Falta só ligar o banco de dados" />
        <p>O site está funcionando, mas ainda não sabe qual banco de dados usar. Isso leva uns 15 minutos e é tudo gratuito.</p>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li>Crie um projeto grátis em <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li>
          <li>No SQL Editor do Supabase, rode os arquivos da pasta <code>supabase/migrations</code> em ordem.</li>
          <li>Ative o login por e-mail (já vem ligado) e, se quiser, o do Google.</li>
          <li>Copie a <b>Project URL</b> e a chave <b>anon public</b> (Project Settings → API).</li>
          <li>Na Vercel, cadastre como variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> e publique de novo. No computador, coloque no arquivo <code>.env.local</code>.</li>
        </ol>
        <div className="note">O passo a passo completo está em <b>docs/INSTALACAO.md</b> no repositório.</div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small muted">Quer ver antes de instalar? A demonstração roda só neste navegador.</span>
          <button className="cta" onClick={() => setDemo(true)}>Experimentar a demonstração</button>
        </div>
      </div>
    </div>
  );
}
