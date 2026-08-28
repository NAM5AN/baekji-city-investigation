-- Remote migration version: 20260828055542.
create extension if not exists pgcrypto;

create table if not exists public.baekji_player_sessions (
  id uuid primary key default gen_random_uuid(),
  tester_account_id uuid not null references public.baekji_tester_accounts(id) on delete cascade,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint baekji_player_sessions_expiry_check check (expires_at > issued_at)
);

alter table public.baekji_player_sessions enable row level security;
revoke all on table public.baekji_player_sessions from public, anon, authenticated;
create index if not exists baekji_player_sessions_token_hash_idx on public.baekji_player_sessions(token_hash);
create index if not exists baekji_player_sessions_account_active_idx on public.baekji_player_sessions(tester_account_id, expires_at) where revoked_at is null;

create table if not exists public.baekji_player_login_throttles (
  login_key_hash text primary key,
  failure_count integer not null default 0 check (failure_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.baekji_player_login_throttles enable row level security;
revoke all on table public.baekji_player_login_throttles from public, anon, authenticated;
create index if not exists baekji_player_login_throttles_updated_at_idx on public.baekji_player_login_throttles(updated_at);

create or replace function public.baekji_player_login_v2(
  p_character_name text,
  p_pin text,
  p_session_token text,
  p_previous_session_token text default null
)
returns table(id uuid, character_name text, profile_photo text, session_id uuid, issued_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_account public.baekji_tester_accounts%rowtype;
  v_token_hash text;
  v_issued_at timestamptz := now();
  v_expires_at timestamptz := v_issued_at + interval '12 hours';
  v_session_id uuid;
  v_login_key_hash text := encode(digest(lower(btrim(coalesce(p_character_name, ''))), 'sha256'), 'hex');
  v_throttle public.baekji_player_login_throttles%rowtype;
begin
  if coalesce(p_session_token, '') !~ '^[A-Za-z0-9_-]{40,128}$' then
    raise exception using message = 'PLAYER_SESSION_TOKEN_INVALID', errcode = 'P0001';
  end if;

  delete from public.baekji_player_login_throttles
  where ctid in (
    select ctid
    from public.baekji_player_login_throttles
    where updated_at < v_issued_at - interval '30 days'
    limit 100
  );

  insert into public.baekji_player_login_throttles(login_key_hash)
  values (v_login_key_hash)
  on conflict (login_key_hash) do nothing;

  select * into v_throttle
  from public.baekji_player_login_throttles
  where login_key_hash = v_login_key_hash
  for update;

  if v_throttle.blocked_until > v_issued_at then
    raise exception using message = 'LOGIN_THROTTLED', errcode = 'P0001';
  end if;

  select * into v_account
  from public.baekji_tester_accounts a
  where lower(btrim(a.character_name)) = lower(btrim(coalesce(p_character_name, '')))
    and a.pin_hash = crypt(coalesce(p_pin, ''), a.pin_hash)
  limit 1;

  if not found then
    update public.baekji_player_login_throttles
    set failure_count = v_throttle.failure_count + 1,
        blocked_until = case
          when v_throttle.failure_count + 1 < 5 then null
          else v_issued_at + make_interval(secs => least(300, 30 * (2 ^ least(v_throttle.failure_count + 1 - 5, 4))::integer))
        end,
        updated_at = v_issued_at
    where login_key_hash = v_login_key_hash;
    return;
  end if;

  delete from public.baekji_player_login_throttles where login_key_hash = v_login_key_hash;

  v_token_hash := encode(digest(p_session_token, 'sha256'), 'hex');
  if coalesce(p_previous_session_token, '') ~ '^[A-Za-z0-9_-]{40,128}$' then
    update public.baekji_player_sessions
    set revoked_at = v_issued_at
    where token_hash = encode(digest(p_previous_session_token, 'sha256'), 'hex')
      and revoked_at is null
      and expires_at > v_issued_at;
  end if;

  insert into public.baekji_player_sessions(tester_account_id, token_hash, issued_at, expires_at, last_used_at)
  values (v_account.id, v_token_hash, v_issued_at, v_expires_at, v_issued_at)
  returning id into v_session_id;

  return query select v_account.id, v_account.character_name, v_account.profile_photo, v_session_id, v_issued_at, v_expires_at;
end;
$function$;

create or replace function public.baekji_player_signup_v2(
  p_character_name text,
  p_pin text,
  p_profile_photo text,
  p_session_token text,
  p_previous_session_token text default null
)
returns table(id uuid, character_name text, profile_photo text, session_id uuid, issued_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_name text := btrim(coalesce(p_character_name, ''));
  v_account public.baekji_tester_accounts%rowtype;
  v_issued_at timestamptz := now();
  v_expires_at timestamptz := v_issued_at + interval '12 hours';
  v_session_id uuid;
begin
  if coalesce(p_session_token, '') !~ '^[A-Za-z0-9_-]{40,128}$' then
    raise exception using message = 'PLAYER_SESSION_TOKEN_INVALID', errcode = 'P0001';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception using message = 'INVALID_CHARACTER_NAME', errcode = 'P0001';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception using message = 'INVALID_PIN', errcode = 'P0001';
  end if;
  if coalesce(p_profile_photo, '') !~ '^data:image/(jpeg|jpg|png|webp);base64,' then
    raise exception using message = 'INVALID_PROFILE_PHOTO', errcode = 'P0001';
  end if;
  if char_length(p_profile_photo) > 500000 then
    raise exception using message = 'PROFILE_PHOTO_TOO_LARGE', errcode = 'P0001';
  end if;
  if (select count(*) from public.baekji_tester_accounts) >= 200 then
    raise exception using message = 'SIGNUP_LIMIT_REACHED', errcode = 'P0001';
  end if;

  begin
    insert into public.baekji_tester_accounts(character_name, pin_hash, profile_photo)
    values (v_name, crypt(p_pin, gen_salt('bf', 8)), p_profile_photo)
    returning * into v_account;
  exception when unique_violation then
    raise exception using message = 'CHARACTER_NAME_TAKEN', errcode = 'P0001';
  end;

  if coalesce(p_previous_session_token, '') ~ '^[A-Za-z0-9_-]{40,128}$' then
    update public.baekji_player_sessions
    set revoked_at = v_issued_at
    where token_hash = encode(digest(p_previous_session_token, 'sha256'), 'hex')
      and revoked_at is null
      and expires_at > v_issued_at;
  end if;

  insert into public.baekji_player_sessions(tester_account_id, token_hash, issued_at, expires_at, last_used_at)
  values (v_account.id, encode(digest(p_session_token, 'sha256'), 'hex'), v_issued_at, v_expires_at, v_issued_at)
  returning id into v_session_id;

  return query select v_account.id, v_account.character_name, v_account.profile_photo, v_session_id, v_issued_at, v_expires_at;
end;
$function$;

create or replace function public.baekji_player_session_verify_v2(p_session_token text)
returns table(account_id uuid, character_id text, character_name text, profile_photo text, session_id uuid, issued_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_now timestamptz := now();
begin
  if coalesce(p_session_token, '') !~ '^[A-Za-z0-9_-]{40,128}$' then
    return;
  end if;

  select a.id, a.id::text, a.character_name, a.profile_photo, s.id, s.issued_at, s.expires_at
  into account_id, character_id, character_name, profile_photo, session_id, issued_at, expires_at
  from public.baekji_player_sessions s
  join public.baekji_tester_accounts a on a.id = s.tester_account_id
  where s.tester_account_id = a.id
    and s.token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > v_now
  for update of s;

  if found then
    update public.baekji_player_sessions
    set last_used_at = v_now
    where id = session_id
      and last_used_at <= v_now - interval '60 seconds';
    return next;
  end if;
end;
$function$;

create or replace function public.baekji_player_session_revoke_v2(p_session_token text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  with revoked as (
    update public.baekji_player_sessions
    set revoked_at = coalesce(revoked_at, now())
    where token_hash = encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
      and revoked_at is null
    returning id
  )
  select exists(select 1 from revoked)
$$;

create or replace function public.baekji_player_presence_ping_v2(
  p_session_token text,
  p_client_id text default ''
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_character_id text;
begin
  select character_id into v_character_id
  from public.baekji_player_session_verify_v2(p_session_token)
  limit 1;
  if v_character_id is null then
    raise exception using message = 'PLAYER_SESSION_INVALID', errcode = 'P0001';
  end if;
  insert into public.baekji_player_presence(character_id, client_id, last_seen_at)
  values (v_character_id, left(coalesce(p_client_id, ''), 180), now())
  on conflict (character_id) do update
    set client_id = excluded.client_id,
        last_seen_at = excluded.last_seen_at;
end;
$function$;

create or replace function public.baekji_player_admin_system_list_v2(
  p_session_token text,
  p_after_id bigint default 0,
  p_limit integer default 60
)
returns table(
  id bigint,
  sender_label text,
  target_kind text,
  target_label text,
  message text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, extensions
as $$
  select q.id, q.sender_label, q.target_kind, q.target_label, q.message, q.created_at
  from public.baekji_player_session_verify_v2(p_session_token) identity
  cross join lateral (
    select nullif(s.state #>> array['characters', identity.character_id, 'currentSessionId'], '') as current_session_id
    from public.baekji_mvp_state_store s
    where s.state_key = 'day1_world'
  ) current_world
  cross join lateral (
    select e.id, e.sender_label, e.target_kind, e.target_label, e.message, e.created_at
    from public.baekji_admin_system_events e
    where identity.character_id = any(e.recipient_character_ids)
      and current_world.current_session_id = any(e.recipient_session_ids)
      and e.id > greatest(coalesce(p_after_id, 0), 0)
    order by e.id desc
    limit least(greatest(coalesce(p_limit, 60), 1), 100)
  ) q
  order by q.id asc
$$;

revoke all on function public.baekji_player_login_v2(text, text, text, text) from public, anon, authenticated;
revoke all on function public.baekji_player_signup_v2(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.baekji_player_session_verify_v2(text) from public, anon, authenticated;
revoke all on function public.baekji_player_session_revoke_v2(text) from public, anon, authenticated;
revoke all on function public.baekji_player_presence_ping_v2(text, text) from public, anon, authenticated;
revoke all on function public.baekji_player_admin_system_list_v2(text, bigint, integer) from public, anon, authenticated;

grant execute on function public.baekji_player_login_v2(text, text, text, text) to service_role;
grant execute on function public.baekji_player_signup_v2(text, text, text, text, text) to service_role;
grant execute on function public.baekji_player_session_verify_v2(text) to service_role;
grant execute on function public.baekji_player_session_revoke_v2(text) to service_role;
grant execute on function public.baekji_player_presence_ping_v2(text, text) to service_role;
grant execute on function public.baekji_player_admin_system_list_v2(text, bigint, integer) to service_role;
