-- Sala 8-bit · versão 0.4: Mural da Glória, painel do dia, relatório, SABADÃO e Instagram

-- ---------------------------------------------------------------- tempo de tarefa por dia
create table if not exists public.task_time_log (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  day          date not null,
  seconds      int not null default 0,
  primary key (task_id, user_id, day)
);
create index if not exists time_log_ws_day on public.task_time_log(workspace_id, day);

-- dia local da empresa (fuso configurável; padrão São Paulo)
create or replace function public._local_day(p_ws uuid, p_ts timestamptz default now()) returns date
language sql stable security definer set search_path = public as $$
  select (p_ts at time zone coalesce((select settings->>'fuso' from workspaces where id = p_ws), 'America/Sao_Paulo'))::date
$$;

-- O relógio agora também registra quanto tempo cada pessoa trabalhou em cada tarefa, por dia.
create or replace function public._clock_stop(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks; secs int;
begin
  select * into t from tasks where id = p_task and running_since is not null for update;
  if not found then return; end if;
  secs := greatest(0, extract(epoch from now() - t.running_since))::int;
  update tasks set spent_sec = spent_sec + secs, phase_spent_sec = phase_spent_sec + secs, running_since = null, updated_at = now() where id = t.id;
  if t.owner is not null and secs > 0 then
    insert into task_time_log(workspace_id, user_id, task_id, day, seconds)
    values (t.workspace_id, t.owner, t.id, public._local_day(t.workspace_id, t.running_since), secs)
    on conflict (task_id, user_id, day) do update set seconds = task_time_log.seconds + excluded.seconds;
  end if;
end $$;

-- ---------------------------------------------------------------- SABADÃO
create table if not exists public.saturday_shifts (
  workspace_id uuid not null,
  user_id      uuid not null,
  day          date not null check (extract(dow from day) = 6),
  works        boolean not null,
  set_by       uuid,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id, day),
  foreign key (workspace_id, user_id) references public.members(workspace_id, user_id) on delete cascade
);

-- Marca quem trabalha no sábado. Quem folga tem as entregas daquele sábado levadas para segunda.
create or replace function public.set_saturday(p_ws uuid, p_user uuid, p_day date, p_works boolean) returns int
language plpgsql security definer set search_path = public as $$
declare moved int := 0; t record;
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  if p_user <> auth.uid() and not public.is_admin(p_ws) then raise exception 'Só o administrador marca o sábado dos outros.' using errcode = '42501'; end if;
  if not public._is_membro(p_ws, p_user) then raise exception 'Essa pessoa não está na equipe.' using errcode = '22023'; end if;
  if extract(dow from p_day) <> 6 then raise exception 'Escolha um sábado.' using errcode = '22023'; end if;
  insert into saturday_shifts(workspace_id, user_id, day, works, set_by) values (p_ws, p_user, p_day, p_works, auth.uid())
    on conflict (workspace_id, user_id, day) do update set works = excluded.works, set_by = excluded.set_by, updated_at = now();
  if not p_works then
    for t in select id from tasks where workspace_id = p_ws and due_date = p_day and col <> 'feito'
             and (owner = p_user or (owner is null and dir_to = p_user)) loop
      update tasks set due_date = p_day + 2, updated_at = now() where id = t.id;
      perform public._event(t.id, p_ws, auth.uid(), 'prazo', 'Folga no sábado: entrega passou para segunda');
      moved := moved + 1;
    end loop;
  end if;
  return moved;
end $$;

-- ---------------------------------------------------------------- Instagram
create table if not exists public.instagram_stats (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  handle       text,
  followers    int not null default 0 check (followers >= 0),
  source       text not null default 'manual' check (source in ('manual', 'api')),
  updated_at   timestamptz not null default now()
);

create or replace function public.set_instagram(p_ws uuid, p_handle text, p_followers int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_ws) then raise exception 'Só o administrador atualiza o Instagram.' using errcode = '42501'; end if;
  insert into instagram_stats(workspace_id, handle, followers, source) values (p_ws, nullif(btrim(p_handle), ''), greatest(0, p_followers), 'manual')
    on conflict (workspace_id) do update set handle = excluded.handle, followers = excluded.followers, source = 'manual', updated_at = now();
end $$;

-- ---------------------------------------------------------------- Mural da Glória
-- Pontos do mês por pessoa. O título é decidido no navegador com a regra "um título por pessoa".
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
    (select coalesce(sum(l.seconds), 0)::int / 60 from task_time_log l where l.workspace_id = p_ws and l.user_id = m.user_id and l.day >= d0 and l.day < d1),
    0
  from members m where m.workspace_id = p_ws and m.kind = 'membro' and m.consent_at is not null;
end $$;

-- ---------------------------------------------------------------- painel do dia / relatório
create or replace function public.day_summary(p_ws uuid, p_day date)
returns table (user_id uuid, tarefa_min int, reuniao_min int, cafe_min int, almoco_min int, entregas int, ajudas int, primeira_entrada timestamptz)
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
    (select min(s2.since) from statuses s2 where s2.workspace_id = p_ws and s2.user_id = m.user_id)
  from members m where m.workspace_id = p_ws and m.consent_at is not null;
end $$;

-- ---------------------------------------------------------------- RLS e permissões
alter table public.task_time_log   enable row level security;
alter table public.saturday_shifts enable row level security;
alter table public.instagram_stats enable row level security;
drop policy if exists sel on public.task_time_log;
create policy sel on public.task_time_log for select to authenticated using (public.is_member(workspace_id));
drop policy if exists sel on public.saturday_shifts;
create policy sel on public.saturday_shifts for select to authenticated using (public.is_member(workspace_id));
drop policy if exists sel on public.instagram_stats;
create policy sel on public.instagram_stats for select to authenticated using (public.is_member(workspace_id));

do $$ declare f text; begin
  foreach f in array array['set_saturday(uuid, uuid, date, boolean)', 'set_instagram(uuid, text, int)', 'glory_scores(uuid, date)', 'day_summary(uuid, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public._local_day(uuid, timestamptz) from public, anon, authenticated;
  revoke all on function public._clock_stop(uuid) from public, anon, authenticated;
end $$;

do $$ declare t text; begin
  foreach t in array array['saturday_shifts', 'instagram_stats'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when undefined_object or duplicate_object then null; end;
  end loop;
end $$;

-- Sábado só recebe entregas se o SABADÃO estiver ligado nas regras da empresa.
create or replace function public.tasks_due_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if extract(dow from new.due_date) = 6 and (tg_op = 'INSERT' or new.due_date is distinct from old.due_date)
     and not coalesce((select (settings->'recursos'->>'sabadao')::boolean from workspaces where id = new.workspace_id), false) then
    raise exception 'Esta equipe não trabalha aos sábados.' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists tasks_due_check on public.tasks;
create trigger tasks_due_check before insert or update of due_date on public.tasks for each row execute function public.tasks_due_check();
