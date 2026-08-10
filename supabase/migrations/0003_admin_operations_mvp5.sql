create table if not exists public.baekji_player_presence (
  character_id text primary key,
  client_id text not null default '',
  last_seen_at timestamptz not null default now()
);

alter table public.baekji_player_presence enable row level security;
revoke all on table public.baekji_player_presence from anon, authenticated;
create index if not exists baekji_player_presence_seen_idx on public.baekji_player_presence(last_seen_at desc);

create or replace function public.baekji_player_presence_ping(
  p_character_id text,
  p_client_id text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(btrim(p_character_id), '') = '' or length(p_character_id) > 180 then
    raise exception using message = 'INVALID_CHARACTER_ID', errcode = 'P0001';
  end if;

  insert into public.baekji_player_presence(character_id, client_id, last_seen_at)
  values (left(btrim(p_character_id), 180), left(coalesce(p_client_id, ''), 180), now())
  on conflict (character_id) do update
    set client_id = excluded.client_id,
        last_seen_at = excluded.last_seen_at;
end;
$function$;

create or replace function public.baekji_admin_presence_list(
  p_token text
)
returns table(character_id text, last_seen_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_hash text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_valid boolean;
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

  return query
  select p.character_id, p.last_seen_at
  from public.baekji_player_presence p
  order by p.last_seen_at desc;
end;
$function$;

grant execute on function public.baekji_player_presence_ping(text,text) to anon, authenticated;
grant execute on function public.baekji_admin_presence_list(text) to anon, authenticated;
