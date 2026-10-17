-- Sala 8-bit · versão 0.2: sala ao vivo
-- Status de cada pessoa, pausas (café e almoço), reuniões e "chamar atenção".
-- Mudanças de status passam pelas funções abaixo, que mantêm tudo coerente
-- (ex.: sair da copa fecha a pausa; quem criou a reunião, ao sair, encerra para todos).

do $$ begin
  create type public.member_state as enum ('fora', 'trabalhando', 'cafe', 'almoco', 'reuniao', 'pausa_gestor', 'encerrado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tabelas
create table if not exists public.statuses (
  workspace_id uuid not null,
  user_id      uuid not null,
  state        public.member_state not null default 'fora',
  since        timestamptz not null default now(),
  meeting_id   uuid,
  device       text not null default 'computador' check (device in ('computador', 'celular')),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id),
  foreign key (workspace_id, user_id) references public.members(workspace_id, user_id) on delete cascade
);

create table if not exists public.pauses (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id      uuid not null,
  kind         text not null check (kind in ('cafe', 'almoco')),
  day          date not null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  foreign key (workspace_id, user_id) references public.members(workspace_id, user_id) on delete cascade
);
create index if not exists pauses_ws_day on public.pauses(workspace_id, day);
create unique index if not exists pauses_one_open on public.pauses(workspace_id, user_id) where ended_at is null;

create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subject      text not null check (char_length(btrim(subject)) between 2 and 80),
  created_by   uuid not null,
  visitors     int not null default 0 check (visitors between 0 and 15),
  outsiders    int not null default 0 check (outsiders between 0 and 15),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);
create index if not exists meetings_open on public.meetings(workspace_id) where ended_at is null;

create table if not exists public.meeting_members (
  meeting_id   uuid not null references public.meetings(id) on delete cascade,
  workspace_id uuid not null,
  user_id      uuid not null,
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,
  primary key (meeting_id, user_id),
  foreign key (workspace_id, user_id) references public.members(workspace_id, user_id) on delete cascade
);

create table if not exists public.attention_calls (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  from_user    uuid not null,
  to_user      uuid not null,
  created_at   timestamptz not null default now(),
  seen_at      timestamptz,
  check (from_user <> to_user),
  foreign key (workspace_id, from_user) references public.members(workspace_id, user_id) on delete cascade,
  foreign key (workspace_id, to_user)   references public.members(workspace_id, user_id) on delete cascade
);
create unique index if not exists attention_one_open on public.attention_calls(workspace_id, from_user, to_user) where seen_at is null;

-- cada membro ganha uma linha de status (inclusive os que já existiam)
create or replace function public.members_status_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into statuses(workspace_id, user_id) values (new.workspace_id, new.user_id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists members_status_row on public.members;
create trigger members_status_row after insert on public.members
  for each row execute function public.members_status_row();
insert into public.statuses(workspace_id, user_id) select workspace_id, user_id from public.members on conflict do nothing;

-- ---------------------------------------------------------------- regras internas
-- Fecha a pausa aberta e tira a pessoa da reunião em que estiver.
create or replace function public._leave_current(p_ws uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare st public.statuses; mt public.meetings;
begin
  update pauses set ended_at = now() where workspace_id = p_ws and user_id = p_user and ended_at is null;
  select * into st from statuses where workspace_id = p_ws and user_id = p_user;
  if st.meeting_id is null then return; end if;
  select * into mt from meetings where id = st.meeting_id;
  update meeting_members set left_at = now() where meeting_id = st.meeting_id and user_id = p_user and left_at is null;
  update statuses set meeting_id = null where workspace_id = p_ws and user_id = p_user;
  -- quem criou saiu, ou não sobrou ninguém: a reunião acaba e todos voltam para a mesa
  if mt.created_by = p_user or not exists (select 1 from meeting_members where meeting_id = mt.id and left_at is null) then
    update meetings set ended_at = now() where id = mt.id and ended_at is null;
    update meeting_members set left_at = now() where meeting_id = mt.id and left_at is null;
    update statuses set state = 'trabalhando', since = now(), meeting_id = null, updated_at = now()
      where workspace_id = p_ws and meeting_id = mt.id;
  end if;
end $$;
revoke all on function public._leave_current(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- RPCs
-- Muda o próprio status. Café e almoço abrem uma pausa; qualquer mudança fecha a anterior.
create or replace function public.set_state(p_ws uuid, p_state public.member_state, p_day date, p_device text default null)
returns public.statuses
language plpgsql security definer set search_path = public as $$
declare me public.members; st public.statuses; budget int;
begin
  select * into me from members where workspace_id = p_ws and user_id = auth.uid();
  if not found then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  if p_state = 'reuniao' then raise exception 'Use "Sinalizar reunião" para entrar em reunião.' using errcode = '22023'; end if;
  if me.kind = 'gestor' and p_state not in ('fora', 'trabalhando', 'encerrado') then
    raise exception 'O gestor só acompanha: não usa a copa nem a pausa.' using errcode = '22023';
  end if;
  if p_state = 'pausa_gestor' and not exists (select 1 from members where workspace_id = p_ws and kind = 'gestor') then
    raise exception 'Esta equipe ainda não tem gestor.' using errcode = '22023';
  end if;
  if p_state = 'almoco' and exists (select 1 from pauses where workspace_id = p_ws and user_id = auth.uid() and kind = 'almoco' and day = p_day) then
    raise exception 'Você já fez a pausa do almoço hoje.' using errcode = '22023';
  end if;

  perform public._leave_current(p_ws, auth.uid());
  if p_state in ('cafe', 'almoco') then
    insert into pauses(workspace_id, user_id, kind, day) values (p_ws, auth.uid(), p_state::text, p_day);
  end if;
  update statuses set state = p_state, since = now(), meeting_id = null, updated_at = now(),
         device = coalesce(p_device, device)
   where workspace_id = p_ws and user_id = auth.uid()
  returning * into st;
  return st;
end $$;

-- Cria uma reunião e leva junto quem foi marcado (se estiver no escritório).
create or replace function public.start_meeting(p_ws uuid, p_subject text, p_members uuid[], p_visitors int default 0, p_outsiders int default 0)
returns public.meetings
language plpgsql security definer set search_path = public as $$
declare mt public.meetings; u uuid;
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  if (select state from statuses where workspace_id = p_ws and user_id = auth.uid()) in ('fora', 'encerrado') then
    raise exception 'Entre no escritório antes de marcar uma reunião.' using errcode = '22023';
  end if;
  perform public._leave_current(p_ws, auth.uid());
  insert into meetings(workspace_id, subject, created_by, visitors, outsiders)
  values (p_ws, btrim(p_subject), auth.uid(), coalesce(p_visitors, 0), coalesce(p_outsiders, 0))
  returning * into mt;
  foreach u in array (array[auth.uid()] || coalesce(p_members, '{}')) loop
    if u = auth.uid() or exists (
      select 1 from statuses s where s.workspace_id = p_ws and s.user_id = u
        and s.state in ('trabalhando', 'cafe', 'pausa_gestor') and s.meeting_id is null) then
      if u <> auth.uid() then perform public._leave_current(p_ws, u); end if;
      insert into meeting_members(meeting_id, workspace_id, user_id) values (mt.id, p_ws, u) on conflict do nothing;
      update statuses set state = 'reuniao', since = now(), meeting_id = mt.id, updated_at = now()
       where workspace_id = p_ws and user_id = u;
    end if;
  end loop;
  return mt;
end $$;

create or replace function public.join_meeting(p_meeting uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mt public.meetings;
begin
  select * into mt from meetings where id = p_meeting and ended_at is null;
  if not found then raise exception 'Essa reunião já terminou.' using errcode = 'P0002'; end if;
  if not public.is_member(mt.workspace_id) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  if (select state from statuses where workspace_id = mt.workspace_id and user_id = auth.uid()) in ('fora', 'encerrado') then
    raise exception 'Entre no escritório antes.' using errcode = '22023';
  end if;
  perform public._leave_current(mt.workspace_id, auth.uid());
  insert into meeting_members(meeting_id, workspace_id, user_id) values (mt.id, mt.workspace_id, auth.uid())
    on conflict (meeting_id, user_id) do update set left_at = null, joined_at = now();
  update statuses set state = 'reuniao', since = now(), meeting_id = mt.id, updated_at = now()
   where workspace_id = mt.workspace_id and user_id = auth.uid();
end $$;

-- Sai da reunião e volta para a mesa.
create or replace function public.leave_meeting(p_ws uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  perform public._leave_current(p_ws, auth.uid());
  update statuses set state = 'trabalhando', since = now(), updated_at = now()
   where workspace_id = p_ws and user_id = auth.uid() and state = 'reuniao';
end $$;

-- Chamar a atenção de um colega. Fica uma placa ATENÇÃO até ele responder.
create or replace function public.call_attention(p_ws uuid, p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  if p_to = auth.uid() then raise exception 'Não dá para chamar a própria atenção.' using errcode = '22023'; end if;
  if not exists (select 1 from members where workspace_id = p_ws and user_id = p_to) then
    raise exception 'Essa pessoa não está na equipe.' using errcode = '22023';
  end if;
  insert into attention_calls(workspace_id, from_user, to_user) values (p_ws, auth.uid(), p_to)
    on conflict do nothing;
end $$;

create or replace function public.ack_attention(p_ws uuid, p_from uuid) returns void
language sql security definer set search_path = public as $$
  update attention_calls set seen_at = now()
   where workspace_id = p_ws and to_user = auth.uid() and from_user = p_from and seen_at is null
$$;

-- ---------------------------------------------------------------- RLS
alter table public.statuses        enable row level security;
alter table public.pauses          enable row level security;
alter table public.meetings        enable row level security;
alter table public.meeting_members enable row level security;
alter table public.attention_calls enable row level security;

-- leitura para a equipe; escrita só pelas funções acima
drop policy if exists st_select on public.statuses;
create policy st_select on public.statuses for select to authenticated using (public.is_member(workspace_id));
drop policy if exists pa_select on public.pauses;
create policy pa_select on public.pauses for select to authenticated using (public.is_member(workspace_id));
drop policy if exists mt_select on public.meetings;
create policy mt_select on public.meetings for select to authenticated using (public.is_member(workspace_id));
drop policy if exists mm_select on public.meeting_members;
create policy mm_select on public.meeting_members for select to authenticated using (public.is_member(workspace_id));
drop policy if exists at_select on public.attention_calls;
create policy at_select on public.attention_calls for select to authenticated
  using (public.is_member(workspace_id) and (from_user = auth.uid() or to_user = auth.uid()));

revoke all on function public.set_state(uuid, public.member_state, date, text) from public, anon;
revoke all on function public.start_meeting(uuid, text, uuid[], int, int)       from public, anon;
revoke all on function public.join_meeting(uuid)                                 from public, anon;
revoke all on function public.leave_meeting(uuid)                                from public, anon;
revoke all on function public.call_attention(uuid, uuid)                         from public, anon;
revoke all on function public.ack_attention(uuid, uuid)                          from public, anon;
grant execute on function public.set_state(uuid, public.member_state, date, text) to authenticated;
grant execute on function public.start_meeting(uuid, text, uuid[], int, int)       to authenticated;
grant execute on function public.join_meeting(uuid)                                 to authenticated;
grant execute on function public.leave_meeting(uuid)                                to authenticated;
grant execute on function public.call_attention(uuid, uuid)                         to authenticated;
grant execute on function public.ack_attention(uuid, uuid)                          to authenticated;

-- tempo real
do $$ begin alter publication supabase_realtime add table public.statuses;        exception when undefined_object or duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.pauses;          exception when undefined_object or duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.meetings;        exception when undefined_object or duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.meeting_members; exception when undefined_object or duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.attention_calls; exception when undefined_object or duplicate_object then null; end $$;
