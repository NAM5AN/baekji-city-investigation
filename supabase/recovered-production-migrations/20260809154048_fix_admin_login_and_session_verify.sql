create or replace function public.baekji_admin_login(p_login_id text, p_password text)
returns table(session_token text, login_id text, display_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
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

  delete from public.baekji_admin_sessions s
  where s.expires_at <= now() or s.revoked_at is not null;

  return query select v_token, v_admin.login_id, v_admin.display_name, v_expires;
end;
$$;

create or replace function public.baekji_admin_session_verify(p_token text)
returns table(login_id text, display_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_hash text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
begin
  if coalesce(p_token, '') = '' then
    return;
  end if;

  update public.baekji_admin_sessions s
  set last_seen_at = now()
  where s.token_hash = v_hash
    and s.revoked_at is null
    and s.expires_at > now();

  return query
  select a.login_id, a.display_name, s.expires_at
  from public.baekji_admin_sessions s
  join public.baekji_admin_accounts a on a.login_id = s.admin_login_id
  where s.token_hash = v_hash
    and s.revoked_at is null
    and s.expires_at > now()
    and a.active = true
  limit 1;
end;
$$;

grant execute on function public.baekji_admin_login(text, text) to anon, authenticated, service_role;
grant execute on function public.baekji_admin_session_verify(text) to anon, authenticated, service_role;