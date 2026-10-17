// Escolhe o banco: Supabase de verdade ou o modo demonstração (no navegador).
import * as real from './data-supabase';
import * as demo from './data-demo';
import { isDemo } from './supabase';

const api: typeof real = isDemo ? demo : real;

export const {
  myWorkspaces, workspaceBySlug, members, catalog, createWorkspace, invitePreview, acceptInvite, claimDesk,
  updateMember, removeMember, updateWorkspace, deleteWorkspace, invites, createInvite, revokeInvite,
  addCatalog, updateCatalog, deleteCatalog
} = api;
export { inviteLink, slugify } from './util';
