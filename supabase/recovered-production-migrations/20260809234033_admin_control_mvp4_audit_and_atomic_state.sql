create table if not exists public.baekji_admin_audit_logs (
  id bigint generated always as identity primary key,
  request_id text not null unique,
  admin_login_id text not null,
  admin_display_name text not null,
  action text not null,
  target_kind text not null,
  target_id text not null default '',
  summary text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  world_revision_before bigint not null,
  world_revision_after bigint not null,
  created_at timestamptz not null default now()
);

alter table public.baekji_admin_audit_logs enable row level security;
revoke all on table public.baekji_admin_audit_logs from anon, authenticated;

create index if not exists baekji_admin_audit_logs_created_idx on public.baekji_admin_audit_logs(created_at desc);
create index if not exists baekji_admin_audit_logs_target_idx on public.baekji_admin_audit_logs(target_kind, target_id, id desc);

create or replace function public.baekji_admin_state_apply(
  p_token text,
  p_state_key text,
  p_state jsonb,
  p_expected_revision bigint,
  p_request_id text,
  p_action text,
  p_target_kind text,
  p_target_id text,
  p_summary text,
  p_before_state jsonb default '{}'::jsonb,
  p_after_state jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns table(accepted boolean, already_applied boolean, state jsonb, revision bigint, audit_id bigint)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_hash text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_login_id text;
  v_display_name text;
  v_current public.baekji_mvp_state_store%rowtype;
  v_existing_audit bigint;
  v_audit_id bigint;
begin
  if coalesce(p_token, '') = '' then
    raise exception using message = 'ADMIN_SESSION_REQUIRED', errcode = 'P0001';
  end if;
  if coalesce(p_request_id, '') = '' then
    raise exception using message = 'ADMIN_REQUEST_ID_REQUIRED', errcode = 'P0001';
  end if;
  if coalesce(p_state_key, '') = '' or p_state is null or jsonb_typeof(p_state) <> 'object' or coalesce((p_state->>'version')::int, 0) <> 3 then
    raise exception using message = 'INVALID_STATE', errcode = 'P0001';
  end if;

  select a.login_id, a.display_name
    into v_login_id, v_display_name
  from public.baekji_admin_sessions s
  join public.baekji_admin_accounts a on a.login_id = s.admin_login_id
  where s.token_hash = v_hash
    and s.revoked_at is null
    and s.expires_at > now()
    and a.active = true
  limit 1;

  if v_login_id is null then
    raise exception using message = 'ADMIN_SESSION_INVALID', errcode = 'P0001';
  end if;

  select l.id into v_existing_audit
  from public.baekji_admin_audit_logs l
  where l.request_id = p_request_id
  limit 1;

  if v_existing_audit is not null then
    select * into v_current from public.baekji_mvp_state_store where state_key = p_state_key;
    return query select true, true, v_current.state, v_current.revision, v_existing_audit;
    return;
  end if;

  select * into v_current
  from public.baekji_mvp_state_store
  where state_key = p_state_key
  for update;

  if not found then
    raise exception using message = 'WORLD_STATE_UNAVAILABLE', errcode = 'P0001';
  end if;

  if p_expected_revision is null or p_expected_revision <> v_current.revision then
    return query select false, false, v_current.state, v_current.revision, null::bigint;
    return;
  end if;

  update public.baekji_mvp_state_store s
  set state = p_state,
      revision = s.revision + 1,
      writer_id = 'admin:' || v_login_id,
      updated_at = now()
  where s.state_key = p_state_key
  returning s.* into v_current;

  insert into public.baekji_admin_audit_logs(
    request_id, admin_login_id, admin_display_name, action, target_kind, target_id, summary,
    before_state, after_state, metadata, world_revision_before, world_revision_after
  ) values (
    p_request_id, v_login_id, v_display_name, left(coalesce(p_action, ''), 80), left(coalesce(p_target_kind, ''), 40), left(coalesce(p_target_id, ''), 180), left(coalesce(p_summary, ''), 500),
    coalesce(p_before_state, '{}'::jsonb), coalesce(p_after_state, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb), p_expected_revision, v_current.revision
  ) returning id into v_audit_id;

  update public.baekji_admin_sessions
  set last_seen_at = now()
  where token_hash = v_hash and revoked_at is null;

  return query select true, false, v_current.state, v_current.revision, v_audit_id;
end;
$function$;

create or replace function public.baekji_admin_audit_list(
  p_token text,
  p_after_id bigint default 0,
  p_limit integer default 100
)
returns table(
  id bigint,
  request_id text,
  admin_login_id text,
  admin_display_name text,
  action text,
  target_kind text,
  target_id text,
  summary text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  world_revision_before bigint,
  world_revision_after bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_hash text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_valid boolean;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
begin
  select exists(
    select 1
    from public.baekji_admin_sessions s
    join public.baekji_admin_accounts a on a.login_id = s.admin_login_id
    where s.token_hash = v_hash
      and s.revoked_at is null
      and s.expires_at > now()
      and a.active = true
  ) into v_valid;

  if not v_valid then
    raise exception using message = 'ADMIN_SESSION_INVALID', errcode = 'P0001';
  end if;

  if coalesce(p_after_id, 0) > 0 then
    return query
    select l.id, l.request_id, l.admin_login_id, l.admin_display_name, l.action, l.target_kind, l.target_id, l.summary,
           l.before_state, l.after_state, l.metadata, l.world_revision_before, l.world_revision_after, l.created_at
    from public.baekji_admin_audit_logs l
    where l.id > p_after_id
    order by l.id asc
    limit v_limit;
  else
    return query
    select x.id, x.request_id, x.admin_login_id, x.admin_display_name, x.action, x.target_kind, x.target_id, x.summary,
           x.before_state, x.after_state, x.metadata, x.world_revision_before, x.world_revision_after, x.created_at
    from (
      select l.* from public.baekji_admin_audit_logs l order by l.id desc limit v_limit
    ) x
    order by x.id asc;
  end if;
end;
$function$;

grant execute on function public.baekji_admin_state_apply(text,text,jsonb,bigint,text,text,text,text,text,jsonb,jsonb,jsonb) to anon, authenticated;
grant execute on function public.baekji_admin_audit_list(text,bigint,integer) to anon, authenticated;