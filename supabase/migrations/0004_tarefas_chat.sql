-- Sala 8-bit · versão 0.3: quadro de tarefas e chat por demanda
-- Toda escrita passa por funções do banco, que aplicam as regras:
-- etapas de vídeo, contestação com votação, transferência, pedido de ajuda,
-- relógio de tempo da tarefa (só corre quando a pessoa está trabalhando nela) e chat ligado a uma demanda.

-- ---------------------------------------------------------------- tabelas
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  title           text not null check (char_length(btrim(title)) between 2 and 120),
  description     text not null default '' check (char_length(description) <= 4000),
  line_id         uuid references public.catalog_items(id) on delete set null,
  area_id         uuid references public.catalog_items(id) on delete set null,
  type_id         uuid references public.catalog_items(id) on delete set null,
  col             text not null default 'afazer' check (col in ('afazer', 'fazendo', 'feito')),
  etapa           text check (etapa in ('roteiro', 'captacao', 'edicao', 'finalizacao')),
  owner           uuid,
  dir_to          uuid,
  linked_to       uuid,
  creator         uuid not null,
  due_date        date not null,
  due_time        time,
  est_min         int not null default 60 check (est_min between 5 and 2880),
  spent_sec       int not null default 0,
  phase_spent_sec int not null default 0,
  running_since   timestamptz,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  done_at         timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists tasks_ws_col on public.tasks(workspace_id, col);
create index if not exists tasks_owner on public.tasks(workspace_id, owner);

create table if not exists public.task_events (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null,
  actor        uuid,
  kind         text not null,
  text         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists task_events_task on public.task_events(task_id, created_at);

create table if not exists public.task_contests (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null,
  by_user      uuid not null,
  text         text not null check (char_length(btrim(text)) between 3 and 1000),
  status       text not null default 'aberta' check (status in ('aberta', 'aprovada', 'recusada')),
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create unique index if not exists contest_one_open on public.task_contests(task_id) where status = 'aberta';

create table if not exists public.contest_votes (
  contest_id   uuid not null references public.task_contests(id) on delete cascade,
  workspace_id uuid not null,
  user_id      uuid not null,
  vote         boolean not null,
  created_at   timestamptz not null default now(),
  primary key (contest_id, user_id)
);

create table if not exists public.task_transfers (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  workspace_id  uuid not null,
  from_user     uuid not null,
  to_user       uuid not null,
  status        text not null default 'pendente' check (status in ('pendente', 'aceita', 'recusada', 'cancelada')),
  justification text,
  created_at    timestamptz not null default now(),
  answered_at   timestamptz
);
create unique index if not exists transfer_one_pending on public.task_transfers(task_id) where status = 'pendente';

create table if not exists public.task_help (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  workspace_id  uuid not null,
  from_user     uuid not null,
  to_user       uuid not null,
  note          text not null check (char_length(btrim(note)) between 3 and 1000),
  status        text not null default 'pendente' check (status in ('pendente', 'aceita', 'recusada', 'cancelada')),
  justification text,
  created_at    timestamptz not null default now(),
  answered_at   timestamptz
);
create unique index if not exists help_one_pending on public.task_help(task_id, to_user) where status = 'pendente';

-- tempo de cada entrega, usado para calcular a média por tipo de atividade
create table if not exists public.task_durations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      uuid references public.tasks(id) on delete set null,
  user_id      uuid not null,
  area_id      uuid,
  type_id      uuid,
  etapa        text,
  minutes      int not null check (minutes >= 1),
  done_at      timestamptz not null default now()
);
create index if not exists durations_ws on public.task_durations(workspace_id, area_id, type_id, etapa);

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_user    uuid not null,
  to_user      uuid not null,
  task_id      uuid references public.tasks(id) on delete set null,
  text         text not null check (char_length(btrim(text)) between 1 and 2000),
  flagged      boolean not null default false,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  check (from_user <> to_user)
);
create index if not exists messages_pair on public.messages(workspace_id, from_user, to_user, created_at);
create index if not exists messages_to on public.messages(workspace_id, to_user) where read_at is null;

alter table public.statuses add column if not exists active_task_id uuid references public.tasks(id) on delete set null;

-- ---------------------------------------------------------------- funções internas
create or replace function public._is_membro(p_ws uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = p_ws and user_id = p_user and kind = 'membro')
$$;

create or replace function public._event(p_task uuid, p_ws uuid, p_actor uuid, p_kind text, p_text text) returns void
language sql security definer set search_path = public as $$
  insert into task_events(task_id, workspace_id, actor, kind, text) values (p_task, p_ws, p_actor, p_kind, p_text)
$$;

create or replace function public._name(p_ws uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from members where workspace_id = p_ws and user_id = p_user), 'alguém')
$$;

-- Para o relógio de uma tarefa, somando o tempo corrido.
create or replace function public._clock_stop(p_task uuid) returns void
language sql security definer set search_path = public as $$
  update tasks set
    spent_sec = spent_sec + greatest(0, extract(epoch from now() - running_since))::int,
    phase_spent_sec = phase_spent_sec + greatest(0, extract(epoch from now() - running_since))::int,
    running_since = null, updated_at = now()
  where id = p_task and running_since is not null
$$;

-- O relógio só corre na tarefa ativa da pessoa e só enquanto ela está trabalhando (ou na pausa do gestor).
create or replace function public._clock_sync(p_ws uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare st public.statuses; t uuid;
begin
  select * into st from statuses where workspace_id = p_ws and user_id = p_user;
  for t in select id from tasks where workspace_id = p_ws and owner = p_user and running_since is not null
           and (id is distinct from st.active_task_id or st.state not in ('trabalhando', 'pausa_gestor') or col <> 'fazendo') loop
    perform public._clock_stop(t);
  end loop;
  if st.active_task_id is not null and st.state in ('trabalhando', 'pausa_gestor') then
    update tasks set running_since = now(), updated_at = now()
     where id = st.active_task_id and owner = p_user and col = 'fazendo' and running_since is null;
  end if;
end $$;

create or replace function public.statuses_clock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.state is distinct from old.state or new.active_task_id is distinct from old.active_task_id then
    perform public._clock_sync(new.workspace_id, new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists statuses_clock on public.statuses;
create trigger statuses_clock after update on public.statuses for each row execute function public.statuses_clock();

-- Quem sai da equipe libera as tarefas que estava fazendo.
create or replace function public.members_release_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update tasks set col = 'afazer', owner = null, running_since = null, updated_at = now()
   where workspace_id = old.workspace_id and owner = old.user_id and col = 'fazendo';
  update tasks set owner = null where workspace_id = old.workspace_id and owner = old.user_id;
  update tasks set dir_to = null where workspace_id = old.workspace_id and dir_to = old.user_id;
  update tasks set linked_to = null where workspace_id = old.workspace_id and linked_to = old.user_id;
  update task_transfers set status = 'cancelada' where workspace_id = old.workspace_id and status = 'pendente' and (from_user = old.user_id or to_user = old.user_id);
  update task_help set status = 'cancelada' where workspace_id = old.workspace_id and status = 'pendente' and (from_user = old.user_id or to_user = old.user_id);
  return old;
end $$;
drop trigger if exists members_release_tasks on public.members;
create trigger members_release_tasks after delete on public.members for each row execute function public.members_release_tasks();

create or replace function public._task_for_update(p_task uuid) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from tasks where id = p_task for update;
  if not found then raise exception 'Tarefa não encontrada.' using errcode = 'P0002'; end if;
  if not public.is_member(t.workspace_id) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  return t;
end $$;

create or replace function public._require_membro(p_ws uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_membro(p_ws, auth.uid()) then
    raise exception 'O gestor só acompanha: não cria nem executa tarefas.' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------- tarefas
create or replace function public.create_task(
  p_ws uuid, p_title text, p_desc text, p_line uuid, p_area uuid, p_type uuid,
  p_dir_to uuid, p_due_date date, p_due_time time, p_est int)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks; area public.catalog_items; has_types boolean;
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  perform public._require_membro(p_ws);
  if not exists (select 1 from catalog_items where id = p_line and workspace_id = p_ws and kind = 'linha' and active) then
    raise exception 'Escolha a linha da tarefa.' using errcode = '22023'; end if;
  select * into area from catalog_items where id = p_area and workspace_id = p_ws and kind = 'area' and active;
  if not found then raise exception 'Escolha a área da tarefa.' using errcode = '22023'; end if;
  has_types := exists (select 1 from catalog_items where parent_id = p_area and kind = 'tipo' and active);
  if has_types and not exists (select 1 from catalog_items where id = p_type and parent_id = p_area and kind = 'tipo' and active) then
    raise exception 'Escolha o tipo da tarefa.' using errcode = '22023'; end if;
  if not has_types and p_type is not null then raise exception 'Esta área não usa tipos.' using errcode = '22023'; end if;
  if not has_types and char_length(btrim(coalesce(p_desc, ''))) < 3 then
    raise exception 'Descreva a tarefa na observação.' using errcode = '22023'; end if;
  if p_dir_to is not null and not public._is_membro(p_ws, p_dir_to) then
    raise exception 'Essa pessoa não está na equipe.' using errcode = '22023'; end if;
  if p_due_date is null then raise exception 'Informe a data de entrega.' using errcode = '22023'; end if;
  if p_due_date < current_date - 1 then raise exception 'A data de entrega já passou.' using errcode = '22023'; end if;
  if extract(dow from p_due_date) = 0 then raise exception 'Não há expediente no domingo.' using errcode = '22023'; end if;
  insert into tasks(workspace_id, title, description, line_id, area_id, type_id, etapa, dir_to, creator, due_date, due_time, est_min)
  values (p_ws, btrim(p_title), coalesce(btrim(p_desc), ''), p_line, p_area, case when has_types then p_type end,
          case when coalesce((area.meta->>'fases')::boolean, false) then 'roteiro' end,
          p_dir_to, auth.uid(), p_due_date, p_due_time, greatest(5, least(coalesce(p_est, 60), 2880)))
  returning * into t;
  perform public._event(t.id, p_ws, auth.uid(), 'criou', 'Criou a tarefa');
  return t;
end $$;

create or replace function public.start_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  t := public._task_for_update(p_task);
  perform public._require_membro(t.workspace_id);
  if t.col <> 'afazer' then raise exception 'Essa tarefa já foi iniciada.' using errcode = '22023'; end if;
  if exists (select 1 from task_contests where task_id = t.id and status = 'aberta') then
    raise exception 'A tarefa está travada até a votação terminar.' using errcode = '22023'; end if;
  update tasks set col = 'fazendo', owner = auth.uid(), started_at = coalesce(started_at, now()), updated_at = now() where id = t.id;
  update statuses set active_task_id = t.id, updated_at = now() where workspace_id = t.workspace_id and user_id = auth.uid();
  perform public._event(t.id, t.workspace_id, auth.uid(), 'iniciou',
    case when t.etapa is not null then 'Iniciou a etapa ' || t.etapa else 'Iniciou a tarefa' end);
end $$;

create or replace function public.set_active_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  t := public._task_for_update(p_task);
  if t.owner is distinct from auth.uid() or t.col <> 'fazendo' then raise exception 'Só dá para executar tarefas que estão com você.' using errcode = '22023'; end if;
  update statuses set active_task_id = t.id, updated_at = now() where workspace_id = t.workspace_id and user_id = auth.uid();
end $$;

create or replace function public.complete_task(p_task uuid) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks; nxt text;
begin
  t := public._task_for_update(p_task);
  if t.col <> 'fazendo' or t.owner is distinct from auth.uid() then
    raise exception 'Só quem está executando pode concluir.' using errcode = '22023'; end if;
  perform public._clock_stop(t.id);
  select * into t from tasks where id = t.id;
  insert into task_durations(workspace_id, task_id, user_id, area_id, type_id, etapa, minutes)
  values (t.workspace_id, t.id, auth.uid(), t.area_id, t.type_id, t.etapa, greatest(1, round(t.phase_spent_sec / 60.0))::int);
  update statuses set active_task_id = null where workspace_id = t.workspace_id and user_id = auth.uid() and active_task_id = t.id;
  update task_transfers set status = 'cancelada' where task_id = t.id and status = 'pendente';
  update task_help set status = 'cancelada' where task_id = t.id and status = 'pendente';
  nxt := case t.etapa when 'roteiro' then 'captacao' when 'captacao' then 'edicao' when 'edicao' then 'finalizacao' end;
  if nxt is not null then
    -- etapa de vídeo concluída: volta para "A fazer" vinculada a quem fez (qualquer um pode pegar)
    update tasks set col = 'afazer', etapa = nxt, owner = null, linked_to = auth.uid(), phase_spent_sec = 0, updated_at = now()
     where id = t.id returning * into t;
    perform public._event(t.id, t.workspace_id, auth.uid(), 'etapa', 'Concluiu a etapa e passou para ' || nxt);
  else
    update tasks set col = 'feito', done_at = now(), updated_at = now() where id = t.id returning * into t;
    perform public._event(t.id, t.workspace_id, auth.uid(), 'concluiu', 'Concluiu a tarefa');
  end if;
  return t;
end $$;

create or replace function public.return_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  t := public._task_for_update(p_task);
  if t.col <> 'fazendo' or t.owner is distinct from auth.uid() then
    raise exception 'Só quem está executando pode devolver.' using errcode = '22023'; end if;
  perform public._clock_stop(t.id);
  update tasks set col = 'afazer', owner = null, updated_at = now() where id = t.id;
  update statuses set active_task_id = null where workspace_id = t.workspace_id and user_id = auth.uid() and active_task_id = t.id;
  update task_transfers set status = 'cancelada' where task_id = t.id and status = 'pendente';
  update task_help set status = 'cancelada' where task_id = t.id and status = 'pendente';
  perform public._event(t.id, t.workspace_id, auth.uid(), 'devolveu', 'Devolveu para A fazer');
end $$;

create or replace function public.delete_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  t := public._task_for_update(p_task);
  if t.creator <> auth.uid() and not public.is_admin(t.workspace_id) then
    raise exception 'Só quem criou (ou o administrador) pode excluir.' using errcode = '42501'; end if;
  if t.col = 'fazendo' then raise exception 'A tarefa está em execução. Peça para devolver antes de excluir.' using errcode = '22023'; end if;
  delete from tasks where id = t.id;
end $$;

-- ---------------------------------------------------------------- contestação com votação
create or replace function public._resolve_contest(p_contest uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.task_contests; n int; yes int; nos int; maj int;
begin
  select * into c from task_contests where id = p_contest for update;
  if c.status <> 'aberta' then return; end if;
  select count(*) into n from members where workspace_id = c.workspace_id and kind = 'membro' and consent_at is not null;
  select count(*) filter (where vote), count(*) filter (where not vote) into yes, nos from contest_votes where contest_id = c.id;
  maj := n / 2 + 1;
  if yes >= maj then
    update task_contests set status = 'aprovada', closed_at = now() where id = c.id;
    update tasks set description = btrim(description || E'\n\nSugestão aprovada (' || public._name(c.workspace_id, c.by_user) || '): ' || c.text), updated_at = now()
     where id = c.task_id;
    perform public._event(c.task_id, c.workspace_id, null, 'votacao', 'Sugestão aprovada pela maioria');
  elsif nos > n - maj then
    update task_contests set status = 'recusada', closed_at = now() where id = c.id;
    perform public._event(c.task_id, c.workspace_id, null, 'votacao', 'Sugestão recusada pela maioria');
  end if;
end $$;

create or replace function public.contest_task(p_task uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks; cid uuid;
begin
  t := public._task_for_update(p_task);
  perform public._require_membro(t.workspace_id);
  if t.col <> 'afazer' then raise exception 'Só dá para contestar tarefas em A fazer.' using errcode = '22023'; end if;
  if exists (select 1 from task_contests where task_id = t.id and status = 'aberta') then
    raise exception 'Já existe uma votação aberta nesta tarefa.' using errcode = '22023'; end if;
  insert into task_contests(task_id, workspace_id, by_user, text) values (t.id, t.workspace_id, auth.uid(), btrim(p_text)) returning id into cid;
  insert into contest_votes(contest_id, workspace_id, user_id, vote) values (cid, t.workspace_id, auth.uid(), true);
  perform public._event(t.id, t.workspace_id, auth.uid(), 'contestou', 'Contestou a tarefa com uma sugestão');
  perform public._resolve_contest(cid);
end $$;

create or replace function public.vote_contest(p_contest uuid, p_vote boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.task_contests;
begin
  select * into c from task_contests where id = p_contest;
  if not found or c.status <> 'aberta' then raise exception 'Essa votação já terminou.' using errcode = '22023'; end if;
  perform public._require_membro(c.workspace_id);
  insert into contest_votes(contest_id, workspace_id, user_id, vote) values (c.id, c.workspace_id, auth.uid(), p_vote);
  perform public._event(c.task_id, c.workspace_id, auth.uid(), 'votou', case when p_vote then 'Votou a favor da sugestão' else 'Votou contra a sugestão' end);
  perform public._resolve_contest(c.id);
exception when unique_violation then
  raise exception 'Você já votou.' using errcode = '23505';
end $$;

-- ---------------------------------------------------------------- transferência
create or replace function public.request_transfer(p_task uuid, p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  t := public._task_for_update(p_task);
  if t.col <> 'fazendo' or t.owner is distinct from auth.uid() then raise exception 'Só quem está executando pode transferir.' using errcode = '22023'; end if;
  if p_to = auth.uid() or not public._is_membro(t.workspace_id, p_to) then raise exception 'Escolha outra pessoa da equipe.' using errcode = '22023'; end if;
  insert into task_transfers(task_id, workspace_id, from_user, to_user) values (t.id, t.workspace_id, auth.uid(), p_to);
  perform public._event(t.id, t.workspace_id, auth.uid(), 'transferencia', 'Pediu para transferir para ' || public._name(t.workspace_id, p_to));
exception when unique_violation then
  raise exception 'Já existe um pedido de transferência aguardando resposta.' using errcode = '23505';
end $$;

create or replace function public.answer_transfer(p_transfer uuid, p_ok boolean, p_just text default null) returns void
language plpgsql security definer set search_path = public as $$
declare tr public.task_transfers; t public.tasks;
begin
  select * into tr from task_transfers where id = p_transfer for update;
  if not found or tr.status <> 'pendente' then raise exception 'Esse pedido já foi respondido.' using errcode = '22023'; end if;
  if tr.to_user <> auth.uid() then raise exception 'Esse pedido não é para você.' using errcode = '42501'; end if;
  if not p_ok and char_length(btrim(coalesce(p_just, ''))) < 3 then raise exception 'Explique por que está recusando.' using errcode = '22023'; end if;
  update task_transfers set status = case when p_ok then 'aceita' else 'recusada' end, justification = nullif(btrim(coalesce(p_just, '')), ''), answered_at = now() where id = tr.id;
  if p_ok then
    t := public._task_for_update(tr.task_id);
    perform public._clock_stop(t.id);
    update statuses set active_task_id = null where workspace_id = t.workspace_id and user_id = tr.from_user and active_task_id = t.id;
    update tasks set owner = auth.uid(), updated_at = now() where id = t.id;
    update statuses set active_task_id = t.id where workspace_id = t.workspace_id and user_id = auth.uid();
    perform public._event(t.id, t.workspace_id, auth.uid(), 'transferencia', 'Aceitou a transferência');
  else
    perform public._event(tr.task_id, tr.workspace_id, auth.uid(), 'transferencia', 'Recusou a transferência: ' || btrim(p_just));
  end if;
end $$;

-- ---------------------------------------------------------------- pedido de ajuda
create or replace function public.request_help(p_task uuid, p_tos uuid[], p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks; u uuid; n int := 0;
begin
  t := public._task_for_update(p_task);
  if t.col <> 'fazendo' or t.owner is distinct from auth.uid() then raise exception 'Só quem está executando pode pedir ajuda.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Escreva no que precisa de ajuda.' using errcode = '22023'; end if;
  foreach u in array coalesce(p_tos, '{}') loop
    if u <> auth.uid() and public._is_membro(t.workspace_id, u)
       and not exists (select 1 from task_help where task_id = t.id and to_user = u and status in ('pendente', 'aceita')) then
      insert into task_help(task_id, workspace_id, from_user, to_user, note) values (t.id, t.workspace_id, auth.uid(), u, btrim(p_note));
      n := n + 1;
    end if;
  end loop;
  if n = 0 then raise exception 'Escolha quem vai ajudar.' using errcode = '22023'; end if;
  perform public._event(t.id, t.workspace_id, auth.uid(), 'ajuda', 'Pediu ajuda: ' || btrim(p_note));
end $$;

create or replace function public.answer_help(p_help uuid, p_ok boolean, p_just text default null) returns void
language plpgsql security definer set search_path = public as $$
declare h public.task_help;
begin
  select * into h from task_help where id = p_help for update;
  if not found or h.status <> 'pendente' then raise exception 'Esse pedido já foi respondido.' using errcode = '22023'; end if;
  if h.to_user <> auth.uid() then raise exception 'Esse pedido não é para você.' using errcode = '42501'; end if;
  if not p_ok and char_length(btrim(coalesce(p_just, ''))) < 3 then raise exception 'Explique por que está recusando.' using errcode = '22023'; end if;
  update task_help set status = case when p_ok then 'aceita' else 'recusada' end, justification = nullif(btrim(coalesce(p_just, '')), ''), answered_at = now() where id = h.id;
  perform public._event(h.task_id, h.workspace_id, auth.uid(), 'ajuda', case when p_ok then 'Aceitou ajudar' else 'Recusou ajudar: ' || btrim(p_just) end);
end $$;

-- ---------------------------------------------------------------- chat
create or replace function public.send_message(p_ws uuid, p_to uuid, p_task uuid, p_text text) returns public.messages
language plpgsql security definer set search_path = public as $$
declare m public.messages; words jsonb; w text; flag boolean := false;
begin
  if not public.is_member(p_ws) then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  if p_to = auth.uid() or not exists (select 1 from members where workspace_id = p_ws and user_id = p_to) then
    raise exception 'Essa pessoa não está na equipe.' using errcode = '22023'; end if;
  if p_task is null or not exists (select 1 from tasks where id = p_task and workspace_id = p_ws) then
    raise exception 'Toda mensagem precisa estar ligada a uma demanda.' using errcode = '22023'; end if;
  select settings->'palavras_fora_do_assunto' into words from workspaces where id = p_ws;
  for w in select jsonb_array_elements_text(coalesce(words, '[]'::jsonb)) loop
    if char_length(btrim(w)) > 0 and position(lower(btrim(w)) in lower(p_text)) > 0 then flag := true; exit; end if;
  end loop;
  insert into messages(workspace_id, from_user, to_user, task_id, text, flagged)
  values (p_ws, auth.uid(), p_to, p_task, btrim(p_text), flag) returning * into m;
  -- responder a quem chamou sua atenção apaga a placa ATENÇÃO
  update attention_calls set seen_at = now() where workspace_id = p_ws and to_user = auth.uid() and from_user = p_to and seen_at is null;
  return m;
end $$;

create or replace function public.mark_read(p_ws uuid, p_from uuid) returns void
language sql security definer set search_path = public as $$
  update messages set read_at = now() where workspace_id = p_ws and to_user = auth.uid() and from_user = p_from and read_at is null
$$;

-- ---------------------------------------------------------------- RLS
alter table public.tasks          enable row level security;
alter table public.task_events    enable row level security;
alter table public.task_contests  enable row level security;
alter table public.contest_votes  enable row level security;
alter table public.task_transfers enable row level security;
alter table public.task_help      enable row level security;
alter table public.task_durations enable row level security;
alter table public.messages       enable row level security;

do $$ declare t text; begin
  foreach t in array array['tasks', 'task_events', 'task_contests', 'contest_votes', 'task_transfers', 'task_help', 'task_durations'] loop
    execute format('drop policy if exists sel on public.%I', t);
    execute format('create policy sel on public.%I for select to authenticated using (public.is_member(workspace_id))', t);
  end loop;
end $$;
drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select to authenticated
  using (public.is_member(workspace_id) and (from_user = auth.uid() or to_user = auth.uid()));

do $$ declare f text; begin
  foreach f in array array[
    'create_task(uuid, text, text, uuid, uuid, uuid, uuid, date, time, int)', 'start_task(uuid)', 'set_active_task(uuid)',
    'complete_task(uuid)', 'return_task(uuid)', 'delete_task(uuid)', 'contest_task(uuid, text)', 'vote_contest(uuid, boolean)',
    'request_transfer(uuid, uuid)', 'answer_transfer(uuid, boolean, text)', 'request_help(uuid, uuid[], text)',
    'answer_help(uuid, boolean, text)', 'send_message(uuid, uuid, uuid, text)', 'mark_read(uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['_is_membro(uuid, uuid)', '_event(uuid, uuid, uuid, text, text)', '_name(uuid, uuid)', '_clock_stop(uuid)',
    '_clock_sync(uuid, uuid)', '_task_for_update(uuid)', '_require_membro(uuid)', '_resolve_contest(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['tasks', 'task_contests', 'contest_votes', 'task_transfers', 'task_help', 'messages'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when undefined_object or duplicate_object then null; end;
  end loop;
end $$;
