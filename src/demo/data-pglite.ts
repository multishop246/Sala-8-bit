// Mesmas funções de lib/data-supabase.ts, mas no Postgres da demonstração (no navegador).
import type { CatalogItem, CatalogKind, Invite, InvitePreview, Member, MemberKind, Workspace } from '../lib/types';
import { DEMO_INVITE, DEMO_USER, asAdmin, asUser, emit, rpc } from './pg';

const me = DEMO_USER.id;
const friendly = (e: unknown): never => {
  const m = e instanceof Error ? e.message : String(e);
  if (/catalog_unique_name/.test(m)) throw new Error('Já existe um item com esse nome.');
  if (/row-level security/.test(m)) throw new Error('Você não tem permissão para isso.');
  throw new Error(m);
};
const run = async <T,>(fn: () => Promise<T>): Promise<T> => { try { return await fn(); } catch (e) { return friendly(e); } };
const write = async <T,>(fn: () => Promise<T>): Promise<T> => { const r = await run(fn); emit(); return r; };
const J = (v: unknown) => (v === undefined ? undefined : JSON.stringify(v));

export const myWorkspaces = (userId: string) => run(() => asUser<Workspace & { myKind: MemberKind; iAmAdmin: boolean }>(userId,
  `select w.*, m.kind as "myKind", m.is_admin as "iAmAdmin" from members m join workspaces w on w.id = m.workspace_id where m.user_id = $1`, [userId]));
export const workspaceBySlug = (slug: string) => run(async () => (await asUser<Workspace>(me, `select * from workspaces where slug = $1`, [slug]))[0] || null);
export const members = (wsId: string) => run(() => asUser<Member>(me, `select * from members where workspace_id = $1 order by joined_at`, [wsId]));
export const catalog = (wsId: string) => run(() => asUser<CatalogItem>(me, `select * from catalog_items where workspace_id = $1 order by kind, sort, name`, [wsId]));
export const createWorkspace = (name: string, slug: string, desks: number) => write(async () => (await rpc<Workspace>(me, 'create_workspace', { p_name: name, p_slug: slug, p_desks: desks }))[0]);
export const invitePreview = (token: string) => run(async () => (await rpc<InvitePreview>(me, 'invite_preview', { p_token: token }))[0] || null);
export const acceptInvite = (token: string) => write(async () => {
  const slug = (await rpc<{ accept_invite: string }>(me, 'accept_invite', { p_token: token }))[0].accept_invite;
  // na demonstração você entra como administrador, para conhecer as configurações
  if (token === DEMO_INVITE) {
    await asAdmin(`select set_config('sala.bypass','on',false)`);
    await asAdmin(`update members set is_admin = true where user_id = $1 and workspace_id = (select id from workspaces where slug = $2)`, [me, slug]);
    await asAdmin(`select set_config('sala.bypass','off',false)`);
  }
  return slug;
});
export const claimDesk = (wsId: string, desk: number) => write(async () => { await rpc(me, 'claim_desk', { p_ws: wsId, p_desk: desk }); });

const MEMBER_COLS = ['kind', 'is_admin', 'display_name', 'avatar', 'main_role', 'adj_roles', 'schedule', 'report_folder', 'desk', 'consent_at'] as const;
export const updateMember = (wsId: string, userId: string, patch: Partial<Member>) => write(async () => {
  const keys = MEMBER_COLS.filter(k => k in patch);
  if (!keys.length) return;
  const vals = keys.map(k => (k === 'avatar' || k === 'schedule' ? J(patch[k]) : patch[k]));
  const sets = keys.map((k, i) => `${k} = $${i + 3}${k === 'avatar' || k === 'schedule' ? '::jsonb' : ''}`).join(', ');
  const r = await asUser(me, `update members set ${sets} where workspace_id = $1 and user_id = $2 returning user_id`, [wsId, userId, ...vals]);
  if (!r.length) throw new Error('Você não tem permissão para isso.');
});
export const removeMember = (wsId: string, userId: string) => write(async () => { await asUser(me, `delete from members where workspace_id = $1 and user_id = $2`, [wsId, userId]); });
export const updateWorkspace = (wsId: string, patch: Partial<Pick<Workspace, 'name' | 'desks' | 'settings'>>) => write(async () => {
  const keys = (['name', 'desks', 'settings'] as const).filter(k => k in patch);
  const vals = keys.map(k => (k === 'settings' ? J(patch[k]) : patch[k]));
  const r = await asUser(me, `update workspaces set ${keys.map((k, i) => `${k} = $${i + 2}${k === 'settings' ? '::jsonb' : ''}`).join(', ')} where id = $1 returning id`, [wsId, ...vals]);
  if (!r.length) throw new Error('Você não tem permissão para isso.');
});
export const deleteWorkspace = (wsId: string) => write(async () => { await asUser(me, `delete from workspaces where id = $1`, [wsId]); });
export const invites = (wsId: string) => run(() => asUser<Invite>(me, `select * from invites where workspace_id = $1 order by created_at desc`, [wsId]));
export const createInvite = (wsId: string, kind: MemberKind, days: number, maxUses: number) => write(async () => (await rpc<Invite>(me, 'create_invite', { p_ws: wsId, p_kind: kind, p_days: days, p_max: maxUses }))[0]);
export const revokeInvite = (id: string) => write(async () => { await asUser(me, `update invites set revoked = true where id = $1`, [id]); });

const CAT_COLS = ['name', 'parent_id', 'grupo', 'meta', 'sort', 'active'] as const;
export const addCatalog = (wsId: string, kind: CatalogKind, name: string, extra: Partial<CatalogItem> = {}) => write(async () => {
  const keys = CAT_COLS.filter(k => k !== 'name' && k in extra);
  const vals = keys.map(k => (k === 'meta' ? J(extra[k]) : extra[k]));
  const r = await asUser<CatalogItem>(me, `insert into catalog_items(workspace_id, kind, name${keys.map(k => ', ' + k).join('')})
     values ($1, $2, $3${keys.map((k, i) => `, $${i + 4}${k === 'meta' ? '::jsonb' : ''}`).join('')}) returning *`, [wsId, kind, name.trim(), ...vals]);
  return r[0];
});
export const updateCatalog = (id: string, patch: Partial<CatalogItem>) => write(async () => {
  const keys = CAT_COLS.filter(k => k in patch);
  if (!keys.length) return;
  const vals = keys.map(k => (k === 'meta' ? J(patch[k]) : patch[k]));
  await asUser(me, `update catalog_items set ${keys.map((k, i) => `${k} = $${i + 2}${k === 'meta' ? '::jsonb' : ''}`).join(', ')} where id = $1`, [id, ...vals]);
});
export const deleteCatalog = (id: string) => write(async () => { await asUser(me, `delete from catalog_items where id = $1`, [id]); });
