-- Sala 8-bit · versão 0.5: app de computador (Windows e macOS)
-- O app manda, a cada minuto, só: nome do app em foco (navegador vira "Navegando na internet"),
-- a categoria calculada no computador, se há música tocando, quantos agentes de IA estão rodando
-- e se a pessoa está sem mexer no teclado/mouse. Nunca: endereços, títulos de janelas, telas ou teclas.

-- ---------------------------------------------------------------- tabelas
create table if not exists public.agent_tokens (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id      uuid not null,
  token_hash   text not null unique,
  device_name  text,
  platform     text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked      boolean not null default false,
  foreign key (workspace_id, user_id) references public.members(workspace_id, user_id) on delete cascade
);

create table if not exists public.activity_minutes (
  workspace_id uuid not null,
  user_id      uuid not null,
  minute       timestamptz not null,
  day          date not null,
  app          text not null check (char_length(app) <= 60),
  category     text not null check (category in ('prod', 'ref', 'com', 'dis', 'idle', 'ia', 'meet', 'gestor', 'pausa')),
  agents       int not null default 0 check (agents between 0 and 20),
  music        boolean not null default false,
  primary key (workspace_id, user_id, minute),
  foreign key (workspace_id, user_id) references public.members(workspace_id, user_id) on delete cascade
);
create index if not exists activity_ws_day on public.activity_minutes(workspace_id, day);

alter table public.statuses add column if not exists app_now text;
alter table public.statuses add column if not exists app_cat text;
alter table public.statuses add column if not exists music boolean not null default false;
alter table public.statuses add column if not exists agents int not null default 0;
alter table public.statuses add column if not exists idle boolean not null default false;
alter table public.statuses add column if not exists agent_seen_at timestamptz;

-- listas padrão para classificar páginas no computador (editáveis em Configurações → Regras)
update public.workspaces set settings = settings
  || jsonb_build_object('sites_trabalho', coalesce(settings->'sites_trabalho', '["Meta Business","Gerenciador de Anúncios","Google Ads","Analytics","Looker Studio","Canva","Figma","Notion","ClickUp","Trello","Google Drive","Google Docs","Planilhas","Search Console","mLabs","RD Station","HubSpot"]'::jsonb))
  || jsonb_build_object('sites_referencia', coalesce(settings->'sites_referencia', '["Pinterest","Behance","Dribbble","YouTube","Google Imagens","Google Images","Instagram","TikTok","Freepik","Envato"]'::jsonb))
  || jsonb_build_object('sites_email', coalesce(settings->'sites_email', '["Gmail","Outlook","E-mail","Caixa de entrada","Inbox"]'::jsonb))
where not (settings ? 'sites_trabalho');
alter table public.workspaces alter column settings set default jsonb_build_object(
  'rotulo_linha', 'Linha',
  'recursos', jsonb_build_object('sabadao', true, 'datas_comemorativas', true, 'mural_gloria', true, 'instagram', false),
  'cafe_min', 15, 'almoco', jsonb_build_object('de', '11:00', 'ate', '13:00'), 'ociosidade_min', 5,
  'apps_ia', jsonb_build_array('ChatGPT', 'Claude', 'Gemini', 'Copilot'),
  'apps_comunicacao', jsonb_build_array('Slack', 'WhatsApp', 'Outlook', 'Microsoft Teams', 'Google Chat'),
  'palavras_fora_do_assunto', jsonb_build_array('futebol', 'jogo de ontem', 'novela', 'bbb', 'fofoca', 'balada', 'churrasco', 'cerveja', 'netflix'),
  'sites_trabalho', '["Meta Business","Gerenciador de Anúncios","Google Ads","Analytics","Looker Studio","Canva","Figma","Notion","ClickUp","Trello","Google Drive","Google Docs","Planilhas","Search Console","mLabs","RD Station","HubSpot"]'::jsonb,
  'sites_referencia', '["Pinterest","Behance","Dribbble","YouTube","Google Imagens","Google Images","Instagram","TikTok","Freepik","Envato"]'::jsonb,
  'sites_email', '["Gmail","Outlook","E-mail","Caixa de entrada","Inbox"]'::jsonb
);

-- ---------------------------------------------------------------- pareamento
create or replace function public._token_hash(p_token text) returns text
language sql immutable as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

-- O site, aberto dentro do app de computador, gera o código do aparelho automaticamente.
create or replace function public.create_agent_token(p_ws uuid, p_device text, p_platform text) returns text
language plpgsql security definer set search_path = public as $$
declare tok text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public._is_membro(p_ws, auth.uid()) then raise exception 'Só membros da equipe usam o app de computador.' using errcode = '42501'; end if;
  update agent_tokens set revoked = true where workspace_id = p_ws and user_id = auth.uid() and device_name = left(btrim(p_device), 60) and not revoked;
  insert into agent_tokens(workspace_id, user_id, token_hash, device_name, platform)
  values (p_ws, auth.uid(), public._token_hash(tok), left(btrim(p_device), 60), left(btrim(p_platform), 20));
  return tok;
end $$;

create or replace function public.revoke_agent_token(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.agent_tokens;
begin
  select * into t from agent_tokens where id = p_id;
  if not found then return; end if;
  if t.user_id <> auth.uid() and not public.is_admin(t.workspace_id) then raise exception 'Você não tem permissão para isso.' using errcode = '42501'; end if;
  update agent_tokens set revoked = true where id = p_id;
end $$;

create or replace function public._agent(p_token text) returns public.agent_tokens
language plpgsql security definer set search_path = public as $$
declare t public.agent_tokens;
begin
  select * into t from agent_tokens where token_hash = public._token_hash(coalesce(p_token, '')) and not revoked;
  if not found then raise exception 'Aparelho não autorizado. Entre de novo no app.' using errcode = '28000'; end if;
  return t;
end $$;

-- O que o app precisa saber para classificar o tempo (apps das funções da pessoa, sites, ociosidade).
create or replace function public.agent_config(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.agent_tokens; m public.members; w public.workspaces; apps jsonb;
begin
  t := public._agent(p_token);
  select * into m from members where workspace_id = t.workspace_id and user_id = t.user_id;
  select * into w from workspaces where id = t.workspace_id;
  select coalesce(jsonb_agg(distinct a), '[]'::jsonb) into apps
    from catalog_items c, jsonb_array_elements_text(coalesce(c.meta->'apps', '[]'::jsonb)) a
   where c.workspace_id = t.workspace_id and c.kind = 'funcao' and c.active and c.name = any(array[m.main_role] || m.adj_roles);
  update agent_tokens set last_seen_at = now() where id = t.id;
  return jsonb_build_object(
    'workspace', w.name, 'nome', m.display_name, 'funcoes', array[m.main_role] || m.adj_roles,
    'apps_trabalho', apps, 'apps_ia', w.settings->'apps_ia', 'apps_comunicacao', w.settings->'apps_comunicacao',
    'sites_trabalho', coalesce(w.settings->'sites_trabalho', '[]'::jsonb), 'sites_referencia', coalesce(w.settings->'sites_referencia', '[]'::jsonb),
    'sites_email', coalesce(w.settings->'sites_email', '[]'::jsonb),
    'ociosidade_min', coalesce((w.settings->>'ociosidade_min')::int, 5), 'pasta_relatorios', m.report_folder, 'jornada', m.schedule);
end $$;

-- Recebe os minutos medidos pelo app. Reuniões, pausas e "pausa do gestor" vêm do status da sala.
create or replace function public.agent_report(p_token text, p_minutes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.agent_tokens; st public.statuses; e jsonb; mi timestamptz; cat text; last jsonb; n int := 0;
begin
  t := public._agent(p_token);
  select * into st from statuses where workspace_id = t.workspace_id and user_id = t.user_id;
  if st.state = 'encerrado' and public._local_day(t.workspace_id, st.since) = public._local_day(t.workspace_id) then
    update agent_tokens set last_seen_at = now() where id = t.id;
    return jsonb_build_object('ok', true, 'estado', 'encerrado', 'gravados', 0);
  end if;
  -- abrir o app no computador é entrar no escritório
  if st.state in ('fora', 'encerrado') then
    update statuses set state = 'trabalhando', since = now(), device = 'computador', updated_at = now() where workspace_id = t.workspace_id and user_id = t.user_id;
    st.state := 'trabalhando';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_minutes, '[]'::jsonb)) loop
    mi := date_trunc('minute', (e->>'m')::timestamptz);
    if mi > now() + interval '2 minutes' or mi < now() - interval '24 hours' then continue; end if;
    cat := e->>'cat';
    if cat not in ('prod', 'ref', 'com', 'dis', 'idle', 'ia') then cat := 'dis'; end if;
    if st.state = 'reuniao' then cat := 'meet';
    elsif st.state = 'pausa_gestor' then cat := 'gestor';
    elsif st.state in ('cafe', 'almoco') then cat := 'pausa'; end if;
    insert into activity_minutes(workspace_id, user_id, minute, day, app, category, agents, music)
    values (t.workspace_id, t.user_id, mi, public._local_day(t.workspace_id, mi), left(coalesce(e->>'app', '—'), 60), cat,
            least(20, greatest(0, coalesce((e->>'agents')::int, 0))), coalesce((e->>'music')::boolean, false))
    on conflict (workspace_id, user_id, minute) do update set app = excluded.app, category = excluded.category, agents = excluded.agents, music = excluded.music;
    last := e; n := n + 1;
  end loop;
  if last is not null then
    update statuses set app_now = left(coalesce(last->>'app', '—'), 60), app_cat = last->>'cat', music = coalesce((last->>'music')::boolean, false),
      agents = least(20, greatest(0, coalesce((last->>'agents')::int, 0))), idle = (last->>'cat') in ('idle', 'ia'), agent_seen_at = now()
     where workspace_id = t.workspace_id and user_id = t.user_id;
  else
    update statuses set agent_seen_at = now() where workspace_id = t.workspace_id and user_id = t.user_id;
  end if;
  update agent_tokens set last_seen_at = now() where id = t.id;
  return jsonb_build_object('ok', true, 'estado', st.state, 'gravados', n);
end $$;

-- ---------------------------------------------------------------- tempo produtivo
-- Produtivo = apps das funções + referência criativa + IA trabalhando sozinha + reunião + pausa do gestor.
-- Com 2 ou mais agentes de IA rodando, cada agente extra soma +0,5× no minuto produtivo.
create or replace function public._prod_weight(p_cat text, p_agents int) returns numeric
language sql immutable as $$
  select case
    when p_cat in ('prod', 'ia') then case when p_agents >= 2 then 1 + 0.5 * (p_agents - 1) else 1 end
    when p_cat in ('ref', 'meet', 'gestor') then 1
    else 0 end
$$;

create or replace function public.glory_scores(p_ws uuid, p_month date)
returns table (user_id uuid, ajudas int, entregas int, tarefa_min int, ia_min int)
language plpgsql stable security definer set search_path = public as $$
declare d0 date := date_trunc('month', p_month)::date; d1 date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  return query
  select m.user_id,
    (select count(*)::int from task_help h where h.workspace_id = p_ws and h.to_user = m.user_id and h.status = 'aceita'
       and public._local_day(p_ws, h.answered_at) >= d0 and public._local_day(p_ws, h.answered_at) < d1),
    (select count(*)::int from task_events e where e.workspace_id = p_ws and e.actor = m.user_id and e.kind in ('concluiu', 'etapa')
       and public._local_day(p_ws, e.created_at) >= d0 and public._local_day(p_ws, e.created_at) < d1),
    -- com o app: tempo produtivo ponderado; sem o app: tempo nas tarefas do quadro
    coalesce(
      (select round(sum(public._prod_weight(a.category, a.agents)))::int from activity_minutes a
        where a.workspace_id = p_ws and a.user_id = m.user_id and a.day >= d0 and a.day < d1 having count(*) > 0),
      (select coalesce(sum(l.seconds), 0)::int / 60 from task_time_log l where l.workspace_id = p_ws and l.user_id = m.user_id and l.day >= d0 and l.day < d1)),
    (select count(*)::int from activity_minutes a where a.workspace_id = p_ws and a.user_id = m.user_id and a.day >= d0 and a.day < d1 and a.agents > 0)
  from members m where m.workspace_id = p_ws and m.kind = 'membro' and m.consent_at is not null;
end $$;

drop function if exists public.day_summary(uuid, date);
create or replace function public.day_summary(p_ws uuid, p_day date)
returns table (user_id uuid, tarefa_min int, reuniao_min int, cafe_min int, almoco_min int, entregas int, ajudas int, primeira_entrada timestamptz,
               rastreado_min int, produtivo_min int, ref_min int, com_min int, dis_min int, ocioso_min int, ia_min int, bonus_ia_min int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  return query
  select m.user_id,
    (select coalesce(sum(l.seconds), 0)::int / 60 from task_time_log l where l.workspace_id = p_ws and l.user_id = m.user_id and l.day = p_day)
      + coalesce((select (extract(epoch from now() - t.running_since) / 60)::int from tasks t join statuses s on s.active_task_id = t.id
                  where s.workspace_id = p_ws and s.user_id = m.user_id and t.running_since is not null and public._local_day(p_ws, t.running_since) = p_day), 0),
    (select coalesce(sum(extract(epoch from coalesce(mm.left_at, now()) - mm.joined_at)), 0)::int / 60 from meeting_members mm
       where mm.workspace_id = p_ws and mm.user_id = m.user_id and public._local_day(p_ws, mm.joined_at) = p_day),
    (select coalesce(sum(extract(epoch from coalesce(pa.ended_at, now()) - pa.started_at)), 0)::int / 60 from pauses pa
       where pa.workspace_id = p_ws and pa.user_id = m.user_id and pa.day = p_day and pa.kind = 'cafe'),
    (select coalesce(sum(extract(epoch from coalesce(pa.ended_at, now()) - pa.started_at)), 0)::int / 60 from pauses pa
       where pa.workspace_id = p_ws and pa.user_id = m.user_id and pa.day = p_day and pa.kind = 'almoco'),
    (select count(*)::int from task_events e where e.workspace_id = p_ws and e.actor = m.user_id and e.kind in ('concluiu', 'etapa') and public._local_day(p_ws, e.created_at) = p_day),
    (select count(*)::int from task_help h where h.workspace_id = p_ws and h.to_user = m.user_id and h.status = 'aceita' and public._local_day(p_ws, h.answered_at) = p_day),
    (select min(s2.since) from statuses s2 where s2.workspace_id = p_ws and s2.user_id = m.user_id),
    a.total, a.prod, a.ref, a.com, a.dis, a.idle, a.ia, a.bonus
  from members m
  left join lateral (
    select count(*)::int total,
      round(coalesce(sum(public._prod_weight(x.category, x.agents)), 0))::int prod,
      count(*) filter (where x.category = 'ref')::int ref, count(*) filter (where x.category = 'com')::int com,
      count(*) filter (where x.category = 'dis')::int dis, count(*) filter (where x.category = 'idle')::int idle,
      count(*) filter (where x.agents > 0)::int ia,
      round(coalesce(sum(public._prod_weight(x.category, x.agents)) - count(*) filter (where x.category in ('prod', 'ia', 'ref', 'meet', 'gestor')), 0))::int bonus
    from activity_minutes x where x.workspace_id = p_ws and x.user_id = m.user_id and x.day = p_day
  ) a on true
  where m.workspace_id = p_ws and m.consent_at is not null;
end $$;

-- Apps mais usados no dia: a própria pessoa vê os dela; gestor e administrador veem de todos.
create or replace function public.day_apps(p_ws uuid, p_user uuid, p_day date)
returns table (app text, category text, minutes int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  if p_user <> auth.uid() and not public.is_admin(p_ws)
     and not exists (select 1 from members where workspace_id = p_ws and user_id = auth.uid() and kind = 'gestor') then
    raise exception 'Cada pessoa vê só os próprios apps.' using errcode = '42501';
  end if;
  return query select a.app, a.category, count(*)::int from activity_minutes a
    where a.workspace_id = p_ws and a.user_id = p_user and a.day = p_day group by a.app, a.category order by count(*) desc limit 30;
end $$;

-- ---------------------------------------------------------------- RLS e permissões
alter table public.agent_tokens     enable row level security;
alter table public.activity_minutes enable row level security;
drop policy if exists sel on public.agent_tokens;
create policy sel on public.agent_tokens for select to authenticated using (user_id = auth.uid() or public.is_admin(workspace_id));
drop policy if exists sel on public.activity_minutes;
create policy sel on public.activity_minutes for select to authenticated using (user_id = auth.uid());

do $$ declare f text; begin
  foreach f in array array['create_agent_token(uuid, text, text)', 'revoke_agent_token(uuid)', 'day_summary(uuid, date)', 'day_apps(uuid, uuid, date)', 'glory_scores(uuid, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- o app de computador chama sem login (o código do aparelho é a autorização)
  foreach f in array array['agent_config(text)', 'agent_report(text, jsonb)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  revoke all on function public._agent(text) from public, anon, authenticated;
end $$;

do $$ begin alter publication supabase_realtime add table public.agent_tokens; exception when undefined_object or duplicate_object then null; end $$;
