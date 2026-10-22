-- Explicit off-computer work started from the studio or brainstorm table.
alter table public.statuses add column if not exists room_activity text check (room_activity in ('desk','recording','brainstorm'));
alter table public.statuses add column if not exists room_activity_since timestamptz;
alter table public.statuses add column if not exists room_resume_task_id uuid references public.tasks(id) on delete set null;
create table if not exists public.room_activity_sessions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('recording','brainstorm')), started_at timestamptz not null default now(), ended_at timestamptz
);
create index if not exists room_activity_history on public.room_activity_sessions(workspace_id,user_id,started_at);
create unique index if not exists room_activity_open on public.room_activity_sessions(workspace_id,user_id) where ended_at is null;
alter table public.room_activity_sessions enable row level security;
create policy room_activity_read on public.room_activity_sessions for select to authenticated using (public.is_member(workspace_id));
grant select on public.room_activity_sessions to authenticated;

create or replace function public._room_activity_guard() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.state<>'trabalhando' or (new.active_task_id is distinct from old.active_task_id and new.room_activity is not distinct from old.room_activity and new.room_activity_since is not distinct from old.room_activity_since) then
    new.room_activity:=null; new.room_activity_since:=null; new.room_resume_task_id:=null;
  end if;
  if new.room_activity in ('recording','brainstorm') then new.idle:=false; end if;
  return new;
end $$;
create trigger room_activity_guard before update on public.statuses for each row execute function public._room_activity_guard();
create or replace function public._room_activity_log() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.room_activity is distinct from old.room_activity or new.state is distinct from old.state then
    update room_activity_sessions set ended_at=now() where workspace_id=new.workspace_id and user_id=new.user_id and ended_at is null;
    if new.state='trabalhando' and new.room_activity in ('recording','brainstorm') then
      insert into room_activity_sessions(workspace_id,user_id,kind) values(new.workspace_id,new.user_id,new.room_activity);
    end if;
  end if;
  return new;
end $$;
create trigger room_activity_log after update on public.statuses for each row execute function public._room_activity_log();

create or replace function public.set_room_activity(p_ws uuid,p_activity text,p_task uuid default null) returns public.statuses
language plpgsql security definer set search_path=public as $$
declare st public.statuses; task public.tasks; resume uuid;
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode='42501'; end if;
  if p_activity is null or p_activity not in ('desk','recording','brainstorm') then raise exception 'Atividade inválida.' using errcode='22023'; end if;
  select * into st from statuses where workspace_id=p_ws and user_id=auth.uid() for update;
  if st.state in ('fora','encerrado') then raise exception 'Volte ao trabalho antes de iniciar uma atividade.'; end if;
  if st.room_activity=p_activity and p_task is not distinct from st.active_task_id then return st; end if;
  resume:=coalesce(st.room_resume_task_id,st.active_task_id);
  if st.state<>'trabalhando' then perform public.set_state(p_ws,'trabalhando',public._local_day(p_ws),st.device); end if;
  if p_activity='recording' then
    if p_task is null and exists(select 1 from tasks where id=st.active_task_id and etapa='captacao' and col='fazendo' and owner=auth.uid()) then p_task:=st.active_task_id; end if;
    if p_task is not null then
      select * into task from tasks where id=p_task and workspace_id=p_ws;
      if not found or task.etapa is distinct from 'captacao' or task.col='feito' then raise exception 'Escolha uma demanda na etapa Captação.'; end if;
      if task.col='afazer' then perform public.start_task(p_task);
      elsif task.owner is distinct from auth.uid() then raise exception 'Essa captação está com outra pessoa.' using errcode='42501'; end if;
    end if;
    if resume=p_task then resume:=null; end if;
  elsif p_activity='brainstorm' then p_task:=null;
  else
    p_task:=st.room_resume_task_id;
    if p_task is not null and not exists(select 1 from tasks where id=p_task and workspace_id=p_ws and owner=auth.uid() and col='fazendo' and etapa is distinct from 'captacao') then p_task:=null; end if;
    -- Clicking the desk also pauses capture started from the task board.
    if st.room_activity not in ('recording','brainstorm') or st.room_activity is null then
      p_task:=st.active_task_id;
      if exists(select 1 from tasks where id=p_task and etapa='captacao') then p_task:=null; end if;
    end if;
    resume:=null;
  end if;
  update statuses set room_activity=p_activity,room_activity_since=now(),room_resume_task_id=resume,
    active_task_id=p_task,updated_at=now() where workspace_id=p_ws and user_id=auth.uid() returning * into st;
  return st;
end $$;
revoke all on function public.set_room_activity(uuid,text,uuid) from public,anon;
grant execute on function public.set_room_activity(uuid,text,uuid) to authenticated;
revoke all on function public._room_activity_guard(),public._room_activity_log() from public,anon,authenticated;

-- The desktop already uses this answer to suspend keyboard/mouse idle detection.
create or replace function public._capture_in_progress(p_ws uuid,p_user uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from statuses s where s.workspace_id=p_ws and s.user_id=p_user and s.state='trabalhando' and
    (s.room_activity in ('recording','brainstorm') or (s.room_activity is null and exists(select 1 from tasks t
      where t.id=s.active_task_id and t.workspace_id=p_ws and t.owner=p_user and t.col='fazendo' and t.etapa='captacao'))));
$$;
create or replace function public._active_ai_not_idle() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.agents>0 or (new.state='trabalhando' and (new.room_activity in ('recording','brainstorm') or
    (new.room_activity is null and exists(select 1 from tasks t where t.id=new.active_task_id and t.workspace_id=new.workspace_id
      and t.owner=new.user_id and t.col='fazendo' and t.etapa='captacao')))) then new.idle:=false; end if;
  return new;
end $$;

-- Classify queued samples by the activity's original interval, not the upload time.
create or replace function public._capture_minute() returns trigger
language plpgsql security definer set search_path=public as $$
declare activity text;
begin
  select s.kind into activity from room_activity_sessions s where s.workspace_id=new.workspace_id and s.user_id=new.user_id
    and s.started_at<new.minute+interval '1 minute' and coalesce(s.ended_at,'infinity')>new.minute order by s.started_at desc limit 1;
  if activity is not null then
    new.category:='prod'; new.app:=case activity when 'recording' then 'Gravando' else 'Brainstorm' end;
    new.productive_weight:=greatest(1,coalesce(new.productive_weight,public._prod_weight('prod',new.agents)));new.base_weight:=1;
  elsif new.category='idle' and public._capture_in_progress(new.workspace_id,new.user_id) and exists(select 1 from tasks t
    join statuses s on s.active_task_id=t.id where s.workspace_id=new.workspace_id and s.user_id=new.user_id
    and s.room_activity is null and t.running_since<new.minute+interval '1 minute') then
    new.category:='prod';new.productive_weight:=1;new.base_weight:=1;new.ia_fraction:=0;
  end if;
  return new;
end $$;
