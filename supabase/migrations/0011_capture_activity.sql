-- Raw inactivity is separate from task state and visual character movement.
alter table public.statuses add column if not exists idle_seconds integer check (idle_seconds between 0 and 604800);

create or replace function public._capture_in_progress(p_ws uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from statuses s join tasks t on t.id=s.active_task_id and t.workspace_id=s.workspace_id
    where s.workspace_id=p_ws and s.user_id=p_user and s.state='trabalhando'
      and t.owner=p_user and t.col='fazendo' and t.etapa='captacao');
$$;
revoke all on function public._capture_in_progress(uuid,uuid) from public,anon,authenticated;

create or replace function public._active_ai_not_idle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agents>0 or (new.state='trabalhando' and exists(select 1 from tasks t
      where t.id=new.active_task_id and t.workspace_id=new.workspace_id and t.owner=new.user_id and t.col='fazendo' and t.etapa='captacao')) then
    new.idle:=false;
  end if;
  return new;
end $$;

create or replace function public.agent_live(p_token text, p_live jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.agent_tokens; st public.statuses; capture boolean; seconds integer;
begin
  t:=public._agent(p_token);
  select * into st from statuses where workspace_id=t.workspace_id and user_id=t.user_id;
  capture:=public._capture_in_progress(t.workspace_id,t.user_id);
  seconds:=case when p_live ? 'idle_seconds' then least(604800,greatest(0,(p_live->>'idle_seconds')::integer)) else null end;
  update statuses set
    app_now=left(coalesce(p_live->>'app','—'),60),
    app_cat=case when capture and p_live->>'cat'='idle' then 'prod' when p_live->>'cat' in ('prod','ref','com','dis','idle','ia') then p_live->>'cat' else 'idle' end,
    music=st.state<>'encerrado' and coalesce((p_live->>'music')::boolean,false),
    agents=case when st.state='encerrado' then 0 else least(20,greatest(0,coalesce((p_live->>'agents')::int,0))) end,
    idle=not capture and case when seconds is null then coalesce((p_live->>'idle')::boolean,false) else seconds>=300 end,
    idle_seconds=seconds,agent_seen_at=now(),agent_live_at=now()
  where workspace_id=t.workspace_id and user_id=t.user_id;
  update agent_tokens set last_seen_at=now() where id=t.id;
  return jsonb_build_object('ok',true,'estado',st.state,'capturing',capture);
end $$;
revoke all on function public.agent_live(text,jsonb) from public;
grant execute on function public.agent_live(text,jsonb) to anon,authenticated;

-- Older desktop versions may still send idle minutes during an active shoot.
-- Do not rewrite an earlier queued minute from before that capture phase began.
create or replace function public._capture_minute() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category='idle' and exists(select 1 from statuses s join tasks t on t.id=s.active_task_id
    and t.workspace_id=s.workspace_id where s.workspace_id=new.workspace_id and s.user_id=new.user_id
    and s.state='trabalhando' and t.owner=new.user_id and t.col='fazendo' and t.etapa='captacao'
    and t.running_since<new.minute+interval '1 minute') then
    new.category:='prod';new.productive_weight:=1;new.base_weight:=1;new.ia_fraction:=0;
  end if;
  return new;
end $$;
revoke all on function public._capture_minute() from public,anon,authenticated;
drop trigger if exists capture_minute on public.activity_minutes;
create trigger capture_minute before insert or update on public.activity_minutes for each row execute function public._capture_minute();
update statuses set idle=false where idle and public._capture_in_progress(workspace_id,user_id);
