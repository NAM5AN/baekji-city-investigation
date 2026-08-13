alter table public.baekji_admin_system_events
  add column if not exists sender_label text not null default 'SYSTEM';

update public.baekji_admin_system_events
set sender_label = 'SYSTEM'
where btrim(coalesce(sender_label, '')) = '';

create or replace function public.baekji_admin_system_send(
  p_token text,
  p_target_kind text,
  p_target_id text,
  p_target_label text,
  p_message text,
  p_recipient_character_ids text[],
  p_recipient_session_ids text[],
  p_scope_snapshot jsonb default '{}'::jsonb
)
returns table(
  id bigint,
  login_id text,
  display_name text,
  target_kind text,
  target_id text,
  target_label text,
  message text,
  recipient_count integer,
  session_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_admin record;
  v_kind text := upper(btrim(coalesce(p_target_kind, '')));
  v_message text := btrim(coalesce(p_message, ''));
  v_sender text := left(coalesce(nullif(btrim(coalesce(p_scope_snapshot->>'senderLabel', '')), ''), 'SYSTEM'), 40);
  v_row public.baekji_admin_system_events%rowtype;
  v_chars text[] := coalesce(p_recipient_character_ids, '{}'::text[]);
  v_sessions text[] := coalesce(p_recipient_session_ids, '{}'::text[]);
begin
  select * into v_admin from public.baekji_admin_session_verify(p_token) limit 1;
  if not found then raise exception using message='ADMIN_SESSION_INVALID', errcode='P0001'; end if;
  if v_kind not in ('ALL','ZONE','PARTY','CHARACTER') then raise exception using message='INVALID_ADMIN_SYSTEM_TARGET', errcode='P0001'; end if;
  if char_length(v_message) < 1 or char_length(v_message) > 1600 then raise exception using message='INVALID_ADMIN_SYSTEM_MESSAGE', errcode='P0001'; end if;
  if cardinality(v_chars) < 1 or cardinality(v_sessions) < 1 then raise exception using message='ADMIN_SYSTEM_NO_RECIPIENTS', errcode='P0001'; end if;

  insert into public.baekji_admin_system_events(
    admin_login_id, target_kind, target_id, target_label, sender_label, message,
    recipient_character_ids, recipient_session_ids, scope_snapshot
  ) values (
    v_admin.login_id, v_kind, nullif(btrim(coalesce(p_target_id, '')), ''), left(coalesce(p_target_label, ''), 240), v_sender, v_message,
    v_chars, v_sessions, coalesce(p_scope_snapshot, '{}'::jsonb)
  ) returning * into v_row;

  return query select
    v_row.id, v_admin.login_id, v_admin.display_name, v_row.target_kind, v_row.target_id,
    v_row.target_label, v_row.message, cardinality(v_row.recipient_character_ids),
    cardinality(v_row.recipient_session_ids), v_row.created_at;
end;
$$;

drop function if exists public.baekji_admin_system_list(text, bigint, integer);
create function public.baekji_admin_system_list(
  p_token text,
  p_after_id bigint default 0,
  p_limit integer default 40
)
returns table(
  id bigint,
  login_id text,
  display_name text,
  sender_label text,
  target_kind text,
  target_id text,
  target_label text,
  message text,
  recipient_count integer,
  session_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_admin record;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  select * into v_admin from public.baekji_admin_session_verify(p_token) limit 1;
  if not found then raise exception using message='ADMIN_SESSION_INVALID', errcode='P0001'; end if;

  if coalesce(p_after_id, 0) > 0 then
    return query
    select e.id, a.login_id, a.display_name, e.sender_label, e.target_kind, e.target_id, e.target_label, e.message,
           cardinality(e.recipient_character_ids), cardinality(e.recipient_session_ids), e.created_at
    from public.baekji_admin_system_events e
    join public.baekji_admin_accounts a on a.login_id = e.admin_login_id
    where e.id > p_after_id
    order by e.id asc
    limit v_limit;
  else
    return query
    select q.id, q.login_id, q.display_name, q.sender_label, q.target_kind, q.target_id, q.target_label, q.message, q.recipient_count, q.session_count, q.created_at
    from (
      select e.id, a.login_id, a.display_name, e.sender_label, e.target_kind, e.target_id, e.target_label, e.message,
             cardinality(e.recipient_character_ids) as recipient_count,
             cardinality(e.recipient_session_ids) as session_count,
             e.created_at
      from public.baekji_admin_system_events e
      join public.baekji_admin_accounts a on a.login_id = e.admin_login_id
      order by e.id desc
      limit v_limit
    ) q
    order by q.id asc;
  end if;
end;
$$;

drop function if exists public.baekji_player_admin_system_list(text, bigint, integer);
create function public.baekji_player_admin_system_list(
  p_character_id text,
  p_after_id bigint default 0,
  p_limit integer default 60
)
returns table(
  id bigint,
  admin_name text,
  sender_label text,
  target_kind text,
  target_label text,
  message text,
  recipient_session_ids text[],
  created_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select q.id, q.admin_name, q.sender_label, q.target_kind, q.target_label, q.message, q.recipient_session_ids, q.created_at
  from (
    select e.id, a.display_name as admin_name, e.sender_label, e.target_kind, e.target_label, e.message, e.recipient_session_ids, e.created_at
    from public.baekji_admin_system_events e
    join public.baekji_admin_accounts a on a.login_id = e.admin_login_id
    where btrim(coalesce(p_character_id, '')) <> ''
      and btrim(p_character_id) = any(e.recipient_character_ids)
      and e.id > greatest(coalesce(p_after_id, 0), 0)
    order by e.id desc
    limit least(greatest(coalesce(p_limit, 60), 1), 100)
  ) q
  order by q.id asc
$$;

grant execute on function public.baekji_admin_system_send(text, text, text, text, text, text[], text[], jsonb) to public, anon, authenticated, service_role;
grant execute on function public.baekji_admin_system_list(text, bigint, integer) to public, anon, authenticated, service_role;
grant execute on function public.baekji_player_admin_system_list(text, bigint, integer) to public, anon, authenticated, service_role;