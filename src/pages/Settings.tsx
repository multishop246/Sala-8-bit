import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '../game/Avatar';
import { useToast } from '../components/Toast';
import * as db from '../lib/data';
import type { CatalogItem, Invite, Member, MemberKind, WorkspaceSettings } from '../lib/types';
import { useWs } from '../lib/workspace';

const TABS = [['empresa', 'Empresa'], ['equipe', 'Equipe'], ['convites', 'Convites'], ['catalogo', 'Funções e tarefas'], ['regras', 'Regras']] as const;
type Tab = typeof TABS[number][0];

export function Settings() {
  const { ws, me } = useWs();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.some(t => t[0] === sp.get('aba')) ? sp.get('aba') : 'empresa') as Tab;
  if (!me.is_admin) return <Navigate to={`/w/${ws.slug}`} replace />;
  return (
    <div className="panel">
      <h2 style={{ marginBottom: 12 }}>Configurações</h2>
      <div className="tabs" role="tablist">
        {TABS.map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setSp({ aba: k })}>{n}</button>)}
      </div>
      {tab === 'empresa' && <Empresa />}
      {tab === 'equipe' && <Equipe />}
      {tab === 'convites' && <Convites />}
      {tab === 'catalogo' && <Catalogo />}
      {tab === 'regras' && <Regras />}
    </div>
  );
}

const useRun = () => {
  const toast = useToast();
  const { reload } = useWs();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); await reload(); if (ok) toast(ok); return true; } catch (e) { toast((e as Error).message); return false; } finally { setBusy(false); }
  };
  return { run, busy };
};

// ------------------------------------------------------------------ Empresa
function Empresa() {
  const { ws, members } = useWs();
  const nav = useNavigate();
  const { run, busy } = useRun();
  const [name, setName] = useState(ws.name);
  const [desks, setDesks] = useState(ws.desks);
  const [rot, setRot] = useState(ws.settings.rotulo_linha || 'Linha');
  const [confirm, setConfirm] = useState('');
  const maxUsed = Math.max(0, ...members.map(m => m.desk || 0));
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="field"><label htmlFor="n">Nome do escritório</label><input id="n" value={name} maxLength={60} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="d">Número de mesas</label>
        <select id="d" value={desks} onChange={e => setDesks(+e.target.value)}>
          {Array.from({ length: 24 }, (_, k) => k + 1).map(n => <option key={n} value={n} disabled={n < maxUsed}>{n} {n === 1 ? 'mesa' : 'mesas'}{n < maxUsed ? ' (há gente sentada além)' : ''}</option>)}
        </select></div>
      <div className="field"><label htmlFor="r">Como vocês chamam as linhas de produto</label>
        <select id="r" value={rot} onChange={e => setRot(e.target.value)}>{['Linha', 'Marca', 'Cliente', 'Produto', 'Projeto'].map(x => <option key={x}>{x}</option>)}</select>
        <span className="small muted">Aparece como nome do campo ao criar tarefas.</span></div>
      <div><button className="cta" disabled={busy || name.trim().length < 2} onClick={() => run(() => db.updateWorkspace(ws.id, { name: name.trim(), desks, settings: { ...ws.settings, rotulo_linha: rot } }), 'Salvo')}>Salvar</button></div>
      <p className="small muted">Endereço do escritório: <span className="mono">{location.origin}/w/{ws.slug}</span></p>
      <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
      <div className="stack">
        <h3>Excluir escritório</h3>
        <p className="small muted">Apaga para sempre a equipe, as mesas, o catálogo e todos os dados. Só quem criou o escritório pode excluir.</p>
        <div className="field"><label htmlFor="cf">Digite o nome do escritório para confirmar</label><input id="cf" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={ws.name} /></div>
        <div><button className="danger" disabled={confirm !== ws.name || busy} onClick={async () => { if (await run(() => db.deleteWorkspace(ws.id).then(async () => { const still = await db.workspaceBySlug(ws.slug); if (still) throw new Error('Só quem criou o escritório pode excluir.'); }))) nav('/'); }}>Excluir para sempre</button></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Equipe
function Equipe() {
  const { ws, me, members } = useWs();
  const nav = useNavigate();
  const { run, busy } = useRun();
  const upd = (m: Member, patch: Partial<Member>, ok: string) => run(() => db.updateMember(ws.id, m.user_id, patch), ok);
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>Pessoa</th><th>Papel</th><th>Admin</th><th>Mesa</th><th></th></tr></thead>
        <tbody>{members.map(m => {
          const self = m.user_id === me.user_id;
          return (
            <tr key={m.user_id}>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar avatar={m.avatar} crown={m.kind === 'gestor'} size={26} />
                <span><b>{m.display_name || 'Novo membro'}</b>{self && <span className="chip acc" style={{ marginLeft: 6 }}>você</span>}
                  <br /><span className="small muted">{m.consent_at ? [m.main_role, ...m.adj_roles].filter(Boolean).join(' · ') || 'Gestor' : 'Ainda criando o personagem'}</span></span></div></td>
              <td><select value={m.kind} disabled={busy} aria-label="Papel" onChange={e => upd(m, { kind: e.target.value as MemberKind }, 'Papel alterado')}>
                <option value="membro">Membro</option><option value="gestor">Gestor (acompanha)</option></select></td>
              <td><input type="checkbox" checked={m.is_admin} disabled={busy} aria-label="Administrador" onChange={e => upd(m, { is_admin: e.target.checked }, e.target.checked ? 'Agora é administrador' : 'Não é mais administrador')} /></td>
              <td>{m.desk ? <span className="row">Mesa {m.desk}<button className="ghost sm" disabled={busy} onClick={() => confirm(`Liberar a mesa ${m.desk} de ${m.display_name || 'este membro'}? A pessoa vai escolher outra ao entrar.`) && upd(m, { desk: null, consent_at: null }, 'Mesa liberada')}>Liberar</button></span> : <span className="muted">—</span>}</td>
              <td style={{ textAlign: 'right' }}>{self
                ? <button className="ghost sm" disabled={busy} onClick={async () => { if (confirm('Sair desta equipe?') && await run(() => db.removeMember(ws.id, m.user_id))) nav('/'); }}>Sair da equipe</button>
                : <button className="danger sm" disabled={busy} onClick={() => confirm(`Remover ${m.display_name || 'este membro'} da equipe?`) && run(() => db.removeMember(ws.id, m.user_id), 'Removido')}>Remover</button>}</td>
            </tr>);
        })}</tbody>
      </table>
      <p className="small muted" style={{ marginTop: 10 }}>Ao liberar a mesa, na próxima vez que entrar a pessoa confere o cadastro (já preenchido), escolhe outra mesa e aceita os termos de novo. O gestor não ocupa mesa comum.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Convites
function Convites() {
  const { ws } = useWs();
  const toast = useToast();
  const { run, busy } = useRun();
  const [list, setList] = useState<Invite[]>([]);
  const [kind, setKind] = useState<MemberKind>('membro');
  const [days, setDays] = useState(14);
  const [uses, setUses] = useState(10);
  const load = () => db.invites(ws.id).then(setList).catch(e => toast(e.message));
  useEffect(() => { load(); }, [ws.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = list.filter(i => !i.revoked && new Date(i.expires_at) > new Date() && i.uses < i.max_uses);
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(db.inviteLink(t)); toast('Link copiado'); } catch { toast('Não deu para copiar. Selecione o link e copie.'); } };
  return (
    <div className="stack">
      <div className="note">Mande o link por WhatsApp, e-mail ou chat. Quem abrir entra com Google ou e-mail, cria o personagem e escolhe a mesa.</div>
      <div className="row">
        <div className="field"><label htmlFor="ik">Entra como</label><select id="ik" value={kind} onChange={e => setKind(e.target.value as MemberKind)}><option value="membro">Membro da equipe</option><option value="gestor">Gestor (acompanha)</option></select></div>
        <div className="field"><label htmlFor="id">Vale por</label><select id="id" value={days} onChange={e => setDays(+e.target.value)}>{[1, 3, 7, 14, 30, 60].map(d => <option key={d} value={d}>{d} {d === 1 ? 'dia' : 'dias'}</option>)}</select></div>
        <div className="field"><label htmlFor="iu">Pode ser usado</label><select id="iu" value={uses} onChange={e => setUses(+e.target.value)}>{[1, 5, 10, 20, 50].map(d => <option key={d} value={d}>{d} {d === 1 ? 'vez' : 'vezes'}</option>)}</select></div>
        <button className="cta" style={{ alignSelf: 'end' }} disabled={busy} onClick={() => run(async () => { const inv = await db.createInvite(ws.id, kind, days, uses); await load(); await copy(inv.token); })}>Gerar link</button>
      </div>
      <div className="list">
        {active.length === 0 && <p className="muted small">Nenhum convite ativo.</p>}
        {active.map(i => (
          <div key={i.id} className="item">
            <div className="stack" style={{ gap: 6 }}>
              <div className="copy"><input readOnly value={db.inviteLink(i.token)} onFocus={e => e.target.select()} aria-label="Link do convite" /><button className="ghost sm" onClick={() => copy(i.token)}>Copiar</button></div>
              <small>{i.kind === 'gestor' ? 'Gestor' : 'Membro'} · usado {i.uses} de {i.max_uses} · vale até {new Date(i.expires_at).toLocaleDateString('pt-BR')}</small>
            </div>
            <button className="danger sm" disabled={busy} onClick={() => run(async () => { await db.revokeInvite(i.id); await load(); }, 'Convite cancelado')}>Cancelar</button>
          </div>))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Catálogo
function Catalogo() {
  const { ws, catalog } = useWs();
  const [sec, setSec] = useState<'linhas' | 'funcoes' | 'areas'>('linhas');
  const rot = ws.settings.rotulo_linha || 'Linha';
  return (
    <div className="stack">
      <div className="row">{([['linhas', rot + 's'], ['funcoes', 'Funções'], ['areas', 'Áreas e tipos de tarefa']] as const).map(([k, n]) =>
        <button key={k} className="opt" style={{ padding: '6px 12px' }} aria-pressed={sec === k} onClick={() => setSec(k)}>{n}</button>)}</div>
      {sec === 'linhas' && <Simple kind="linha" items={catalog.filter(c => c.kind === 'linha')} placeholder={`Nova ${rot.toLowerCase()} (ex.: Aromasil)`}
        hint={`Toda tarefa pertence a uma ${rot.toLowerCase()}. Use para separar marcas, produtos ou clientes.`} />}
      {sec === 'funcoes' && <Funcoes items={catalog.filter(c => c.kind === 'funcao')} />}
      {sec === 'areas' && <Areas />}
    </div>
  );
}

function ItemActions({ it, extra }: { it: CatalogItem; extra?: ReactNode }) {
  const { run, busy } = useRun();
  return (
    <span className="row">
      {extra}
      <button className="ghost sm" disabled={busy} onClick={() => { const n = prompt('Novo nome', it.name); if (n && n.trim() && n.trim() !== it.name) run(() => db.updateCatalog(it.id, { name: n.trim() }), 'Renomeado'); }}>Renomear</button>
      <button className="ghost sm" disabled={busy} onClick={() => run(() => db.updateCatalog(it.id, { active: !it.active }), it.active ? 'Desativado' : 'Ativado')}>{it.active ? 'Desativar' : 'Ativar'}</button>
      <button className="danger sm" disabled={busy} onClick={() => confirm(`Excluir "${it.name}"?${it.kind === 'area' ? ' Os tipos dessa área também serão excluídos.' : ''}`) && run(() => db.deleteCatalog(it.id), 'Excluído')}>Excluir</button>
    </span>
  );
}

function AddRow({ placeholder, onAdd, children }: { placeholder: string; onAdd: (name: string) => Promise<unknown>; children?: ReactNode }) {
  const { run, busy } = useRun();
  const [v, setV] = useState('');
  return (
    <form className="addrow" onSubmit={async e => { e.preventDefault(); if (v.trim() && await run(() => onAdd(v.trim()), 'Adicionado')) setV(''); }}>
      <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} maxLength={60} aria-label={placeholder} />
      {children}
      <button className="cta sm" disabled={!v.trim() || busy}>Adicionar</button>
    </form>
  );
}

function Simple({ kind, items, placeholder, hint }: { kind: 'linha'; items: CatalogItem[]; placeholder: string; hint: string }) {
  const { ws } = useWs();
  return (
    <div className="stack">
      <p className="small muted">{hint}</p>
      <AddRow placeholder={placeholder} onAdd={n => db.addCatalog(ws.id, kind, n, { sort: items.length })} />
      <div className="list">
        {items.length === 0 && <p className="muted small">Nada cadastrado ainda.</p>}
        {items.map(it => <div key={it.id} className={'item' + (it.active ? '' : ' off')}><span>{it.name}</span><ItemActions it={it} /></div>)}
      </div>
    </div>
  );
}

function Funcoes({ items }: { items: CatalogItem[] }) {
  const { ws } = useWs();
  const { run, busy } = useRun();
  const editApps = (it: CatalogItem) => {
    const v = prompt('Apps que contam como produtivos para esta função (separe por vírgula)', (it.meta.apps || []).join(', '));
    if (v === null) return;
    run(() => db.updateCatalog(it.id, { meta: { ...it.meta, apps: v.split(',').map(s => s.trim()).filter(Boolean) } }), 'Apps atualizados');
  };
  return (
    <div className="stack">
      <p className="small muted">Cada pessoa escolhe uma função principal e até duas adjacentes. Os apps das funções dela contam como tempo produtivo.</p>
      <AddRow placeholder="Nova função (ex.: Fotógrafo)" onAdd={n => db.addCatalog(ws.id, 'funcao', n, { sort: items.length, meta: { desc: '', apps: [] } })} />
      <div className="list">{items.map(it => (
        <div key={it.id} className={'item' + (it.active ? '' : ' off')}>
          <span><b>{it.name}</b><small>{(it.meta.apps || []).join(', ') || 'Nenhum app cadastrado'}</small></span>
          <ItemActions it={it} extra={<button className="ghost sm" disabled={busy} onClick={() => editApps(it)}>Apps</button>} />
        </div>))}</div>
    </div>
  );
}

function Areas() {
  const { ws, catalog } = useWs();
  const { run, busy } = useRun();
  const areas = catalog.filter(c => c.kind === 'area');
  const funcoes = catalog.filter(c => c.kind === 'funcao' && c.active).map(f => f.name);
  const [open, setOpen] = useState<string | null>(areas[0]?.id || null);
  const [grupo, setGrupo] = useState('');
  return (
    <div className="stack">
      <p className="small muted">A área define quem recebe a tarefa ("Equipe de Design") e o tempo médio usado no cálculo da capacidade do dia. Áreas sem tipos pedem só uma observação.</p>
      <AddRow placeholder="Nova área (ex.: Fotografia)" onAdd={n => db.addCatalog(ws.id, 'area', n, { sort: areas.length, meta: { funcoes: [], est: 60, fases: false } })} />
      <div className="list">{areas.map(a => {
        const tipos = catalog.filter(c => c.kind === 'tipo' && c.parent_id === a.id);
        const grupos = [...new Set(tipos.map(t => t.grupo || 'Geral'))];
        const isOpen = open === a.id;
        return (
          <div key={a.id} className={'item' + (a.active ? '' : ' off')} style={{ gridTemplateColumns: '1fr' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="linkbtn" style={{ textDecoration: 'none', color: 'var(--fg)', textAlign: 'left' }} onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen}>
                <b>{isOpen ? '▾' : '▸'} {a.name}</b> <span className="small muted">· {tipos.length} tipos · {a.meta.est || 60} min em média{a.meta.fases ? ' · com fases de vídeo' : ''}</span>
              </button>
              <ItemActions it={a} />
            </div>
            {isOpen && <div className="stack" style={{ marginTop: 10 }}>
              <div className="row">
                <div className="field"><label>Responsáveis</label>
                  <div className="row">{funcoes.map(f => { const on = (a.meta.funcoes || []).includes(f); return (
                    <button key={f} className="opt" style={{ padding: '4px 10px', fontSize: 12 }} aria-pressed={on} disabled={busy}
                      onClick={() => run(() => db.updateCatalog(a.id, { meta: { ...a.meta, funcoes: on ? (a.meta.funcoes || []).filter(x => x !== f) : [...(a.meta.funcoes || []), f] } }))}>{f}</button>); })}</div>
                  <span className="small muted">Sem nenhum marcado, a tarefa vai para a equipe toda.</span></div>
              </div>
              <div className="row">
                <div className="field"><label htmlFor={'est' + a.id}>Tempo médio (min)</label>
                  <input id={'est' + a.id} type="number" min={5} max={960} defaultValue={a.meta.est || 60} style={{ width: 110 }}
                    onBlur={e => { const v = Math.max(5, Math.min(960, +e.target.value || 60)); if (v !== a.meta.est) run(() => db.updateCatalog(a.id, { meta: { ...a.meta, est: v } }), 'Tempo salvo'); }} /></div>
                <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!a.meta.fases} disabled={busy}
                  onChange={e => run(() => db.updateCatalog(a.id, { meta: { ...a.meta, fases: e.target.checked } }))} /> Usa as fases Roteiro → Captação → Edição → Finalização</label>
              </div>
              {grupos.map(g => (
                <div key={g} className="group"><span className="lbl">{g}</span>
                  <div className="list">{tipos.filter(t => (t.grupo || 'Geral') === g).map(t => (
                    <div key={t.id} className={'item' + (t.active ? '' : ' off')}><span>{t.name}{t.meta.est ? <small>{t.meta.est} min em média</small> : null}</span><ItemActions it={t} /></div>))}</div>
                </div>))}
              <AddRow placeholder="Novo tipo de tarefa" onAdd={n => db.addCatalog(ws.id, 'tipo', n, { parent_id: a.id, grupo: grupo.trim() || 'Geral', sort: tipos.length })}>
                <input list={'g' + a.id} value={grupo} onChange={e => setGrupo(e.target.value)} placeholder="Grupo (opcional)" style={{ flex: '0 1 180px' }} aria-label="Grupo" />
                <datalist id={'g' + a.id}>{grupos.map(g => <option key={g} value={g} />)}</datalist>
              </AddRow>
            </div>}
          </div>);
      })}</div>
    </div>
  );
}

// ------------------------------------------------------------------ Regras
function Regras() {
  const { ws } = useWs();
  const { run, busy } = useRun();
  const [s, setS] = useState<WorkspaceSettings>(ws.settings);
  const rec = s.recursos;
  const setRec = (k: keyof WorkspaceSettings['recursos'], v: boolean) => setS({ ...s, recursos: { ...rec, [k]: v } });
  const list = (v: string[]) => v.join(', ');
  const parse = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean);
  const T = ({ k, n, d }: { k: keyof WorkspaceSettings['recursos']; n: string; d: string }) => (
    <label className="toggle"><span><b style={{ color: 'var(--fg)', fontSize: 14 }}>{n}</b><span>{d}</span></span><input type="checkbox" checked={rec[k]} onChange={e => setRec(k, e.target.checked)} /></label>
  );
  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div className="panel" style={{ padding: '4px 14px' }}>
        <T k="sabadao" n="SABADÃO" d="Quadro de quem trabalha no sábado. Tarefas de sábado de quem folga vão para segunda." />
        <T k="datas_comemorativas" n="Roupas de datas comemorativas" d="Outubro Rosa, Natal, Festa Junina, Carnaval…" />
        <T k="mural_gloria" n="Mural da Glória" d="Ranking mensal com títulos e roupas exclusivas." />
        <T k="instagram" n="Quadro do Instagram" d="Seguidores ao vivo com confete a cada 100 (precisa de conta profissional)." />
      </div>
      <div className="row">
        <div className="field"><label htmlFor="cf">Café por dia (min)</label><input id="cf" type="number" min={0} max={120} value={s.cafe_min} onChange={e => setS({ ...s, cafe_min: +e.target.value })} style={{ width: 120 }} /></div>
        <div className="field"><label htmlFor="ad">Pergunta café ou almoço das</label><input id="ad" type="time" value={s.almoco.de} onChange={e => setS({ ...s, almoco: { ...s.almoco, de: e.target.value } })} /></div>
        <div className="field"><label htmlFor="aa">até</label><input id="aa" type="time" value={s.almoco.ate} onChange={e => setS({ ...s, almoco: { ...s.almoco, ate: e.target.value } })} /></div>
        <div className="field"><label htmlFor="oc">Ociosidade após (min)</label><input id="oc" type="number" min={1} max={60} value={s.ociosidade_min} onChange={e => setS({ ...s, ociosidade_min: +e.target.value })} style={{ width: 120 }} /></div>
      </div>
      <div className="field"><label htmlFor="ia">Apps de IA (contam como produtivos e dão multiplicador com agentes)</label><input id="ia" defaultValue={list(s.apps_ia)} onBlur={e => setS({ ...s, apps_ia: parse(e.target.value) })} /></div>
      <div className="field"><label htmlFor="co">Apps de comunicação</label><input id="co" defaultValue={list(s.apps_comunicacao)} onBlur={e => setS({ ...s, apps_comunicacao: parse(e.target.value) })} /></div>
      <h3 style={{ marginTop: 6 }}>App de computador</h3>
      <p className="small muted">O app lê o título da aba do navegador <b>só no computador</b> para saber a categoria da página, e envia apenas a categoria. Os apps de cada função ficam em "Funções e tarefas".</p>
      <div className="field"><label htmlFor="st">Sites de trabalho (contam como produtivos)</label><textarea id="st" defaultValue={list(s.sites_trabalho || [])} onBlur={e => setS({ ...s, sites_trabalho: parse(e.target.value) })} /></div>
      <div className="field"><label htmlFor="sr">Sites de referência criativa</label><textarea id="sr" defaultValue={list(s.sites_referencia || [])} onBlur={e => setS({ ...s, sites_referencia: parse(e.target.value) })} /></div>
      <div className="field"><label htmlFor="se">E-mail (conta como comunicação)</label><input id="se" defaultValue={list(s.sites_email || [])} onBlur={e => setS({ ...s, sites_email: parse(e.target.value) })} /></div>
      <div className="field"><label htmlFor="pf">Palavras que sinalizam assunto fora da demanda no chat</label><textarea id="pf" defaultValue={list(s.palavras_fora_do_assunto)} onBlur={e => setS({ ...s, palavras_fora_do_assunto: parse(e.target.value) })} /></div>
      <div><button className="cta" disabled={busy} onClick={() => run(() => db.updateWorkspace(ws.id, { settings: s }), 'Regras salvas')}>Salvar regras</button></div>
    </div>
  );
}
