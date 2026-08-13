create table if not exists public.baekji_admin_accounts (
  login_id text primary key,
  display_name text not null,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint baekji_admin_login_id_format check (login_id ~ '^[A-Za-z0-9_-]{2,40}$')
);

create unique index if not exists baekji_admin_accounts_login_id_lower_idx
  on public.baekji_admin_accounts ((lower(login_id)));

create table if not exists public.baekji_admin_sessions (
  token_hash text primary key,
  admin_login_id text not null references public.baekji_admin_accounts(login_id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists baekji_admin_sessions_admin_idx on public.baekji_admin_sessions(admin_login_id);
create index if not exists baekji_admin_sessions_expiry_idx on public.baekji_admin_sessions(expires_at);

alter table public.baekji_admin_accounts enable row level security;
alter table public.baekji_admin_sessions enable row level security;
revoke all on public.baekji_admin_accounts from anon, authenticated;
revoke all on public.baekji_admin_sessions from anon, authenticated;

create or replace function public.baekji_admin_login(p_login_id text, p_password text)
returns table(session_token text, login_id text, display_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_admin public.baekji_admin_accounts%rowtype;
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
begin
  select * into v_admin
  from public.baekji_admin_accounts a
  where lower(a.login_id) = lower(btrim(coalesce(p_login_id, '')))
    and a.active = true
    and a.password_hash = crypt(coalesce(p_password, ''), a.password_hash)
  limit 1;

  if not found then
    return;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.baekji_admin_sessions(token_hash, admin_login_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_admin.login_id, v_expires);

  delete from public.baekji_admin_sessions
  where expires_at <= now() or revoked_at is not null;

  return query select v_token, v_admin.login_id, v_admin.display_name, v_expires;
end;
$function$;

create or replace function public.baekji_admin_session_check(p_session_token text)
returns table(login_id text, display_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_hash text := encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex');
begin
  update public.baekji_admin_sessions s
  set last_seen_at = now()
  from public.baekji_admin_accounts a
  where s.token_hash = v_hash
    and s.admin_login_id = a.login_id
    and a.active = true
    and s.revoked_at is null
    and s.expires_at > now();

  return query
  select a.login_id, a.display_name, s.expires_at
  from public.baekji_admin_sessions s
  join public.baekji_admin_accounts a on a.login_id = s.admin_login_id
  where s.token_hash = v_hash
    and a.active = true
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;
end;
$function$;

create or replace function public.baekji_admin_logout(p_session_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_count integer;
begin
  update public.baekji_admin_sessions
  set revoked_at = now()
  where token_hash = encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
    and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

grant execute on function public.baekji_admin_login(text, text) to anon, authenticated;
grant execute on function public.baekji_admin_session_check(text) to anon, authenticated;
grant execute on function public.baekji_admin_logout(text) to anon, authenticated;
