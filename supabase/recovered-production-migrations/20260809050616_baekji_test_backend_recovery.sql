create extension if not exists pgcrypto;

create table if not exists public.baekji_tester_accounts (
  id uuid primary key default gen_random_uuid(),
  character_name text not null,
  pin_hash text not null,
  profile_photo text not null,
  created_at timestamptz not null default now(),
  constraint baekji_tester_character_name_length check (char_length(btrim(character_name)) between 1 and 20),
  constraint baekji_tester_profile_photo_size check (char_length(profile_photo) <= 500000)
);

create unique index if not exists baekji_tester_accounts_name_unique
  on public.baekji_tester_accounts ((lower(btrim(character_name))));

alter table public.baekji_tester_accounts enable row level security;
revoke all on public.baekji_tester_accounts from anon, authenticated;

create table if not exists public.baekji_mvp_state_store (
  state_key text primary key,
  state jsonb not null,
  revision bigint not null default 1,
  writer_id text not null default '',
  updated_at timestamptz not null default now(),
  constraint baekji_mvp_state_revision_positive check (revision > 0)
);

alter table public.baekji_mvp_state_store enable row level security;
revoke all on public.baekji_mvp_state_store from anon, authenticated;

create or replace function public.baekji_tester_signup(
  p_character_name text,
  p_pin text,
  p_profile_photo text
)
returns table(id uuid, character_name text, profile_photo text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := btrim(coalesce(p_character_name, ''));
  v_row public.baekji_tester_accounts%rowtype;
begin
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
    returning * into v_row;
  exception when unique_violation then
    raise exception using message = 'CHARACTER_NAME_TAKEN', errcode = 'P0001';
  end;

  return query select v_row.id, v_row.character_name, v_row.profile_photo;
end;
$$;

create or replace function public.baekji_tester_login(
  p_character_name text,
  p_pin text
)
returns table(id uuid, character_name text, profile_photo text)
language sql
security definer
set search_path = public, extensions
as $$
  select a.id, a.character_name, a.profile_photo
  from public.baekji_tester_accounts a
  where lower(btrim(a.character_name)) = lower(btrim(coalesce(p_character_name, '')))
    and a.pin_hash = crypt(coalesce(p_pin, ''), a.pin_hash)
  limit 1
$$;

create or replace function public.baekji_tester_list_accounts()
returns table(id uuid, character_name text, profile_photo text)
language sql
security definer
set search_path = public
as $$
  select a.id, a.character_name, a.profile_photo
  from public.baekji_tester_accounts a
  order by a.created_at asc
$$;

create or replace function public.baekji_mvp_get_state(p_state_key text)
returns table(state jsonb, revision bigint, writer_id text, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.state, s.revision, s.writer_id, s.updated_at
  from public.baekji_mvp_state_store s
  where s.state_key = p_state_key
$$;

create or replace function public.baekji_mvp_get_revision(p_state_key text)
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce((select s.revision from public.baekji_mvp_state_store s where s.state_key = p_state_key), 0::bigint)
$$;

create or replace function public.baekji_mvp_put_state(
  p_state_key text,
  p_state jsonb,
  p_writer_id text,
  p_expected_revision bigint default null
)
returns table(accepted boolean, state jsonb, revision bigint, writer_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.baekji_mvp_state_store%rowtype;
begin
  if coalesce(p_state_key, '') = '' then
    raise exception using message = 'INVALID_STATE_KEY', errcode = 'P0001';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception using message = 'INVALID_STATE', errcode = 'P0001';
  end if;

  select * into v_current
  from public.baekji_mvp_state_store
  where state_key = p_state_key
  for update;

  if not found then
    insert into public.baekji_mvp_state_store(state_key, state, revision, writer_id)
    values (p_state_key, p_state, 1, coalesce(p_writer_id, ''))
    returning * into v_current;
    return query select true, v_current.state, v_current.revision, v_current.writer_id;
    return;
  end if;

  if p_expected_revision is null or p_expected_revision <> v_current.revision then
    return query select false, v_current.state, v_current.revision, v_current.writer_id;
    return;
  end if;

  update public.baekji_mvp_state_store s
  set state = p_state,
      revision = s.revision + 1,
      writer_id = coalesce(p_writer_id, ''),
      updated_at = now()
  where s.state_key = p_state_key
  returning s.* into v_current;

  return query select true, v_current.state, v_current.revision, v_current.writer_id;
end;
$$;

revoke all on function public.baekji_tester_signup(text, text, text) from public;
revoke all on function public.baekji_tester_login(text, text) from public;
revoke all on function public.baekji_tester_list_accounts() from public;
revoke all on function public.baekji_mvp_get_state(text) from public;
revoke all on function public.baekji_mvp_get_revision(text) from public;
revoke all on function public.baekji_mvp_put_state(text, jsonb, text, bigint) from public;

grant execute on function public.baekji_tester_signup(text, text, text) to anon, authenticated;
grant execute on function public.baekji_tester_login(text, text) to anon, authenticated;
grant execute on function public.baekji_tester_list_accounts() to anon, authenticated;
grant execute on function public.baekji_mvp_get_state(text) to anon, authenticated;
grant execute on function public.baekji_mvp_get_revision(text) to anon, authenticated;
grant execute on function public.baekji_mvp_put_state(text, jsonb, text, bigint) to anon, authenticated;