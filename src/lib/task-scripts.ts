import { isDemo, supabase } from './supabase';
import type { Task } from './types';

const BUCKET = 'task-scripts';
export async function listOldFinishedScripts(workspaceId: string) {
  if (isDemo) return [] as Task[];
  const first = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('sv-SE');
  const result = await supabase.from('tasks').select('*').eq('workspace_id', workspaceId).eq('col', 'feito').not('script_path', 'is', null).lt('done_at', first);
  if (result.error) throw new Error(result.error.message);
  return result.data as Task[];
}

export async function uploadScript(task: Task, file: File) {
  if (isDemo) throw new Error('Anexos estão disponíveis no escritório conectado ao Supabase.');
  if (task.etapa === null) throw new Error('O roteiro só pode ser anexado a demandas de vídeo.');
  if (file.size > 10 * 1024 * 1024 || file.size === 0) throw new Error('Escolha um PDF de até 10 MB.');
  const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (signature !== '%PDF-') throw new Error('O arquivo precisa ser um PDF válido.');
  const path = `${task.workspace_id}/${task.id}/roteiro.pdf`;
  const uploaded = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const linked = await supabase.rpc('set_task_script', { p_task: task.id, p_path: path });
  if (linked.error) throw new Error(`PDF enviado, mas não vinculado à tarefa: ${linked.error.message}`);
}

export async function scriptUrl(path: string) {
  const result = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (result.error || !result.data?.signedUrl) throw new Error(result.error?.message || 'Não foi possível abrir o roteiro.');
  return result.data.signedUrl;
}

export async function deleteScript(task: Task) {
  if (!task.script_path) return;
  const removed = await supabase.storage.from(BUCKET).remove([task.script_path]);
  if (removed.error) throw new Error(removed.error.message);
  const unlinked = await supabase.rpc('set_task_script', { p_task: task.id, p_path: null });
  if (unlinked.error) throw new Error(unlinked.error.message);
}
