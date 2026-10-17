// Acesso ao banco. Toda a segurança está nas regras (RLS) do Supabase;
// aqui só montamos as consultas.
import { supabase } from './supabase';
import type { CatalogItem, CatalogKind, Invite, InvitePreview, Member, MemberKind, Workspace } from './types';

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(friendly(r.error.message));
  return r.data as T;
}
function friendly(msg: string) {
  if (/JWT|not authenticated/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.';
  if (/catalog_unique_name/i.test(msg)) return 'Já existe um item com esse nome.';
  if (/row-level security/i.test(msg)) return 'Você não tem permissão para isso.';
  return msg;
}

export async function myWorkspaces(userId: string) {
  const rows = check(await supabase.from('members').select('kind,is_admin,workspaces(*)').eq('user_id', userId));
  return (rows as unknown as { kind: MemberKind; is_admin: boolean; workspaces: Workspace }[])
    .filter(r => r.workspaces)
    .map(r => ({ ...r.workspaces, myKind: r.kind, iAmAdmin: r.is_admin }));
}

export async function workspaceBySlug(slug: string) {
  const r = check(await supabase.from('workspaces').select('*').eq('slug', slug).maybeSingle());
  return r as Workspace | null;
}

export async function members(wsId: string) {
  return check(await supabase.from('members').select('*').eq('workspace_id', wsId).order('joined_at')) as Member[];
}

export async function catalog(wsId: string) {
  return check(await supabase.from('catalog_items').select('*').eq('workspace_id', wsId).order('kind').order('sort').order('name')) as CatalogItem[];
}

export async function createWorkspace(name: string, slug: string, desks: number) {
  return check(await supabase.rpc('create_workspace', { p_name: name, p_slug: slug, p_desks: desks })) as Workspace;
}

export async function invitePreview(token: string): Promise<InvitePreview | null> {
  const rows = check(await supabase.rpc('invite_preview', { p_token: token })) as InvitePreview[];
  return rows[0] || null;
}

export async function acceptInvite(token: string) {
  return check(await supabase.rpc('accept_invite', { p_token: token })) as string;
}

export async function claimDesk(wsId: string, desk: number) {
  check(await supabase.rpc('claim_desk', { p_ws: wsId, p_desk: desk }));
}

export async function updateMember(wsId: string, userId: string, patch: Partial<Member>) {
  const r = check(await supabase.from('members').update(patch).eq('workspace_id', wsId).eq('user_id', userId).select());
  if (!(r as Member[]).length) throw new Error('Você não tem permissão para isso.');
}

export async function removeMember(wsId: string, userId: string) {
  check(await supabase.from('members').delete().eq('workspace_id', wsId).eq('user_id', userId));
}

export async function updateWorkspace(wsId: string, patch: Partial<Pick<Workspace, 'name' | 'desks' | 'settings'>>) {
  const r = check(await supabase.from('workspaces').update(patch).eq('id', wsId).select());
  if (!(r as Workspace[]).length) throw new Error('Você não tem permissão para isso.');
}

export async function deleteWorkspace(wsId: string) {
  check(await supabase.from('workspaces').delete().eq('id', wsId));
}

export async function invites(wsId: string) {
  return check(await supabase.from('invites').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false })) as Invite[];
}

export async function createInvite(wsId: string, kind: MemberKind, days: number, maxUses: number) {
  return check(await supabase.rpc('create_invite', { p_ws: wsId, p_kind: kind, p_days: days, p_max: maxUses })) as Invite;
}

export async function revokeInvite(id: string) {
  check(await supabase.from('invites').update({ revoked: true }).eq('id', id));
}

export async function addCatalog(wsId: string, kind: CatalogKind, name: string, extra: Partial<CatalogItem> = {}) {
  return check(await supabase.from('catalog_items').insert({ workspace_id: wsId, kind, name: name.trim(), ...extra }).select().single()) as CatalogItem;
}

export async function updateCatalog(id: string, patch: Partial<CatalogItem>) {
  check(await supabase.from('catalog_items').update(patch).eq('id', id));
}

export async function deleteCatalog(id: string) {
  check(await supabase.from('catalog_items').delete().eq('id', id));
}

