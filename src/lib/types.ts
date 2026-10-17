export type MemberKind = 'membro' | 'gestor';

export interface Avatar {
  sex: 'f' | 'm';
  skin: string;
  hair: string;
  hs: string;
  beard: string;
  acc: string;
  out: string;
  oc: string;
}

export interface Schedule { e1: string; s1: string; e2: string; s2: string }

export interface WorkspaceSettings {
  rotulo_linha: string;
  recursos: { sabadao: boolean; datas_comemorativas: boolean; mural_gloria: boolean; instagram: boolean };
  cafe_min: number;
  almoco: { de: string; ate: string };
  ociosidade_min: number;
  apps_ia: string[];
  apps_comunicacao: string[];
  palavras_fora_do_assunto: string[];
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  desks: number;
  settings: WorkspaceSettings;
  created_by: string | null;
  created_at: string;
}

export interface Member {
  workspace_id: string;
  user_id: string;
  kind: MemberKind;
  is_admin: boolean;
  display_name: string | null;
  avatar: Partial<Avatar>;
  main_role: string | null;
  adj_roles: string[];
  schedule: Schedule | null;
  report_folder: string | null;
  desk: number | null;
  consent_at: string | null;
  joined_at: string;
}

export type CatalogKind = 'funcao' | 'area' | 'tipo' | 'linha';

export interface CatalogItem {
  id: string;
  workspace_id: string;
  kind: CatalogKind;
  name: string;
  parent_id: string | null;
  grupo: string | null;
  meta: { desc?: string; apps?: string[]; funcoes?: string[]; est?: number | null; fases?: boolean };
  sort: number;
  active: boolean;
}

export interface Invite {
  id: string;
  workspace_id: string;
  token: string;
  kind: MemberKind;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}

export interface InvitePreview {
  workspace_name: string;
  workspace_slug: string;
  kind: MemberKind;
  valid: boolean;
  already_member: boolean;
}

/** O cadastro está completo quando a pessoa aceitou os termos (gestor só precisa de nome e personagem). */
export const profileDone = (m: Member) => !!m.display_name && !!m.consent_at;

// ------------------------------------------------------------- 0.2: sala ao vivo
export type MemberState = 'fora' | 'trabalhando' | 'cafe' | 'almoco' | 'reuniao' | 'pausa_gestor' | 'encerrado';
export type Device = 'computador' | 'celular';

export interface Status { workspace_id: string; user_id: string; state: MemberState; since: string; meeting_id: string | null; device: Device; updated_at: string }
export interface Pause { id: string; workspace_id: string; user_id: string; kind: 'cafe' | 'almoco'; day: string; started_at: string; ended_at: string | null }
export interface Meeting { id: string; workspace_id: string; subject: string; created_by: string; visitors: number; outsiders: number; started_at: string; ended_at: string | null }
export interface MeetingMember { meeting_id: string; workspace_id: string; user_id: string; joined_at: string; left_at: string | null }
export interface AttentionCall { id: string; workspace_id: string; from_user: string; to_user: string; created_at: string; seen_at: string | null }

export interface LiveSnapshot {
  statuses: Status[];
  pauses: Pause[];            // de hoje
  meetings: Meeting[];        // abertas
  meetingMembers: MeetingMember[]; // de reuniões abertas, ainda dentro
  calls: AttentionCall[];     // abertas, envolvendo você
}
export type OnlineMap = Record<string, { device: Device }>;
