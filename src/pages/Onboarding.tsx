import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../game/Avatar';
import { Room } from '../game/Room';
import { ACCESSORIES, BEARD_STYLES, DEFAULT_AVATAR, HAIR_COLORS, HAIR_STYLES, OUTFITS, OUTFIT_COLORS, SKINS, sampleFace } from '../game/sprites';
import { useToast } from '../components/Toast';
import { claimDesk, updateMember } from '../lib/data';
import type { Avatar as AvatarT, Schedule } from '../lib/types';
import { useWs } from '../lib/workspace';

type Step = 'nome' | 'visual' | 'roupa' | 'funcoes' | 'horarios' | 'mesa' | 'termos';
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export function Onboarding({ edit = false }: { edit?: boolean }) {
  const { ws, me, members, catalog, reload } = useWs();
  const toast = useToast();
  const nav = useNavigate();
  const gestor = me.kind === 'gestor';
  const steps: Step[] = useMemo(() => {
    if (gestor) return edit ? ['nome', 'visual', 'roupa'] : ['nome', 'visual', 'roupa', 'termos'];
    const s: Step[] = ['nome', 'visual', 'roupa', 'funcoes', 'horarios'];
    if (!edit) { if (!me.desk) s.push('mesa'); s.push('termos'); }
    return s;
  }, [gestor, edit, me.desk]);

  const funcoes = catalog.filter(c => c.kind === 'funcao' && c.active);
  const [i, setI] = useState(0);
  const [name, setName] = useState(me.display_name || '');
  const [av, setAv] = useState<AvatarT>({ ...DEFAULT_AVATAR, ...(me.avatar as Partial<AvatarT>) });
  const [photo, setPhoto] = useState<string | null>(null);
  const [main, setMain] = useState(me.main_role || funcoes[0]?.name || '');
  const [adj, setAdj] = useState<string[]>(me.adj_roles || []);
  const [sch, setSch] = useState<Schedule>(me.schedule || { e1: '08:00', s1: '12:00', e2: '13:00', s2: '18:00' });
  const [folder, setFolder] = useState(me.report_folder || '');
  const [desk, setDesk] = useState<number | null>(me.desk);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const step = steps[i];
  const set = (p: Partial<AvatarT>) => setAv(a => ({ ...a, ...p }));
  const timesOk = toMin(sch.e1) < toMin(sch.s1) && toMin(sch.s1) <= toMin(sch.e2) && toMin(sch.e2) < toMin(sch.s2);
  const takenDesks = new Set(members.filter(m => m.user_id !== me.user_id && m.desk).map(m => m.desk));
  const free = Array.from({ length: ws.desks }, (_, k) => k + 1).filter(n => !takenDesks.has(n));
  // alguém pegou a mesa enquanto você escolhia
  useEffect(() => { if (desk && takenDesks.has(desk)) setDesk(null); }, [members]); // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = step === 'nome' ? name.trim().length > 0
    : step === 'funcoes' ? !!main
    : step === 'horarios' ? timesOk
    : step === 'mesa' ? !!desk
    : step === 'termos' ? ok : true;
  const last = i === steps.length - 1;

  const finish = async () => {
    setBusy(true); setErr('');
    try {
      if (!gestor && !edit && !me.desk) {
        try { await claimDesk(ws.id, desk!); } catch (e) { setI(steps.indexOf('mesa')); await reload(); throw e; }
      }
      const patch: Record<string, unknown> = { display_name: name.trim(), avatar: av };
      if (!gestor) Object.assign(patch, { main_role: main, adj_roles: adj, schedule: sch, report_folder: folder.trim() || null });
      if (!edit) patch.consent_at = new Date().toISOString();
      await updateMember(ws.id, me.user_id, patch);
      await reload();
      toast(edit ? 'Personagem atualizado' : 'Bem-vindo ao escritório!');
      if (edit) nav(`/w/${ws.slug}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const onPhoto = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const s = sampleFace(img); set({ skin: s.skin, hair: s.hair }); setPhoto(r.result as string); }; img.src = r.result as string; };
    r.readAsDataURL(f);
  };

  return (
    <div className="center">
      <div className="onb" role="dialog" aria-labelledby="onbTitle">
        <div className="side">
          <Avatar avatar={av} stand crown={gestor} size={96} />
          <b>{name || 'Seu personagem'}</b>
          <span>{gestor ? 'Gestor · ' + ws.name : [main, ...adj].filter(Boolean).join(' + ') || ws.name}</span>
        </div>
        <div className="main">
          <div className="steps">{steps.map((s, k) => <i key={s} className={k <= i ? 'on' : ''} />)}</div>

          {step === 'nome' && <>
            <h2 id="onbTitle">{edit ? 'Editar personagem' : `Bem-vindo à ${ws.name}`}</h2>
            <p className="muted">Como a equipe te chama? O nome aparece na plaquinha da sua mesa.</p>
            <div className="field" style={{ maxWidth: 340 }}><label htmlFor="nm">Seu nome</label>
              <input id="nm" value={name} onChange={e => setName(e.target.value)} maxLength={30} autoComplete="given-name" autoFocus /></div>
            {gestor && <div className="note">♛ Você entrou como <b>gestor</b>: acompanha a equipe, ganha coroa e mesa da diretoria, e não é monitorado.</div>}
          </>}

          {step === 'visual' && <>
            <h2 id="onbTitle">Sua foto vira um personagem</h2>
            <p className="muted">Lemos o tom de pele e a cor do cabelo da foto. Depois você ajusta o que quiser.</p>
            <label className="drop">
              {photo ? <img src={photo} alt="Sua foto" /> : <span className="ph">Foto</span>}
              <span><b>{photo ? 'Trocar foto' : 'Enviar foto do rosto (opcional)'}</b><br /><span className="small muted">Rosto de frente, boa luz. A foto não é enviada: fica só no seu aparelho.</span></span>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => onPhoto(e.target.files?.[0])} />
            </label>
            <Pick label="Sexo" items={[['f', 'Feminino'], ['m', 'Masculino']]} value={av.sex} onPick={v => set({ sex: v as 'f' | 'm' })} />
            <Swatches label="Tom de pele" colors={[...new Set([av.skin, ...SKINS])]} value={av.skin} onPick={v => set({ skin: v })} />
            <Swatches label="Cor do cabelo" colors={[...new Set([av.hair, ...HAIR_COLORS])]} value={av.hair} onPick={v => set({ hair: v })} />
            <Tiles label="Cabelo" items={HAIR_STYLES} value={av.hs} preview={k => ({ ...av, hs: k })} onPick={v => set({ hs: v })} />
            {av.sex === 'm' && <Tiles label="Barba" items={BEARD_STYLES} value={av.beard} preview={k => ({ ...av, beard: k })} onPick={v => set({ beard: v })} />}
            <Pick label="Acessório" items={ACCESSORIES} value={av.acc} onPick={v => set({ acc: v })} />
            <p className="small muted">O fone de ouvido aparece sozinho quando você estiver ouvindo música.</p>
          </>}

          {step === 'roupa' && <>
            <h2 id="onbTitle">Escolha a roupa</h2>
            <p className="muted">A cor identifica você no quadro de tarefas e no painel da equipe.</p>
            <Tiles label="Roupa" items={Object.entries(OUTFITS).map(([k, o]) => [k, o.n])} value={av.out} preview={k => ({ ...av, out: k })} onPick={v => set({ out: v })} body />
            <Swatches label="Cor" colors={OUTFIT_COLORS} value={av.oc} onPick={v => set({ oc: v })} />
          </>}

          {step === 'funcoes' && <>
            <h2 id="onbTitle">Suas funções</h2>
            <p className="muted">Uma função principal e até duas adjacentes. Os apps de todas elas contam como tempo produtivo.</p>
            <div><div className="lbl">Função principal</div>
              <div className="roles" style={{ marginTop: 6 }}>{funcoes.map(f => (
                <button key={f.id} type="button" className="opt" aria-pressed={f.name === main} onClick={() => { setMain(f.name); setAdj(a => a.filter(x => x !== f.name)); }}>
                  <b>{f.name}</b><span>{f.meta.desc || (f.meta.apps || []).join(', ')}</span></button>))}</div></div>
            <div><div className="lbl">Funções adjacentes · {adj.length} de 2</div>
              <div className="roles" style={{ marginTop: 6 }}>{funcoes.filter(f => f.name !== main).map(f => {
                const on = adj.includes(f.name);
                return <button key={f.id} type="button" className="opt" aria-pressed={on} disabled={!on && adj.length >= 2}
                  onClick={() => setAdj(a => on ? a.filter(x => x !== f.name) : [...a, f.name])}><b>{f.name}</b><span>{on ? 'Clique para tirar' : 'Adicionar'}</span></button>;
              })}</div></div>
            {funcoes.length === 0 && <p className="err">Nenhuma função cadastrada. Peça ao administrador para criar em Configurações.</p>}
          </>}

          {step === 'horarios' && <>
            <h2 id="onbTitle">Seus horários</h2>
            <p className="muted">Definem sua jornada e a capacidade de tarefas por dia.</p>
            <div className="times">{(['e1', 's1', 'e2', 's2'] as const).map((k, n) => (
              <div key={k} className="field"><label htmlFor={k}>{['Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2'][n]}</label>
                <input id={k} type="time" value={sch[k]} onChange={e => setSch(s => ({ ...s, [k]: e.target.value }))} /></div>))}</div>
            {!timesOk && <p className="err">Os horários precisam estar em ordem: entrada 1, saída 1, entrada 2, saída 2.</p>}
            <div className="field"><label htmlFor="fd">Pasta dos relatórios do dia (opcional)</label>
              <input id="fd" value={folder} onChange={e => setFolder(e.target.value)} placeholder="C:\Users\voce\Documents\Relatórios" />
              <span className="small muted">Usada pelo app de computador para salvar o relatório ao encerrar o expediente.</span></div>
          </>}

          {step === 'mesa' && <>
            <h2 id="onbTitle">Escolha sua mesa</h2>
            <p className="muted">A mesa fica <b>sua para sempre</b>, com a plaquinha do seu nome na frente. Só o administrador pode trocar depois.</p>
            <Room desks={ws.desks} members={members} pick={{ selected: desk, onSelect: setDesk, me: { name: name.trim(), avatar: av } }} />
            {free.length === 0 && <p className="err">Todas as mesas estão ocupadas. Peça ao administrador para adicionar mais mesas.</p>}
            {desk && <p className="ok">Mesa {desk} selecionada.</p>}
          </>}

          {step === 'termos' && (gestor ? <>
            <h2 id="onbTitle">Como funciona para o gestor</h2>
            <div className="note">Você acompanha a sala, o quadro, o painel do dia e o mural. Seu tempo <b>não é monitorado</b> e você não entra em rankings nem pega tarefas. A equipe sabe exatamente o que é registrado sobre ela.</div>
            <label className="check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> Entendi.</label>
          </> : <>
            <h2 id="onbTitle">O que o app de computador registra</h2>
            <p className="muted">O app roda no Windows ou macOS e envia, a cada minuto, só o necessário para classificar seu tempo.</p>
            <div className="cols2">
              <div className="note"><b style={{ color: 'var(--prod)' }}>Registramos</b><ul>
                <li>Nome do app em foco (ex.: Figma)</li><li>Nos navegadores, só "navegando na internet" e a categoria da página, calculada no seu computador</li>
                <li>Se há música tocando, para pôr o fone no personagem</li><li>{ws.settings.ociosidade_min ?? 5} min sem teclado ou mouse como ociosidade</li>
                <li>Quantos agentes de IA estão rodando</li><li>Mensagens do chat passam por um filtro de palavras fora do assunto</li></ul></div>
              <div className="note"><b style={{ color: 'var(--dis)' }}>Nunca registramos</b><ul>
                <li>Endereços de sites</li><li>Capturas de tela</li><li>Teclas digitadas</li><li>Títulos de janelas</li><li>O que você ouve</li><li>Conteúdo de arquivos</li></ul></div>
            </div>
            <label className="check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> Li e concordo. Sei que posso ver todos os meus dados e que pausas são marcadas pela copa.</label>
          </>)}

          {err && <p className="err" role="alert">{err}</p>}
          <div className="nav">
            {i > 0 ? <button className="ghost" type="button" onClick={() => setI(i - 1)}>Voltar</button>
              : edit ? <button className="ghost" type="button" onClick={() => nav(`/w/${ws.slug}`)}>Cancelar</button> : <span />}
            <button className="cta" type="button" disabled={!canNext || busy} onClick={() => (last ? finish() : setI(i + 1))}>
              {busy ? 'Salvando…' : last ? (edit ? 'Salvar' : 'Entrar no escritório') : 'Continuar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pick({ label, items, value, onPick }: { label: string; items: [string, string][]; value: string; onPick: (v: string) => void }) {
  return <div><div className="lbl">{label}</div><div className="row" style={{ marginTop: 6 }}>
    {items.map(([k, n]) => <button key={k} type="button" className="opt" style={{ padding: '6px 12px' }} aria-pressed={value === k} onClick={() => onPick(k)}>{n}</button>)}
  </div></div>;
}
function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (v: string) => void }) {
  return <div><div className="lbl">{label}</div><div className="row" style={{ marginTop: 6 }}>
    {colors.map(c => <button key={c} type="button" className="sw" style={{ background: c }} aria-label={`${label} ${c}`} aria-pressed={value === c} onClick={() => onPick(c)} />)}
  </div></div>;
}
function Tiles({ label, items, value, preview, onPick, body }: { label: string; items: [string, string][]; value: string; preview: (k: string) => AvatarT; onPick: (v: string) => void; body?: boolean }) {
  return <div><div className="lbl">{label}</div><div className="grid4" style={{ marginTop: 6 }}>
    {items.map(([k, n]) => <button key={k} type="button" className="opt" aria-pressed={value === k} onClick={() => onPick(k)}>
      <Avatar avatar={preview(k)} size={36} stand={body} />{n}</button>)}
  </div></div>;
}
