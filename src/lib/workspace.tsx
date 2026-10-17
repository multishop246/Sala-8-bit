import { createContext, useContext } from 'react';
import type { CatalogItem, Member, Workspace } from './types';

export interface WsCtx {
  ws: Workspace;
  me: Member;
  members: Member[];
  catalog: CatalogItem[];
  reload: () => Promise<void>;
}
export const WorkspaceContext = createContext<WsCtx | null>(null);
export function useWs() {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error('useWs fora do escritório');
  return v;
}
