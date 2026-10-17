import { setDemo } from '../lib/supabase';

export function DemoBar() {
  return (
    <div className="demobar" role="note">
      <span><b>Modo demonstração</b> · os dados ficam só neste navegador.</span>
      <button className="linkbtn" onClick={() => { if (confirm('Sair da demonstração e apagar os dados dela?')) setDemo(false); }}>Sair da demonstração</button>
    </div>
  );
}
