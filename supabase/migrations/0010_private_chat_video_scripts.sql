-- A mensagem pertence somente aos dois participantes. Remove políticas amplas
-- que possam ter sido criadas no projeto e não transmite o corpo pelo canal da sala.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='messages' loop
    execute format('drop policy %I on public.messages', p.policyname);
  end loop;
end $$;
alter table public.messages enable row level security;
create policy msg_select on public.messages for select to authenticated
  using (public.is_member(workspace_id) and (from_user=auth.uid() or to_user=auth.uid()));
revoke all on public.messages from anon;
revoke insert, update, delete on public.messages from authenticated;
grant select on public.messages to authenticated;
do $$ begin
  begin alter publication supabase_realtime drop table public.messages;
  exception when undefined_object or object_not_in_prerequisite_state then null;
  end;
end $$;

-- Uma ajuda vale apenas para a etapa em que foi solicitada.
create or replace function public._close_stage_help() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.etapa is distinct from new.etapa or (old.col is distinct from new.col and new.col='feito') then
    update public.task_help set status='cancelada', answered_at=coalesce(answered_at,now())
    where task_id=new.id and status in ('pendente','aceita');
  end if;
  return new;
end $$;
revoke all on function public._close_stage_help() from public,anon,authenticated;
drop trigger if exists close_stage_help on public.tasks;
create trigger close_stage_help after update of etapa,col on public.tasks
for each row execute function public._close_stage_help();
update public.task_help h set status='cancelada', answered_at=coalesce(h.answered_at,now())
from public.tasks t where h.task_id=t.id and h.status in ('pendente','aceita')
and (t.col='feito' or (t.etapa is not null and t.col='afazer'));

-- Um PDF privado por demanda de vídeo. O arquivo fica em Storage e a tarefa
-- guarda somente o caminho; nenhum link público permanente é criado.
alter table public.tasks add column if not exists script_path text;
create or replace function public.can_access_script(p_name text,p_write boolean default false) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.tasks t
    join public.members m on m.workspace_id=t.workspace_id and m.user_id=auth.uid()
    where p_name=t.workspace_id::text||'/'||t.id::text||'/roteiro.pdf'
      and public.is_member(t.workspace_id)
      and (not p_write or t.creator=auth.uid() or t.owner=auth.uid() or m.is_admin))
$$;
revoke all on function public.can_access_script(text,boolean) from public,anon;
grant execute on function public.can_access_script(text,boolean) to authenticated;

create or replace function public.set_task_script(p_task uuid,p_path text) returns void
language plpgsql security definer set search_path=public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id=p_task for update;
  if not found or t.etapa is null or not public.can_access_script(t.workspace_id::text||'/'||t.id::text||'/roteiro.pdf',true) then
    raise exception 'Você não pode alterar o roteiro desta demanda.' using errcode='42501';
  end if;
  if p_path is not null and p_path<>t.workspace_id::text||'/'||t.id::text||'/roteiro.pdf' then
    raise exception 'Caminho de roteiro inválido.' using errcode='22023';
  end if;
  update public.tasks set script_path=p_path,updated_at=now() where id=t.id;
end $$;
revoke all on function public.set_task_script(uuid,text) from public,anon;
grant execute on function public.set_task_script(uuid,text) to authenticated;

-- O bucket só existe no Supabase; a demonstração local não inclui Storage.
do $$ begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then return; end if;
  execute 'insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values (''task-scripts'',''task-scripts'',false,10485760,array[''application/pdf'']) on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array[''application/pdf'']';
  execute 'drop policy if exists task_scripts_read on storage.objects';
  execute 'drop policy if exists task_scripts_insert on storage.objects';
  execute 'drop policy if exists task_scripts_update on storage.objects';
  execute 'drop policy if exists task_scripts_delete on storage.objects';
  execute 'create policy task_scripts_read on storage.objects for select to authenticated using (bucket_id=''task-scripts'' and public.can_access_script(name,false))';
  execute 'create policy task_scripts_insert on storage.objects for insert to authenticated with check (bucket_id=''task-scripts'' and public.can_access_script(name,true))';
  execute 'create policy task_scripts_update on storage.objects for update to authenticated using (bucket_id=''task-scripts'' and public.can_access_script(name,true)) with check (bucket_id=''task-scripts'' and public.can_access_script(name,true))';
  execute 'create policy task_scripts_delete on storage.objects for delete to authenticated using (bucket_id=''task-scripts'' and public.can_access_script(name,true))';
end $$;
