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
  /** roupa temática escolhida (só vale no mês dela) */
  theme?: string | null;
  /** posição na equipe, para cada um ter uma variação diferente da roupa temática */
  vi?: number;
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
  sites_trabalho?: string[];
  sites_referencia?: string[];
  sites_email?: string[];
  fuso?: string;
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

export interface Status { workspace_id: string; user_id: string; state: MemberState; since: string; meeting_id: string | null; device: Device; updated_at: string; active_task_id?: string | null;
  app_now?: string | null; app_cat?: string | null; music?: boolean; agents?: number; idle?: boolean; agent_seen_at?: string | null }
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
  board: BoardSnapshot;
  saturdays: SaturdayShift[];     // de hoje em diante
  instagram: InstagramStats | null;
}
export type OnlineMap = Record<string, { device: Device }>;

// ------------------------------------------------------------- 0.3: tarefas e chat
export type Col = 'afazer' | 'fazendo' | 'feito';
export type Etapa = 'roteiro' | 'captacao' | 'edicao' | 'finalizacao';
export interface Task {
  id: string; workspace_id: string; title: string; description: string;
  line_id: string | null; area_id: string | null; type_id: string | null;
  col: Col; etapa: Etapa | null; owner: string | null; dir_to: string | null; linked_to: string | null; creator: string;
  due_date: string; due_time: string | null; est_min: number; spent_sec: number; phase_spent_sec: number; running_since: string | null;
  created_at: string; started_at: string | null; done_at: string | null; updated_at: string;
}
export interface TaskEvent { id: string; task_id: string; workspace_id: string; actor: string | null; kind: string; text: string; created_at: string }
export interface Contest { id: string; task_id: string; workspace_id: string; by_user: string; text: string; status: 'aberta' | 'aprovada' | 'recusada'; created_at: string; closed_at: string | null }
export interface Vote { contest_id: string; workspace_id: string; user_id: string; vote: boolean }
export interface Transfer { id: string; task_id: string; workspace_id: string; from_user: string; to_user: string; status: 'pendente' | 'aceita' | 'recusada' | 'cancelada'; justification: string | null; created_at: string }
export interface HelpReq { id: string; task_id: string; workspace_id: string; from_user: string; to_user: string; note: string; status: 'pendente' | 'aceita' | 'recusada' | 'cancelada'; justification: string | null; created_at: string }
export interface Duration { user_id: string; area_id: string | null; type_id: string | null; etapa: string | null; minutes: number; done_at: string }
export interface Message { id: string; workspace_id: string; from_user: string; to_user: string; task_id: string | null; text: string; flagged: boolean; created_at: string; read_at: string | null }

export interface BoardSnapshot {
  tasks: Task[];            // abertas + concluídas nos últimos 30 dias
  events: TaskEvent[];
  contests: Contest[];
  votes: Vote[];
  transfers: Transfer[];
  help: HelpReq[];
  durations: Duration[];    // últimos 120 dias
  messages: Message[];      // suas conversas, últimos 30 dias
}
export interface NewTask { title: string; description: string; line_id: string; area_id: string; type_id: string | null; dir_to: string | null; due_date: string; due_time: string | null; est_min: number }

// ------------------------------------------------------------- 0.4: mural, painel, SABADÃO, Instagram
export interface SaturdayShift { workspace_id: string; user_id: string; day: string; works: boolean; set_by: string | null; updated_at: string }
export interface InstagramStats { workspace_id: string; handle: string | null; followers: number; source: 'manual' | 'api'; updated_at: string }
export interface GloryScore { user_id: string; ajudas: number; entregas: number; tarefa_min: number; ia_min: number }
export interface DaySummary {
  user_id: string; tarefa_min: number; reuniao_min: number; cafe_min: number; almoco_min: number; entregas: number; ajudas: number; primeira_entrada: string | null;
  rastreado_min: number; produtivo_min: number; ref_min: number; com_min: number; dis_min: number; ocioso_min: number; ia_min: number; bonus_ia_min: number;
}
export interface DayApp { app: string; category: string; minutes: number }
export interface TimeLogRow { task_id: string; seconds: number }
