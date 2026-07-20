-- 백지도시 조사 홈페이지 MVP Supabase 초안
-- 로컬 프로토타입의 상태 계층을 서버 권한형 Postgres/RPC로 교체하기 위한 첫 migration.

create extension if not exists pgcrypto;

create type public.party_status as enum (
  'RECRUITING', 'COMPOSITION_CONFIRMED', 'READY_CHECK', 'LOCKED', 'SESSION_CREATED', 'CLOSED'
);
create type public.session_status as enum (
  'BRIEFING', 'ACTIVE', 'PAUSED_ERROR', 'COMPLETED', 'CANCELLED'
);
create type public.member_connection_status as enum ('ONLINE', 'AFK', 'DISCONNECTED');
create type public.event_type as enum ('SCENE', 'RISK', 'SUCCESS', 'FAIL', 'ITEM', 'SYSTEM');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  character_name text not null,
  is_test_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_characters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  character_id uuid not null unique references public.characters(id) on delete restrict
);

create table public.world_loops (
  id uuid primary key default gen_random_uuid(),
  story_day integer not null check (story_day between 1 and 10),
  loop_no integer not null check (loop_no > 0),
  status text not null default 'ACTIVE',
  started_at timestamptz not null default now(),
  unique (story_day, loop_no)
);

create table public.character_states (
  character_id uuid primary key references public.characters(id) on delete cascade,
  contamination integer not null default 0 check (contamination between 0 and 100),
  symptom_stage text not null default 'STABLE',
  current_party_id uuid,
  current_session_id uuid,
  updated_at timestamptz not null default now()
);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  creator_character_id uuid not null references public.characters(id),
  name text not null,
  destination_zone text not null check (destination_zone in ('E')),
  status public.party_status not null default 'RECRUITING',
  created_at timestamptz not null default now()
);

create table public.party_members (
  party_id uuid not null references public.parties(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  composition_confirmed_at timestamptz,
  ready_at timestamptz,
  primary key (party_id, character_id)
);

create table public.investigation_sessions (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null unique references public.parties(id) on delete restrict,
  world_loop_id uuid not null references public.world_loops(id),
  zone_code text not null check (zone_code = 'E'),
  variant_code text not null check (variant_code in ('a','b','c','d')),
  status public.session_status not null default 'BRIEFING',
  current_node text not null default 'E_ENTRY',
  active_route_id text,
  current_hazard_index integer,
  event_sequence bigint not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.session_members (
  session_id uuid not null references public.investigation_sessions(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete restrict,
  connection_status public.member_connection_status not null default 'DISCONNECTED',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (session_id, character_id)
);

create table public.session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.investigation_sessions(id) on delete cascade,
  sequence_no bigint not null,
  event_type public.event_type not null,
  actor_character_id uuid references public.characters(id),
  event_code text,
  public_text text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, sequence_no)
);

create table public.route_encounters (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.investigation_sessions(id) on delete cascade,
  route_id text not null,
  target_node text not null,
  hazard_ids text[] not null,
  current_hazard_index integer not null default 0,
  ambient_rule_id text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index route_encounters_one_active_per_session
  on public.route_encounters(session_id) where resolved = false;

create table public.hazard_resolutions (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.route_encounters(id) on delete cascade,
  hazard_index integer not null,
  actor_character_id uuid not null references public.characters(id),
  action_text text not null,
  used_inventory_item_id uuid,
  outcome text not null check (outcome in ('SUCCESS','PARTIAL','FAIL')),
  contamination_rule_id text not null,
  contamination_delta integer not null default 0 check (contamination_delta between 0 and 100),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  unique (encounter_id, hazard_index)
);

create table public.object_states (
  session_id uuid not null references public.investigation_sessions(id) on delete cascade,
  object_id text not null,
  inspected_at timestamptz,
  inspected_by uuid references public.characters(id),
  state_code text not null default 'DEFAULT',
  primary key (session_id, object_id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  world_loop_id uuid not null references public.world_loops(id),
  source_object_id text not null,
  item_id text not null,
  quantity integer not null check (quantity > 0),
  item_state text not null default 'CLEAN',
  created_at timestamptz not null default now(),
  unique (character_id, world_loop_id, source_object_id, item_id)
);

create table public.action_idempotency (
  key uuid primary key,
  user_id uuid not null references auth.users(id),
  action_name text not null,
  response jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.user_characters enable row level security;
alter table public.world_loops enable row level security;
alter table public.character_states enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.investigation_sessions enable row level security;
alter table public.session_members enable row level security;
alter table public.session_events enable row level security;
alter table public.route_encounters enable row level security;
alter table public.hazard_resolutions enable row level security;
alter table public.object_states enable row level security;
alter table public.inventory_items enable row level security;
alter table public.action_idempotency enable row level security;

create or replace function public.current_character_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select character_id from public.user_characters where user_id = auth.uid()
$$;

create or replace function public.is_session_member(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.session_members
    where session_id = target_session_id
      and character_id = public.current_character_id()
  )
$$;

create policy profiles_self_read on public.profiles
for select using (user_id = auth.uid());

create policy user_character_self_read on public.user_characters
for select using (user_id = auth.uid());

create policy characters_connected_read on public.characters
for select using (
  id = public.current_character_id()
  or exists (
    select 1
    from public.party_members mine
    join public.party_members other on other.party_id = mine.party_id
    where mine.character_id = public.current_character_id()
      and other.character_id = characters.id
  )
);

create policy character_state_self_read on public.character_states
for select using (character_id = public.current_character_id());

create policy party_member_read on public.parties
for select using (
  exists (select 1 from public.party_members pm where pm.party_id = id and pm.character_id = public.current_character_id())
);

create policy party_members_same_party_read on public.party_members
for select using (
  exists (
    select 1 from public.party_members mine
    where mine.party_id = party_members.party_id and mine.character_id = public.current_character_id()
  )
);

create policy session_member_read on public.investigation_sessions
for select using (public.is_session_member(id));

create policy session_members_same_session_read on public.session_members
for select using (public.is_session_member(session_id));

create policy session_events_member_read on public.session_events
for select using (public.is_session_member(session_id));

create policy encounter_member_read on public.route_encounters
for select using (public.is_session_member(session_id));

create policy resolution_member_read on public.hazard_resolutions
for select using (
  exists (
    select 1 from public.route_encounters e
    where e.id = hazard_resolutions.encounter_id and public.is_session_member(e.session_id)
  )
);

create policy object_state_member_read on public.object_states
for select using (public.is_session_member(session_id));

create policy inventory_owner_read on public.inventory_items
for select using (character_id = public.current_character_id());

create policy idempotency_owner_read on public.action_idempotency
for select using (user_id = auth.uid());

-- 모든 쓰기는 아래와 같은 SECURITY DEFINER RPC로만 수행한다.
-- 실제 route/object/risk master data는 JSON import 후 정적 테이블로 분리한다.

create or replace function public.rpc_set_party_ready(target_party_id uuid, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_character_id();
  result jsonb;
begin
  if cid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  insert into public.action_idempotency(key, user_id, action_name)
  values (request_key, auth.uid(), 'rpc_set_party_ready')
  on conflict (key) do nothing;

  if not found then
    return (select response from public.action_idempotency where key = request_key);
  end if;

  update public.party_members
  set ready_at = coalesce(ready_at, now())
  where party_id = target_party_id and character_id = cid and accepted_at is not null;

  if not found then raise exception 'PARTY_MEMBER_NOT_FOUND'; end if;

  update public.parties p
  set status = 'READY_CHECK'
  where p.id = target_party_id and p.status = 'COMPOSITION_CONFIRMED';

  result := jsonb_build_object('party_id', target_party_id, 'character_id', cid, 'ready', true);
  update public.action_idempotency set response = result where key = request_key;
  return result;
end;
$$;

create or replace function public.rpc_inspect_object(
  target_session_id uuid,
  target_object_id text,
  request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_character_id();
  result jsonb;
begin
  if not public.is_session_member(target_session_id) then raise exception 'SESSION_ACCESS_DENIED'; end if;

  insert into public.action_idempotency(key, user_id, action_name)
  values (request_key, auth.uid(), 'rpc_inspect_object')
  on conflict (key) do nothing;
  if not found then return (select response from public.action_idempotency where key = request_key); end if;

  insert into public.object_states(session_id, object_id, inspected_at, inspected_by)
  values (target_session_id, target_object_id, now(), cid)
  on conflict (session_id, object_id)
  do update set inspected_at = coalesce(public.object_states.inspected_at, excluded.inspected_at),
                inspected_by = coalesce(public.object_states.inspected_by, excluded.inspected_by);

  result := jsonb_build_object('session_id', target_session_id, 'object_id', target_object_id, 'inspected', true);
  update public.action_idempotency set response = result where key = request_key;
  return result;
end;
$$;

revoke all on public.profiles, public.characters, public.user_characters, public.world_loops,
  public.character_states, public.parties, public.party_members, public.investigation_sessions,
  public.session_members, public.session_events, public.route_encounters, public.hazard_resolutions,
  public.object_states, public.inventory_items, public.action_idempotency from anon, authenticated;
grant select on public.profiles, public.characters, public.user_characters, public.character_states,
  public.parties, public.party_members, public.investigation_sessions, public.session_members,
  public.session_events, public.route_encounters, public.hazard_resolutions, public.object_states,
  public.inventory_items to authenticated;
grant execute on function public.current_character_id() to authenticated;
grant execute on function public.is_session_member(uuid) to authenticated;
grant execute on function public.rpc_set_party_ready(uuid, uuid) to authenticated;
grant execute on function public.rpc_inspect_object(uuid, text, uuid) to authenticated;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Keep helper/RPC functions unavailable to anon.
revoke execute on function public.current_character_id() from public, anon;
revoke execute on function public.is_session_member(uuid) from public, anon;
revoke execute on function public.rpc_set_party_ready(uuid, uuid) from public, anon;
revoke execute on function public.rpc_inspect_object(uuid, text, uuid) from public, anon;
