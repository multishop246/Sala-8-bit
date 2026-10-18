-- Optional fractions from five-second samples. NULL retains legacy app compatibility.
alter table public.activity_minutes add column if not exists productive_weight numeric check (productive_weight between 0 and 10.5);
alter table public.activity_minutes add column if not exists base_weight numeric check (base_weight between 0 and 1);
alter table public.activity_minutes add column if not exists ia_fraction numeric check (ia_fraction between 0 and 1);
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
    insert into activity_minutes(workspace_id, user_id, minute, day, app, category, agents, music, productive_weight, base_weight, ia_fraction)
    values (t.workspace_id, t.user_id, mi, public._local_day(t.workspace_id, mi), left(coalesce(e->>'app', '—'), 60), cat,
            least(20, greatest(0, coalesce((e->>'agents')::int, 0))), coalesce((e->>'music')::boolean, false),
            case when cat in ('meet','gestor') then 1 when cat='pausa' then 0 when not e ? 'productive_weight' then null else least(10.5,greatest(0,(e->>'productive_weight')::numeric)) end,
            case when cat in ('meet','gestor') then 1 when cat='pausa' then 0 when not e ? 'base_weight' then null else least(1,greatest(0,(e->>'base_weight')::numeric)) end,
            case when cat='pausa' then 0 when not e ? 'ia_fraction' then null else least(1,greatest(0,(e->>'ia_fraction')::numeric)) end)
    on conflict (workspace_id, user_id, minute) do update set app = excluded.app, category = excluded.category, agents = excluded.agents, music = excluded.music, productive_weight = excluded.productive_weight, base_weight = excluded.base_weight, ia_fraction = excluded.ia_fraction;
    last := e; n := n + 1;
  end loop;
  if last is not null then
    update statuses set app_now = left(coalesce(last->>'app', '—'), 60), app_cat = last->>'cat', music = coalesce((last->>'music')::boolean, false),
      agents = least(20, greatest(0, coalesce((last->>'agents')::int, 0))), idle = (last->>'cat') in ('idle', 'ia'), agent_seen_at = now()
     where workspace_id = t.workspace_id and user_id = t.user_id and agent_live_at is null;
  else
    update statuses set agent_seen_at = now() where workspace_id = t.workspace_id and user_id = t.user_id;
  end if;
  update agent_tokens set last_seen_at = now() where id = t.id;
  return jsonb_build_object('ok', true, 'estado', st.state, 'gravados', n);
end $$;

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
      (select round(sum(coalesce(a.productive_weight, public._prod_weight(a.category, a.agents))))::int from activity_minutes a
        where a.workspace_id = p_ws and a.user_id = m.user_id and a.day >= d0 and a.day < d1 having count(*) > 0),
      (select coalesce(sum(l.seconds), 0)::int / 60 from task_time_log l where l.workspace_id = p_ws and l.user_id = m.user_id and l.day >= d0 and l.day < d1)),
    (select round(coalesce(sum(coalesce(a.ia_fraction, case when a.agents > 0 then 1 else 0 end)),0))::int from activity_minutes a where a.workspace_id = p_ws and a.user_id = m.user_id and a.day >= d0 and a.day < d1)
  from members m where m.workspace_id = p_ws and m.kind = 'membro' and m.consent_at is not null;
end $$;

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
      round(coalesce(sum(coalesce(x.productive_weight, public._prod_weight(x.category, x.agents))), 0))::int prod,
      count(*) filter (where x.category = 'ref')::int ref, count(*) filter (where x.category = 'com')::int com,
      count(*) filter (where x.category = 'dis')::int dis, count(*) filter (where x.category = 'idle')::int idle,
      round(coalesce(sum(coalesce(x.ia_fraction, case when x.agents > 0 then 1 else 0 end)),0))::int ia,
      round(coalesce(sum(coalesce(x.productive_weight, public._prod_weight(x.category, x.agents))) - sum(coalesce(x.base_weight, case when x.category in ('prod','ia','ref','meet','gestor') then 1 else 0 end)), 0))::int bonus
    from activity_minutes x where x.workspace_id = p_ws and x.user_id = m.user_id and x.day = p_day
  ) a on true
  where m.workspace_id = p_ws and m.consent_at is not null;
end $$;
