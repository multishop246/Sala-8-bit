-- Sala 8-bit · estrutura da etapa 1
-- Empresas (espaços), membros, convites, catálogo configurável e mesas fixas.
-- Toda a segurança fica no banco (Row Level Security): o site só enxerga
-- os dados da empresa de quem está logado.

-- ---------------------------------------------------------------- tipos
do $$ begin
  create type public.member_kind as enum ('membro', 'gestor');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tabelas
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 60),
  slug        text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  desks       int  not null default 7 check (desks between 1 and 24),
  settings    jsonb not null default jsonb_build_object(
    'rotulo_linha', 'Linha',
    'recursos', jsonb_build_object('sabadao', true, 'datas_comemorativas', true, 'mural_gloria', true, 'instagram', false),
    'cafe_min', 15,
    'almoco', jsonb_build_object('de', '11:00', 'ate', '13:00'),
    'ociosidade_min', 5,
    'apps_ia', jsonb_build_array('ChatGPT', 'Claude', 'Gemini', 'Copilot'),
    'apps_comunicacao', jsonb_build_array('Slack', 'WhatsApp', 'Outlook', 'Microsoft Teams', 'Google Chat'),
    'palavras_fora_do_assunto', jsonb_build_array('futebol', 'jogo de ontem', 'novela', 'bbb', 'fofoca', 'balada', 'churrasco', 'cerveja', 'netflix')
  ),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          public.member_kind not null default 'membro',
  is_admin      boolean not null default false,
  display_name  text check (display_name is null or char_length(btrim(display_name)) between 1 and 30),
  avatar        jsonb not null default '{}'::jsonb,
  main_role     text,
  adj_roles     text[] not null default '{}' check (cardinality(adj_roles) <= 2),
  schedule      jsonb,
  report_folder text,
  desk          int,
  consent_at    timestamptz,
  joined_at     timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (workspace_id, desk),
  check (desk is null or desk >= 1),
  check (kind = 'membro' or desk is null)
);
create index if not exists members_user_idx on public.members(user_id);

create table if not exists public.invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  kind          public.member_kind not null default 'membro',
  max_uses      int not null default 20 check (max_uses between 1 and 200),
  uses          int not null default 0,
  expires_at    timestamptz not null default now() + interval '14 days',
  revoked       boolean not null default false,
  created_by    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index if not exists invites_ws_idx on public.invites(workspace_id);

-- Catálogo configurável por empresa:
--   funcao  meta: { desc, apps[] }      → apps que contam como produtivos
--   area    meta: { funcoes[], est, fases } → quem atende a área, tempo médio (min), se usa Roteiro→Captação→Edição→Finalização
--   tipo    parent = área, grupo = agrupador, meta: { est }
--   linha   linhas de produto / clientes / marcas
create table if not exists public.catalog_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  kind          text not null check (kind in ('funcao', 'area', 'tipo', 'linha')),
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  parent_id     uuid references public.catalog_items(id) on delete cascade,
  grupo         text,
  meta          jsonb not null default '{}'::jsonb,
  sort          int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  check ((kind = 'tipo') = (parent_id is not null))
);
create unique index if not exists catalog_unique_name
  on public.catalog_items(workspace_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- ---------------------------------------------------------------- funções auxiliares
create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = ws and user_id = auth.uid())
$$;

create or replace function public.is_admin(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = ws and user_id = auth.uid() and is_admin)
$$;

-- Protege campos que só o administrador (ou as funções do sistema) podem mudar.
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bypass boolean := coalesce(current_setting('sala.bypass', true), '') = 'on';
  admin  boolean;
begin
  if bypass then return coalesce(new, old); end if;
  admin := public.is_admin(coalesce(new.workspace_id, old.workspace_id));

  if tg_op = 'UPDATE' then
    if not admin and (new.kind is distinct from old.kind or new.is_admin is distinct from old.is_admin
                      or new.desk is distinct from old.desk or new.workspace_id <> old.workspace_id
                      or new.user_id <> old.user_id or new.joined_at <> old.joined_at) then
      raise exception 'Só o administrador pode mudar função na empresa, mesa ou permissões.' using errcode = '42501';
    end if;
    -- a mesa só pode ser liberada pelo admin; trocar de mesa = liberar e escolher de novo
    if admin and new.desk is not null and new.desk is distinct from old.desk then
      raise exception 'Use "Escolher mesa" para ocupar uma mesa.' using errcode = '42501';
    end if;
    if old.is_admin and not new.is_admin and not exists (
      select 1 from members where workspace_id = old.workspace_id and is_admin and user_id <> old.user_id) then
      raise exception 'A empresa precisa de pelo menos um administrador.' using errcode = '23514';
    end if;
    if new.kind = 'gestor' then new.desk := null; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- exclusão da empresa inteira ou da conta do usuário (LGPD): sempre permitida
    if not exists (select 1 from workspaces where id = old.workspace_id) then
      return old;
    end if;
    if not exists (select 1 from auth.users where id = old.user_id) then
      -- conta excluída: se era o único admin, a pessoa mais antiga da equipe assume
      if old.is_admin and not exists (
        select 1 from members where workspace_id = old.workspace_id and is_admin and user_id <> old.user_id) then
        perform set_config('sala.bypass', 'on', true);
        update members set is_admin = true
        where workspace_id = old.workspace_id and user_id = (
          select user_id from members where workspace_id = old.workspace_id and user_id <> old.user_id
          order by joined_at limit 1);
        perform set_config('sala.bypass', 'off', true);
      end if;
      return old;
    end if;
    if old.is_admin and not exists (
      select 1 from members where workspace_id = old.workspace_id and is_admin and user_id <> old.user_id) then
      raise exception 'A empresa precisa de pelo menos um administrador.' using errcode = '23514';
    end if;
    return old;
  end if;

  -- INSERT direto não é permitido (só por create_workspace / accept_invite)
  raise exception 'Entre na empresa por um convite.' using errcode = '42501';
end $$;

drop trigger if exists members_guard on public.members;
create trigger members_guard before insert or update or delete on public.members
  for each row execute function public.members_guard();

-- ---------------------------------------------------------------- catálogo padrão
create or replace function public.seed_catalog(ws uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  cat jsonb := public.default_catalog();
  f jsonb; a jsonb; t jsonb; area_id uuid; i int := 0; j int;
begin
  for f in select * from jsonb_array_elements(cat->'funcoes') loop
    insert into catalog_items(workspace_id, kind, name, meta, sort)
    values (ws, 'funcao', f->>'nome', jsonb_build_object('desc', f->'desc', 'apps', f->'apps'), i);
    i := i + 1;
  end loop;
  i := 0;
  for a in select * from jsonb_array_elements(cat->'areas') loop
    insert into catalog_items(workspace_id, kind, name, meta, sort)
    values (ws, 'area', a->>'nome', jsonb_build_object('funcoes', a->'funcoes', 'est', a->'est', 'fases', a->'fases'), i)
    returning id into area_id;
    j := 0;
    for t in select * from jsonb_array_elements(a->'tipos') loop
      insert into catalog_items(workspace_id, kind, name, parent_id, grupo, meta, sort)
      values (ws, 'tipo', t->>'nome', area_id, t->>'grupo',
              case when t->'est' = 'null'::jsonb then '{}'::jsonb else jsonb_build_object('est', t->'est') end, j);
      j := j + 1;
    end loop;
    i := i + 1;
  end loop;
end $$;
revoke all on function public.seed_catalog(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- RPCs
create or replace function public.create_workspace(p_name text, p_slug text, p_desks int default 7)
returns public.workspaces
language plpgsql security definer set search_path = public as $$
declare ws public.workspaces;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.' using errcode = '42501'; end if;
  if (select count(*) from workspaces where created_by = auth.uid()) >= 5 then
    raise exception 'Limite de 5 empresas criadas por conta.' using errcode = '23514';
  end if;
  insert into workspaces(name, slug, desks, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), coalesce(p_desks, 7), auth.uid())
  returning * into ws;
  perform set_config('sala.bypass', 'on', true);
  insert into members(workspace_id, user_id, kind, is_admin) values (ws.id, auth.uid(), 'membro', true);
  perform set_config('sala.bypass', 'off', true);
  perform public.seed_catalog(ws.id);
  return ws;
exception when unique_violation then
  raise exception 'Este endereço já está em uso. Escolha outro.' using errcode = '23505';
end $$;

create or replace function public.invite_preview(p_token text)
returns table (workspace_name text, workspace_slug text, kind public.member_kind, valid boolean, already_member boolean)
language sql stable security definer set search_path = public as $$
  select w.name, w.slug, i.kind,
         (not i.revoked and i.expires_at > now() and i.uses < i.max_uses),
         exists (select 1 from members m where m.workspace_id = w.id and m.user_id = auth.uid())
  from invites i join workspaces w on w.id = i.workspace_id
  where i.token = p_token
$$;

create or replace function public.accept_invite(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.invites; ws_slug text;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.' using errcode = '42501'; end if;
  select * into inv from invites where token = p_token for update;
  if not found then raise exception 'Convite não encontrado.' using errcode = 'P0002'; end if;
  select slug into ws_slug from workspaces where id = inv.workspace_id;
  if exists (select 1 from members where workspace_id = inv.workspace_id and user_id = auth.uid()) then
    return ws_slug;
  end if;
  if inv.revoked or inv.expires_at <= now() or inv.uses >= inv.max_uses then
    raise exception 'Este convite expirou. Peça um novo ao administrador.' using errcode = '22023';
  end if;
  perform set_config('sala.bypass', 'on', true);
  insert into members(workspace_id, user_id, kind) values (inv.workspace_id, auth.uid(), inv.kind);
  perform set_config('sala.bypass', 'off', true);
  update invites set uses = uses + 1 where id = inv.id;
  return ws_slug;
end $$;

-- Mesa fixa: escolhida uma vez. Só o administrador pode liberar depois.
create or replace function public.claim_desk(p_ws uuid, p_desk int) returns void
language plpgsql security definer set search_path = public as $$
declare me public.members; total int;
begin
  select * into me from members where workspace_id = p_ws and user_id = auth.uid() for update;
  if not found then raise exception 'Você não faz parte desta empresa.' using errcode = '42501'; end if;
  if me.kind = 'gestor' then raise exception 'O gestor usa a mesa da diretoria.' using errcode = '22023'; end if;
  if me.desk is not null then raise exception 'Você já tem uma mesa. Peça ao administrador para trocar.' using errcode = '22023'; end if;
  select desks into total from workspaces where id = p_ws;
  if p_desk < 1 or p_desk > total then raise exception 'Mesa inexistente.' using errcode = '22023'; end if;
  perform set_config('sala.bypass', 'on', true);
  update members set desk = p_desk where workspace_id = p_ws and user_id = auth.uid();
  perform set_config('sala.bypass', 'off', true);
exception when unique_violation then
  raise exception 'Alguém acabou de escolher essa mesa. Escolha outra.' using errcode = '23505';
end $$;

-- Gerar link de convite (só admin)
create or replace function public.create_invite(p_ws uuid, p_kind public.member_kind default 'membro', p_days int default 14, p_max int default 20)
returns public.invites
language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  if not public.is_admin(p_ws) then raise exception 'Só o administrador pode convidar.' using errcode = '42501'; end if;
  insert into invites(workspace_id, kind, expires_at, max_uses, created_by)
  values (p_ws, p_kind, now() + make_interval(days => greatest(1, least(p_days, 60))), greatest(1, least(p_max, 200)), auth.uid())
  returning * into inv;
  return inv;
end $$;

-- Não deixa a empresa ficar com menos mesas do que pessoas sentadas
create or replace function public.workspaces_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.desks < old.desks and exists (select 1 from members where workspace_id = new.id and desk > new.desks) then
    raise exception 'Há pessoas sentadas nas mesas que seriam removidas. Libere essas mesas antes.' using errcode = '23514';
  end if;
  if new.created_by is not null and new.created_by is distinct from old.created_by then new.created_by := old.created_by; end if;
  return new;
end $$;
drop trigger if exists workspaces_guard on public.workspaces;
create trigger workspaces_guard before update on public.workspaces
  for each row execute function public.workspaces_guard();

-- ---------------------------------------------------------------- RLS
alter table public.workspaces    enable row level security;
alter table public.members       enable row level security;
alter table public.invites       enable row level security;
alter table public.catalog_items enable row level security;

drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces for select to authenticated using (public.is_member(id));
drop policy if exists ws_update on public.workspaces;
create policy ws_update on public.workspaces for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));
drop policy if exists ws_delete on public.workspaces;
create policy ws_delete on public.workspaces for delete to authenticated
  using (created_by = auth.uid() or (created_by is null and public.is_admin(id)));

drop policy if exists m_select on public.members;
create policy m_select on public.members for select to authenticated using (public.is_member(workspace_id));
drop policy if exists m_update on public.members;
create policy m_update on public.members for update to authenticated
  using (user_id = auth.uid() or public.is_admin(workspace_id))
  with check (user_id = auth.uid() or public.is_admin(workspace_id));
drop policy if exists m_delete on public.members;
create policy m_delete on public.members for delete to authenticated
  using (user_id = auth.uid() or public.is_admin(workspace_id));

drop policy if exists inv_admin on public.invites;
create policy inv_admin on public.invites for all to authenticated
  using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

drop policy if exists cat_select on public.catalog_items;
create policy cat_select on public.catalog_items for select to authenticated using (public.is_member(workspace_id));
drop policy if exists cat_write on public.catalog_items;
create policy cat_write on public.catalog_items for all to authenticated
  using (public.is_admin(workspace_id)) with check (public.is_admin(workspace_id));

-- Permissões das funções chamadas pelo site
revoke all on function public.create_workspace(text, text, int) from public, anon;
revoke all on function public.accept_invite(text)              from public, anon;
revoke all on function public.claim_desk(uuid, int)            from public, anon;
revoke all on function public.create_invite(uuid, public.member_kind, int, int) from public, anon;
revoke all on function public.invite_preview(text)             from public, anon;
grant execute on function public.create_workspace(text, text, int) to authenticated;
grant execute on function public.accept_invite(text)              to authenticated;
grant execute on function public.claim_desk(uuid, int)            to authenticated;
grant execute on function public.create_invite(uuid, public.member_kind, int, int) to authenticated;
grant execute on function public.invite_preview(text)             to authenticated;

-- Tempo real (usado a partir da etapa 2): mudanças em membros aparecem na hora para todos
do $$ begin
  alter publication supabase_realtime add table public.members;
exception when undefined_object or duplicate_object then null; end $$;
