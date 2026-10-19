import type { DayApp, TaskEvent } from '../lib/types';

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.exe$/i, '').trim();
const utilities = new Set(['windows shell experience host', 'shellexperiencehost', 'calculator', 'calculatorapp', 'calculadora', 'calc', 'capcut', 'windows explorer', 'explorer', 'file explorer', 'explorador de arquivos', 'notepad', 'bloco de notas', 'notepad++']);

export function reportApp(app: DayApp): DayApp | null {
  const name = normalized(app.app);
  if (/^sala[ -]8[ -]bit(?: testes)?$/.test(name)) return null;
  // Preserve explicitly selected lunch/coffee pauses, including Explorer.
  return utilities.has(name) && app.category === 'dis'
    ? { ...app, category: 'prod' } : app;
}

export function completedStage(event: Pick<TaskEvent, 'kind' | 'text' | 'completed_stage'>): string {
  const text = normalized(event.text);
  const stages: [string, string][] = [['roteiro','Roteiro'], ['captacao','Captação'], ['edicao','Edição'], ['finalizacao','Finalização']];
  if (event.completed_stage) return stages.find(([key]) => key === event.completed_stage)?.[1] || 'Tarefa concluída';
  const next = /passou para (captacao|edicao|finalizacao)\b/.exec(text)?.[1];
  if (next) return { captacao: 'Roteiro', edicao: 'Captação', finalizacao: 'Edição' }[next as 'captacao' | 'edicao' | 'finalizacao'];
  // Use the event recorded at completion, never the task's current stage.
  for (const [key, label] of stages) if (new RegExp(`\\b${key}\\b`).test(text)) return label;
  return event.kind === 'etapa' ? 'Etapa concluída (sem identificação no histórico)' : 'Tarefa concluída';
}
