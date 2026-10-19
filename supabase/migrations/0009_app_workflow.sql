-- Preserve completion identity even after the task advances to another stage.
alter table public.task_events add column if not exists completed_stage text
  check (completed_stage in ('roteiro','captacao','edicao','finalizacao'));

create or replace function public._completed_stage() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.completed_stage is not null then return new; end if;
  if new.kind='etapa' then
    new.completed_stage := case
      when new.text like '%passou para captacao' then 'roteiro'
      when new.text like '%passou para edicao' then 'captacao'
      when new.text like '%passou para finalizacao' then 'edicao'
      else null end;
  elsif new.kind='concluiu' then
    select etapa into new.completed_stage from tasks where id=new.task_id and workspace_id=new.workspace_id;
  end if;
  return new;
end $$;
revoke all on function public._completed_stage() from public,anon,authenticated;
drop trigger if exists task_event_completed_stage on public.task_events;
create trigger task_event_completed_stage before insert on public.task_events
for each row execute function public._completed_stage();
update public.task_events set completed_stage=case
  when text like '%passou para captacao' then 'roteiro'
  when text like '%passou para edicao' then 'captacao'
  when text like '%passou para finalizacao' then 'edicao'
  else null end where kind='etapa' and completed_stage is null;
update public.task_events e set completed_stage=t.etapa from public.tasks t
where e.task_id=t.id and e.workspace_id=t.workspace_id and e.kind='concluiu' and t.etapa='finalizacao' and e.completed_stage is null;

-- Rename only the standard role; preserve custom catalog IDs and user settings.
update public.catalog_items c set name='Video Maker'
where c.kind='funcao' and lower(c.name) in ('editor de vídeo','editor de video')
and not exists(select 1 from public.catalog_items other where other.workspace_id=c.workspace_id and other.kind='funcao' and other.name='Video Maker');
select set_config('sala.bypass','on',true);
update public.members set main_role='Video Maker' where lower(main_role) in ('editor de vídeo','editor de video');
update public.members m set adj_roles=array(select case when lower(role) in ('editor de vídeo','editor de video') then 'Video Maker' else role end from unnest(m.adj_roles) role)
where exists(select 1 from unnest(m.adj_roles) role where lower(role) in ('editor de vídeo','editor de video'));
select set_config('sala.bypass','off',true);
update public.catalog_items set meta=replace(replace(meta::text,'Editor de Vídeo','Video Maker'),'Editor de Video','Video Maker')::jsonb
where meta::text like '%Editor de Vídeo%' or meta::text like '%Editor de Video%';

-- Correct mistaken distraction rows; explicit lunch/coffee pauses remain untouched.
update public.activity_minutes set category='prod',base_weight=1,
  productive_weight=1+greatest(0,agents-1)*0.5
where category='dis' and lower(regexp_replace(app,'\.exe$','','i')) in
 ('windows shell experience host','shellexperiencehost','calculator','calculatorapp','calculadora','calc','capcut','windows explorer','explorer','file explorer','explorador de arquivos');

-- Fix the live idle flag sent by older clients while an AI execution is active.
create or replace function public._active_ai_not_idle() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.agents>0 then new.idle:=false; end if;
  return new;
end $$;
revoke all on function public._active_ai_not_idle() from public,anon,authenticated;
drop trigger if exists active_ai_not_idle on public.statuses;
create trigger active_ai_not_idle before insert or update on public.statuses
for each row execute function public._active_ai_not_idle();
update public.statuses set idle=false where agents>0 and idle;

create or replace function public.default_catalog() returns jsonb
language sql immutable as $$ select '{"funcoes":[{"nome":"Social Media","desc":"Posts, stories, comunidade","apps":["Canva","CapCut","mLabs"]},{"nome":"Designer","desc":"Peças, KV, identidade","apps":["Figma","Photoshop","Illustrator"]},{"nome":"Tráfego Pago","desc":"Campanhas Meta e Google","apps":["Excel","Looker Studio"]},{"nome":"Video Maker","desc":"Reels, YouTube, motion","apps":["Premiere Pro","After Effects","DaVinci Resolve"]},{"nome":"Copywriter","desc":"Textos, roteiros, e-mails","apps":["Word","Notion"]},{"nome":"Analista de SEO","desc":"Orgânico e conteúdo","apps":["Screaming Frog","Excel"]},{"nome":"Gestor de Projetos","desc":"Prazos, status, clientes","apps":["ClickUp","Excel","Notion"]},{"nome":"Atendimento","desc":"Relacionamento com clientes","apps":["WhatsApp Business","HubSpot"]}],"areas":[{"nome":"Vídeo","funcoes":["Video Maker"],"est":180,"fases":true,"tipos":[{"grupo":"Formatos","nome":"Institucional","est":240},{"grupo":"Formatos","nome":"Publicitário","est":240},{"grupo":"Formatos","nome":"Sazonal","est":null},{"grupo":"Formatos","nome":"UGC","est":null},{"grupo":"Formatos","nome":"Reunião","est":null},{"grupo":"Formatos","nome":"Depoimento","est":null},{"grupo":"Produto","nome":"Demonstração de produto","est":null},{"grupo":"Produto","nome":"Lançamento de produto","est":null},{"grupo":"Produto","nome":"Unboxing","est":null},{"grupo":"Produto","nome":"Comparativo","est":null},{"grupo":"Produto","nome":"Vídeo de embalagem e rótulo","est":null},{"grupo":"Produto","nome":"Packshot em vídeo","est":null},{"grupo":"Educativo","nome":"Tutorial / como usar","est":null},{"grupo":"Educativo","nome":"Dicas e curiosidades","est":null},{"grupo":"Educativo","nome":"Perguntas frequentes","est":null},{"grupo":"Bastidores e marca","nome":"Bastidores da produção","est":null},{"grupo":"Bastidores e marca","nome":"Making of","est":null},{"grupo":"Bastidores e marca","nome":"Cultura e equipe","est":null},{"grupo":"Bastidores e marca","nome":"Endomarketing","est":null},{"grupo":"Bastidores e marca","nome":"Evento e feira","est":null},{"grupo":"Vendas e varejo","nome":"Treinamento de vendas","est":null},{"grupo":"Vendas e varejo","nome":"Vídeo para PDV","est":null},{"grupo":"Vendas e varejo","nome":"Vídeo para marketplace","est":null},{"grupo":"Vendas e varejo","nome":"Vídeo para distribuidor","est":null},{"grupo":"Redes sociais","nome":"Reels / TikTok de tendência","est":null},{"grupo":"Redes sociais","nome":"Vídeo com influenciador","est":null},{"grupo":"Redes sociais","nome":"Live","est":null},{"grupo":"Redes sociais","nome":"ASMR / sensorial","est":null},{"grupo":"Redes sociais","nome":"Um dia na empresa","est":null},{"grupo":"Resultado e confiança","nome":"Case / cliente real","est":null},{"grupo":"Resultado e confiança","nome":"Prêmio e certificação","est":null}]},{"nome":"Design","funcoes":["Designer"],"est":90,"fases":false,"tipos":[{"grupo":"Rótulos","nome":"Criação de rótulo novo","est":240},{"grupo":"Rótulos","nome":"Atualização de rótulo","est":null},{"grupo":"Rótulos","nome":"Adequação legal / regulatória","est":150},{"grupo":"Rótulos","nome":"Variação de linha","est":null},{"grupo":"Rótulos","nome":"Arte-final para gráfica","est":120},{"grupo":"Rótulos","nome":"Prova e aprovação","est":null},{"grupo":"Rótulos","nome":"Mockup de rótulo","est":null},{"grupo":"Produto e embalagem","nome":"Embalagem","est":null},{"grupo":"Produto e embalagem","nome":"Mockup de produto","est":null},{"grupo":"Produto e embalagem","nome":"Fotos tratadas / packshot","est":null},{"grupo":"Produto e embalagem","nome":"Ficha técnica de produto","est":null},{"grupo":"Redes sociais","nome":"Post estático","est":50},{"grupo":"Redes sociais","nome":"Carrossel","est":75},{"grupo":"Redes sociais","nome":"Stories","est":40},{"grupo":"Redes sociais","nome":"Capa de Reels e destaques","est":null},{"grupo":"Redes sociais","nome":"Arte de data comemorativa","est":null},{"grupo":"Anúncios","nome":"Criativo para Meta Ads","est":null},{"grupo":"Anúncios","nome":"Banner Google Display","est":null},{"grupo":"Anúncios","nome":"Criativo para marketplace","est":null},{"grupo":"Site e e-commerce","nome":"Banner de site","est":null},{"grupo":"Site e e-commerce","nome":"Landing page","est":null},{"grupo":"Site e e-commerce","nome":"E-mail marketing","est":null},{"grupo":"Site e e-commerce","nome":"Imagens de produto para loja online","est":null},{"grupo":"PDV e impressos","nome":"Material de PDV","est":null},{"grupo":"PDV e impressos","nome":"Folder / catálogo","est":null},{"grupo":"PDV e impressos","nome":"Panfleto e flyer","est":null},{"grupo":"PDV e impressos","nome":"Tabela de preços","est":null},{"grupo":"Institucional e marca","nome":"Identidade visual","est":null},{"grupo":"Institucional e marca","nome":"Apresentação comercial","est":null},{"grupo":"Institucional e marca","nome":"Papelaria","est":null},{"grupo":"Institucional e marca","nome":"Endomarketing","est":null},{"grupo":"Institucional e marca","nome":"Material para feiras e eventos","est":null},{"grupo":"Apoio a outros setores","nome":"Arte para vídeo","est":null},{"grupo":"Apoio a outros setores","nome":"Material de treinamento","est":null}]},{"nome":"Social Media","funcoes":["Social Media"],"est":60,"fases":false,"tipos":[{"grupo":"Planejamento","nome":"Calendário editorial","est":120},{"grupo":"Planejamento","nome":"Planejamento de campanha","est":null},{"grupo":"Planejamento","nome":"Roteiro de conteúdo","est":null},{"grupo":"Publicação","nome":"Post de feed","est":null},{"grupo":"Publicação","nome":"Reels / TikTok","est":null},{"grupo":"Publicação","nome":"Stories","est":40},{"grupo":"Publicação","nome":"Legenda e hashtags","est":null},{"grupo":"Publicação","nome":"Agendamento","est":null},{"grupo":"Comunidade","nome":"Resposta a comentários e DMs","est":null},{"grupo":"Comunidade","nome":"Gestão de crise / reclamação","est":null},{"grupo":"Comunidade","nome":"Interação com seguidores","est":null},{"grupo":"Parcerias","nome":"Influenciadores","est":null},{"grupo":"Parcerias","nome":"Collab e publi","est":null},{"grupo":"Parcerias","nome":"Sorteio / concurso","est":null},{"grupo":"Análise","nome":"Relatório de redes sociais","est":null},{"grupo":"Análise","nome":"Pesquisa de tendências e concorrência","est":null}]},{"nome":"Tráfego Pago","funcoes":["Tráfego Pago"],"est":75,"fases":false,"tipos":[{"grupo":"Campanhas","nome":"Criação de campanha","est":null},{"grupo":"Campanhas","nome":"Campanha de marketplace","est":null},{"grupo":"Campanhas","nome":"Campanha sazonal","est":null},{"grupo":"Campanhas","nome":"Remarketing","est":null},{"grupo":"Públicos e estrutura","nome":"Criação de públicos","est":null},{"grupo":"Públicos e estrutura","nome":"Estrutura de conta","est":null},{"grupo":"Públicos e estrutura","nome":"Pixel e conversões","est":null},{"grupo":"Otimização","nome":"Otimização de campanha","est":null},{"grupo":"Otimização","nome":"Teste A/B","est":null},{"grupo":"Otimização","nome":"Briefing de criativos","est":null},{"grupo":"Análise","nome":"Relatório de desempenho","est":60},{"grupo":"Análise","nome":"Análise de funil","est":null},{"grupo":"Análise","nome":"Planejamento de verba","est":null}]},{"nome":"IA","funcoes":[],"est":45,"fases":false,"tipos":[]},{"nome":"Outra","funcoes":[],"est":60,"fases":false,"tipos":[]}]}'::jsonb $$;
