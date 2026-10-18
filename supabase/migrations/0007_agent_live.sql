-- Current indicators are separate from historical minute aggregates.
alter table public.statuses add column if not exists agent_live_at timestamptz;
create or replace function public.agent_live(p_token text, p_live jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.agent_tokens; st public.statuses;
begin
  t := public._agent(p_token);
  select * into st from statuses where workspace_id = t.workspace_id and user_id = t.user_id;
  update statuses set
    app_now = left(coalesce(p_live->>'app', '—'), 60),
    app_cat = case when p_live->>'cat' in ('prod','ref','com','dis','idle','ia') then p_live->>'cat' else 'idle' end,
    music = st.state <> 'encerrado' and coalesce((p_live->>'music')::boolean, false),
    agents = case when st.state = 'encerrado' then 0 else least(20, greatest(0, coalesce((p_live->>'agents')::int, 0))) end,
    idle = coalesce((p_live->>'idle')::boolean, false),
    agent_seen_at = now(), agent_live_at = now()
  where workspace_id = t.workspace_id and user_id = t.user_id;
  update agent_tokens set last_seen_at = now() where id = t.id;
  return jsonb_build_object('ok', true, 'estado', st.state);
end $$;
revoke all on function public.agent_live(text,jsonb) from public;
grant execute on function public.agent_live(text,jsonb) to anon, authenticated;
