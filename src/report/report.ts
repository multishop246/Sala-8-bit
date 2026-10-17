// Relatório do dia em PDF.
import type { BoardSnapshot, CatalogItem, DayApp, DaySummary, Member, TimeLogRow, Workspace } from '../lib/types';

export interface ReportInput {
  ws: Workspace; me: Member; day: string; summary: DaySummary | undefined; timeLog: TimeLogRow[];
  board: BoardSnapshot; catalog: CatalogItem[]; endedAt: Date | null; apps?: DayApp[];
}
const fmtD = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}`;
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const reportName = (day: string, name: string) => `${day} - ${name.replace(/[\\/:*?"<>|]/g, '')} - Relatório do dia.pdf`;

export async function buildReport(i: ReportInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16;
  let y = 18;
  const line = (t: string, size = 10, bold = false, color: [number, number, number] = [30, 34, 46]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    const parts = doc.splitTextToSize(t, W - 2 * M) as string[];
    for (const p of parts) { if (y > 280) { doc.addPage(); y = 18; } doc.text(p, M, y); y += size * 0.45; }
  };
  const gap = (n = 3) => { y += n; };
  const name = i.me.display_name || 'Você';
  // cabeçalho
  doc.setFillColor(20, 26, 43); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Relatório do dia', M, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`${name} · ${i.ws.name} · ${br(i.day)}`, M, 22);
  y = 40;
  const s = i.summary;
  const sch = i.me.schedule;
  line([i.me.main_role, ...(i.me.adj_roles || [])].filter(Boolean).join(' + ') || 'Equipe', 10, false, [107, 115, 144]);
  if (sch) line(`Jornada: ${sch.e1}–${sch.s1} e ${sch.e2}–${sch.s2}`, 10, false, [107, 115, 144]);
  if (i.endedAt) line(`Expediente encerrado às ${i.endedAt.toTimeString().slice(0, 5)}`, 10, false, [107, 115, 144]);
  gap(4);
  // resumo em blocos
  const cafeMax = i.ws.settings.cafe_min ?? 15;
  const kpis: [string, string][] = [
    ['Tempo em tarefas', fmtD(s?.tarefa_min || 0)], ['Entregas', String(s?.entregas || 0)], ['Reuniões', fmtD(s?.reuniao_min || 0)],
    ['Café', `${s?.cafe_min || 0} de ${cafeMax} min`], ['Almoço', s?.almoco_min ? fmtD(s.almoco_min) : '—'], ['Ajudas aos colegas', String(s?.ajudas || 0)]
  ];
  const bw = (W - 2 * M - 10) / 3;
  kpis.forEach(([k, v], n) => {
    const x = M + (n % 3) * (bw + 5), yy = y + Math.floor(n / 3) * 20;
    doc.setFillColor(241, 243, 248); doc.roundedRect(x, yy, bw, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(107, 115, 144); doc.text(k.toUpperCase(), x + 4, yy + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 34, 46); doc.text(v, x + 4, yy + 13);
  });
  y += 44;
  if ((s?.cafe_min || 0) > cafeMax) { line(`O café passou ${(s!.cafe_min - cafeMax)} min do limite do dia (conta como distração).`, 9, false, [198, 47, 69]); gap(2); }
  // app de computador
  if (s && s.rastreado_min > 0) {
    const base = s.produtivo_min - s.bonus_ia_min, den = base + s.com_min + s.dis_min + s.ocioso_min;
    line('Tempo no computador', 12, true); gap(1);
    line(`Produtivo: ${fmtD(s.produtivo_min)}${s.bonus_ia_min ? ` (inclui +${fmtD(s.bonus_ia_min)} do multiplicador de IA)` : ''} · Referência criativa: ${fmtD(s.ref_min)} · Comunicação: ${fmtD(s.com_min)} · Distração: ${fmtD(s.dis_min)} · Ocioso: ${fmtD(s.ocioso_min)} · Com IA rodando: ${fmtD(s.ia_min)}`, 10);
    if (den) line(`Aproveitamento: ${Math.min(100, Math.round(base / den * 100))}%`, 10, true);
    const NAMES: Record<string, string> = { prod: 'produtivo', ref: 'referência', com: 'comunicação', dis: 'distração', idle: 'ocioso', ia: 'IA', meet: 'reunião', gestor: 'pausa do gestor', pausa: 'pausa' };
    for (const a of (i.apps || []).slice(0, 12)) line(`• ${a.app} — ${fmtD(a.minutes)} (${NAMES[a.category] || a.category})`, 10);
    gap(3);
  }
  // tarefas trabalhadas
  const cat = new Map(i.catalog.map(c => [c.id, c.name]));
  line('Tarefas trabalhadas hoje', 12, true); gap(1);
  if (!i.timeLog.length) line('Nenhum tempo registrado em tarefas hoje.', 10, false, [107, 115, 144]);
  const status = { afazer: 'A fazer', fazendo: 'Fazendo', feito: 'Feito' } as const;
  for (const r of [...i.timeLog].sort((a, b) => b.seconds - a.seconds)) {
    const t = i.board.tasks.find(x => x.id === r.task_id);
    line(`• ${t?.title || 'Tarefa excluída'} — ${fmtD(r.seconds / 60)}${t ? ` · ${t.line_id ? cat.get(t.line_id) + ' · ' : ''}${status[t.col]}` : ''}`, 10);
  }
  gap(3);
  // entregas
  const evs = i.board.events.filter(e => e.actor === i.me.user_id && (e.kind === 'concluiu' || e.kind === 'etapa') && new Date(e.created_at).toLocaleDateString('sv-SE') === i.day);
  line('Entregas e etapas concluídas', 12, true); gap(1);
  if (!evs.length) line('Nenhuma entrega hoje.', 10, false, [107, 115, 144]);
  for (const e of evs) {
    const t = i.board.tasks.find(x => x.id === e.task_id);
    line(`• ${new Date(e.created_at).toTimeString().slice(0, 5)} · ${t?.title || 'Tarefa'} — ${e.kind === 'etapa' ? 'etapa concluída' : 'tarefa concluída'}`, 10);
  }
  gap(3);
  // ajuda e conversas
  const helps = i.board.help.filter(h => h.to_user === i.me.user_id && h.status === 'aceita');
  const msgs = i.board.messages.filter(m => new Date(m.created_at).toLocaleDateString('sv-SE') === i.day);
  const sent = msgs.filter(m => m.from_user === i.me.user_id);
  line('Colaboração', 12, true); gap(1);
  line(`Mensagens: ${sent.length} enviadas, ${msgs.length - sent.length} recebidas${sent.some(m => m.flagged) ? ` · ${sent.filter(m => m.flagged).length} sinalizadas como fora do assunto` : ''}.`, 10);
  if (helps.length) line(`Ajudas em andamento ou concluídas: ${helps.length}.`, 10);
  // rodapé
  doc.setFontSize(8); doc.setTextColor(140, 146, 170);
  doc.text(`Gerado pelo Sala 8-bit em ${new Date().toLocaleString('pt-BR')}`, M, 290);
  return doc.output('blob');
}
