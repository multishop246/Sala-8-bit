// Modo demonstração: imita o banco do Supabase (mesmas regras) guardando tudo no navegador.
// Serve para experimentar o Sala 8-bit antes de instalar. Nada sai deste aparelho.
import catalogDefault from './catalog-default.json';
import type { Avatar, CatalogItem, CatalogKind, Invite, InvitePreview, Member, MemberKind, Workspace, WorkspaceSettings } from './types';

export const DEMO_USER = { id: 'demo-voce', email: 'voce@demonstracao.local' };
export const DEMO_INVITE = 'demo0000000000000000000000000001';
const KEY = 'sala8bit.demo.db';

interface DB { workspaces: Workspace[]; members: Member[]; invites: Invite[]; catalog: CatalogItem[] }

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16));
const now = () => new Date().toISOString();
const wait = <T,>(v: T) => new Promise<T>(r => setTimeout(() => r(structuredClone(v)), 60));
const fail = (msg: string): never => { throw new Error(msg); };
const me = () => DEMO_USER.id;

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  rotulo_linha: 'Linha',
  recursos: { sabadao: true, datas_comemorativas: true, mural_gloria: true, instagram: false },
  cafe_min: 15, almoco: { de: '11:00', ate: '13:00' }, ociosidade_min: 5,
  apps_ia: ['ChatGPT', 'Claude', 'Gemini', 'Copilot'],
  apps_comunicacao: ['Slack', 'WhatsApp', 'Outlook', 'Microsoft Teams', 'Google Chat'],
  palavras_fora_do_assunto: ['futebol', 'jogo de ontem', 'novela', 'bbb', 'fofoca', 'balada', 'churrasco', 'cerveja', 'netflix']
};

function seedCatalog(wsId: string): CatalogItem[] {
  const out: CatalogItem[] = [];
  const item = (kind: CatalogKind, name: string, sort: number, meta: CatalogItem['meta'], parent_id: string | null = null, grupo: string | null = null): CatalogItem =>
    ({ id: uid(), workspace_id: wsId, kind, name, parent_id, grupo, meta, sort, active: true });
  catalogDefault.funcoes.forEach((f, i) => out.push(item('funcao', f.nome, i, { desc: f.desc, apps: f.apps })));
  catalogDefault.areas.forEach((a, i) => {
    const area = item('area', a.nome, i, { funcoes: a.funcoes, est: a.est, fases: a.fases });
    out.push(area);
    a.tipos.forEach((t, j) => out.push(item('tipo', t.nome, j, t.est ? { est: t.est } : {}, area.id, t.grupo)));
  });
  return out;
}

const P = (sex: 'f' | 'm', skin: string, hair: string, hs: string, out: string, oc: string, beard = 'nenhuma', acc = 'nenhum'): Avatar => ({ sex, skin, hair, hs, beard, acc, out, oc });
function seed(): DB {
  const ws: Workspace = { id: uid(), name: 'Agência Demonstração', slug: 'demo', desks: 8, settings: DEFAULT_SETTINGS, created_by: 'demo-ana', created_at: now() };
  const S = { e1: '08:00', s1: '12:00', e2: '13:00', s2: '18:00' };
  const people: [string, Avatar, string, string[], number | null, MemberKind, boolean][] = [
    ['Marina', P('f', '#eec1a0', '#141010', 'franja', 'cardiga', '#e76f8a'), 'Social Media', ['Copywriter'], 1, 'membro', true],
    ['Rafael', P('m', '#8d5a3b', '#141010', 'cacheado', 'camiseta', '#3fb6a8', 'curta'), 'Designer', ['Editor de Vídeo'], 2, 'membro', false],
    ['Júlia', P('f', '#f6d3b8', '#d9a441', 'rabo', 'blazer', '#e2a33b'), 'Tráfego Pago', ['Analista de SEO'], 3, 'membro', false],
    ['Diego', P('m', '#c68b62', '#3b2418', 'curto', 'moletom', '#3d4a7a', 'cavanhaque', 'relogio'), 'Editor de Vídeo', [], 4, 'membro', false],
    ['Larissa', P('f', '#e0ac85', '#7a3b22', 'longo', 'jaqueta', '#b84a4a'), 'Copywriter', ['Social Media'], 5, 'membro', false],
    ['Bruno', P('m', '#e0ac85', '#5a3a26', 'curto', 'social', '#4f7a52', 'bigode'), 'Gestor de Projetos', ['Atendimento'], 6, 'membro', false],
    ['Helena', P('f', '#a8704a', '#141010', 'coque', 'terno', '#1d2b55'), '', [], null, 'gestor', false]
  ];
  const members: Member[] = people.map(([name, avatar, main, adj, desk, kind, admin], i) => ({
    workspace_id: ws.id, user_id: 'demo-p' + i, kind, is_admin: admin, display_name: name, avatar, main_role: main || null, adj_roles: adj,
    schedule: kind === 'membro' ? S : null, report_folder: null, desk, consent_at: now(), joined_at: new Date(Date.now() - (10 - i) * 864e5).toISOString()
  }));
  const invites: Invite[] = [{ id: uid(), workspace_id: ws.id, token: DEMO_INVITE, kind: 'membro', max_uses: 50, uses: 0, expires_at: new Date(Date.now() + 365 * 864e5).toISOString(), revoked: false, created_at: now() }];
  const catalog = seedCatalog(ws.id);
  ['Aromasil', 'Fidalgos', 'Radicar'].forEach((n, i) => catalog.push({ id: uid(), workspace_id: ws.id, kind: 'linha', name: n, parent_id: null, grupo: null, meta: {}, sort: i, active: true }));
  return { workspaces: [ws], members, invites, catalog };
}

export function load(): DB {
  try { const v = localStorage.getItem(KEY); if (v) return JSON.parse(v); } catch { /* vazio */ }
  const db = seed(); save(db); return db;
}
function save(db: DB) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* sem armazenamento */ } }
function tx<T>(fn: (db: DB) => T): Promise<T> {
  const db = load();
  try { const r = fn(db); save(db); return wait(r); } catch (e) { return new Promise((_, rej) => setTimeout(() => rej(e), 60)); }
}
const isMember = (db: DB, ws: string) => db.members.some(m => m.workspace_id === ws && m.user_id === me());
const isAdmin = (db: DB, ws: string) => db.members.some(m => m.workspace_id === ws && m.user_id === me() && m.is_admin);
const admins = (db: DB, ws: string, except?: string) => db.members.filter(m => m.workspace_id === ws && m.is_admin && m.user_id !== except).length;

export const myWorkspaces = (userId: string) => tx(db => db.members.filter(m => m.user_id === userId)
  .map(m => ({ ...db.workspaces.find(w => w.id === m.workspace_id)!, myKind: m.kind, iAmAdmin: m.is_admin })).filter(w => w.id));
export const workspaceBySlug = (slug: string) => tx(db => { const w = db.workspaces.find(x => x.slug === slug); return w && isMember(db, w.id) ? w : null; });
export const members = (wsId: string) => tx(db => isMember(db, wsId) ? db.members.filter(m => m.workspace_id === wsId).sort((a, b) => a.joined_at.localeCompare(b.joined_at)) : []);
export const catalog = (wsId: string) => tx(db => isMember(db, wsId) ? db.catalog.filter(c => c.workspace_id === wsId).sort((a, b) => a.kind.localeCompare(b.kind) || a.sort - b.sort || a.name.localeCompare(b.name)) : []);

export const createWorkspace = (name: string, slug: string, desks: number) => tx(db => {
  if (db.workspaces.some(w => w.slug === slug)) fail('Este endereço já está em uso. Escolha outro.');
  if (!/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) fail('Endereço inválido.');
  const ws: Workspace = { id: uid(), name: name.trim(), slug, desks, settings: DEFAULT_SETTINGS, created_by: me(), created_at: now() };
  db.workspaces.push(ws);
  db.members.push({ workspace_id: ws.id, user_id: me(), kind: 'membro', is_admin: true, display_name: null, avatar: {}, main_role: null, adj_roles: [], schedule: null, report_folder: null, desk: null, consent_at: null, joined_at: now() });
  db.catalog.push(...seedCatalog(ws.id));
  return ws;
});

export const invitePreview = (token: string) => tx<InvitePreview | null>(db => {
  const i = db.invites.find(x => x.token === token); if (!i) return null;
  const w = db.workspaces.find(x => x.id === i.workspace_id)!;
  return { workspace_name: w.name, workspace_slug: w.slug, kind: i.kind, valid: !i.revoked && new Date(i.expires_at) > new Date() && i.uses < i.max_uses, already_member: isMember(db, w.id) };
});

export const acceptInvite = (token: string) => tx(db => {
  const i = db.invites.find(x => x.token === token) || fail('Convite não encontrado.');
  const w = db.workspaces.find(x => x.id === i.workspace_id)!;
  if (isMember(db, w.id)) return w.slug;
  if (i.revoked || new Date(i.expires_at) <= new Date() || i.uses >= i.max_uses) fail('Este convite expirou. Peça um novo ao administrador.');
  // na demonstração você entra como administrador para conhecer as configurações
  db.members.push({ workspace_id: w.id, user_id: me(), kind: i.kind, is_admin: token === DEMO_INVITE, display_name: null, avatar: {}, main_role: null, adj_roles: [], schedule: null, report_folder: null, desk: null, consent_at: null, joined_at: now() });
  i.uses++;
  return w.slug;
});

export const claimDesk = (wsId: string, desk: number) => tx(db => {
  const m = db.members.find(x => x.workspace_id === wsId && x.user_id === me()) || fail('Você não faz parte desta empresa.');
  if (m.kind === 'gestor') fail('O gestor usa a mesa da diretoria.');
  if (m.desk) fail('Você já tem uma mesa. Peça ao administrador para trocar.');
  const w = db.workspaces.find(x => x.id === wsId)!;
  if (desk < 1 || desk > w.desks) fail('Mesa inexistente.');
  if (db.members.some(x => x.workspace_id === wsId && x.desk === desk)) fail('Alguém acabou de escolher essa mesa. Escolha outra.');
  m.desk = desk;
});

export const updateMember = (wsId: string, userId: string, patch: Partial<Member>) => tx(db => {
  const m = db.members.find(x => x.workspace_id === wsId && x.user_id === userId);
  const admin = isAdmin(db, wsId);
  if (!m || (userId !== me() && !admin)) fail('Você não tem permissão para isso.');
  const t = m!;
  if (!admin && (('kind' in patch && patch.kind !== t.kind) || ('is_admin' in patch && patch.is_admin !== t.is_admin) || ('desk' in patch && patch.desk !== t.desk)))
    fail('Só o administrador pode mudar função na empresa, mesa ou permissões.');
  if (admin && patch.desk != null && patch.desk !== t.desk) fail('Use "Escolher mesa" para ocupar uma mesa.');
  if (t.is_admin && patch.is_admin === false && !admins(db, wsId, t.user_id)) fail('A empresa precisa de pelo menos um administrador.');
  Object.assign(t, patch);
  if (t.kind === 'gestor') t.desk = null;
});

export const removeMember = (wsId: string, userId: string) => tx(db => {
  if (userId !== me() && !isAdmin(db, wsId)) fail('Você não tem permissão para isso.');
  const m = db.members.find(x => x.workspace_id === wsId && x.user_id === userId);
  if (m?.is_admin && !admins(db, wsId, userId)) fail('A empresa precisa de pelo menos um administrador.');
  db.members = db.members.filter(x => x !== m);
});

export const updateWorkspace = (wsId: string, patch: Partial<Pick<Workspace, 'name' | 'desks' | 'settings'>>) => tx(db => {
  if (!isAdmin(db, wsId)) fail('Você não tem permissão para isso.');
  const w = db.workspaces.find(x => x.id === wsId)!;
  if (patch.desks && patch.desks < w.desks && db.members.some(m => m.workspace_id === wsId && (m.desk || 0) > patch.desks!))
    fail('Há pessoas sentadas nas mesas que seriam removidas. Libere essas mesas antes.');
  Object.assign(w, patch);
});

export const deleteWorkspace = (wsId: string) => tx(db => {
  const w = db.workspaces.find(x => x.id === wsId);
  if (!w || w.created_by !== me()) return;
  db.workspaces = db.workspaces.filter(x => x.id !== wsId);
  db.members = db.members.filter(x => x.workspace_id !== wsId);
  db.invites = db.invites.filter(x => x.workspace_id !== wsId);
  db.catalog = db.catalog.filter(x => x.workspace_id !== wsId);
});

export const invites = (wsId: string) => tx(db => isAdmin(db, wsId) ? db.invites.filter(i => i.workspace_id === wsId).sort((a, b) => b.created_at.localeCompare(a.created_at)) : []);
export const createInvite = (wsId: string, kind: MemberKind, days: number, maxUses: number) => tx(db => {
  if (!isAdmin(db, wsId)) fail('Só o administrador pode convidar.');
  const i: Invite = { id: uid(), workspace_id: wsId, token: uid().replace(/-/g, ''), kind, max_uses: maxUses, uses: 0, expires_at: new Date(Date.now() + days * 864e5).toISOString(), revoked: false, created_at: now() };
  db.invites.push(i); return i;
});
export const revokeInvite = (id: string) => tx(db => { const i = db.invites.find(x => x.id === id); if (i && isAdmin(db, i.workspace_id)) i.revoked = true; });

export const addCatalog = (wsId: string, kind: CatalogKind, name: string, extra: Partial<CatalogItem> = {}) => tx(db => {
  if (!isAdmin(db, wsId)) fail('Você não tem permissão para isso.');
  const parent = extra.parent_id ?? null;
  if (db.catalog.some(c => c.workspace_id === wsId && c.kind === kind && c.parent_id === parent && c.name.toLowerCase() === name.trim().toLowerCase())) fail('Já existe um item com esse nome.');
  const it: CatalogItem = { id: uid(), workspace_id: wsId, kind, name: name.trim(), parent_id: parent, grupo: null, meta: {}, sort: 0, active: true, ...extra };
  db.catalog.push(it); return it;
});
export const updateCatalog = (id: string, patch: Partial<CatalogItem>) => tx(db => {
  const it = db.catalog.find(c => c.id === id);
  if (!it || !isAdmin(db, it.workspace_id)) fail('Você não tem permissão para isso.');
  if (patch.name && db.catalog.some(c => c.id !== id && c.workspace_id === it!.workspace_id && c.kind === it!.kind && c.parent_id === it!.parent_id && c.name.toLowerCase() === patch.name!.toLowerCase())) fail('Já existe um item com esse nome.');
  Object.assign(it!, patch);
});
export const deleteCatalog = (id: string) => tx(db => {
  const it = db.catalog.find(c => c.id === id);
  if (!it || !isAdmin(db, it.workspace_id)) fail('Você não tem permissão para isso.');
  db.catalog = db.catalog.filter(c => c.id !== id && c.parent_id !== id);
});
