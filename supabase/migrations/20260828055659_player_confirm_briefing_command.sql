-- Remote migration version: 20260828055659.
-- Stage 8B-B1: additive, server-only actor-bound briefing confirmation.
-- Do not revoke legacy whole-world writers in this migration; later command
-- slices must replace every reachable writer before that cutover is safe.
create table if not exists public.baekji_player_world_command_ledger (
  actor_account_id uuid not null references public.baekji_tester_accounts(id) on delete cascade,
  command_id uuid not null,
  command_name text not null,
  command_version integer not null,
  command_fingerprint text not null,
  result_status text not null check (result_status in ('APPLIED', 'NOOP', 'OUT_OF_SCOPE')),
  world_revision bigint not null check (world_revision >= 0),
  created_at timestamptz not null default now(),
  primary key (actor_account_id, command_id)
);

alter table public.baekji_player_world_command_ledger enable row level security;
revoke all on table public.baekji_player_world_command_ledger from public, anon, authenticated;
create index if not exists baekji_player_world_command_ledger_actor_created_idx on public.baekji_player_world_command_ledger(actor_account_id, created_at desc, command_id);

-- Shared, non-public command envelope.  Command functions remain the only
-- externally callable entry points; this helper centralizes their lock order
-- and replay semantics without widening the RPC surface.
create or replace function public.baekji_player_world_command_preflight_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint,
  p_command_name text,
  p_command_version integer,
  p_command_fingerprint text
)
returns table(
  status text,
  revision bigint,
  actor_account_id uuid,
  actor_character_id text,
  world_state jsonb
)
language plpgsql
security invoker
set search_path = public, extensions
as $function$
declare
  v_identity record;
  v_world public.baekji_mvp_state_store%rowtype;
  v_existing public.baekji_player_world_command_ledger%rowtype;
begin
  if p_command_id is null
     or p_expected_revision is null
     or p_expected_revision < 0
     or coalesce(p_command_name, '') !~ '^[A-Z][A-Z0-9_]{1,95}$'
     or p_command_version is null
     or p_command_version <> 1
     or coalesce(p_command_fingerprint, '') !~ '^[0-9a-f]{64}$' then
    raise exception using message = 'INVALID_WORLD_COMMAND', errcode = 'P0001';
  end if;

  select * into v_identity
  from public.baekji_player_session_verify_v2(p_session_token)
  limit 1;
  if not found then
    raise exception using message = 'PLAYER_SESSION_INVALID', errcode = 'P0001';
  end if;

  -- Every command takes the canonical world lock before its actor ledger.
  select * into v_world
  from public.baekji_mvp_state_store
  where state_key = 'day1_world'
  for update;
  if not found then
    raise exception using message = 'WORLD_STATE_UNAVAILABLE', errcode = 'P0001';
  end if;

  delete from public.baekji_player_world_command_ledger as stale
  where stale.ctid in (
    select retained.ctid
    from public.baekji_player_world_command_ledger as retained
    where retained.actor_account_id = v_identity.account_id
      and (
        retained.created_at < now() - interval '30 days'
        or retained.ctid in (
          select recent.ctid
          from public.baekji_player_world_command_ledger as recent
          where recent.actor_account_id = v_identity.account_id
          order by recent.created_at desc, recent.command_id desc
          offset 511
        )
      )
    limit 512
  );

  select * into v_existing
  from public.baekji_player_world_command_ledger as existing_command
  where existing_command.actor_account_id = v_identity.account_id
    and existing_command.command_id = p_command_id;
  if found then
    return query select
      case
        when v_existing.command_name <> p_command_name
          or v_existing.command_version <> p_command_version
          or v_existing.command_fingerprint <> p_command_fingerprint
          then 'COMMAND_ID_REUSED'
        when v_existing.result_status in ('APPLIED', 'NOOP') then 'REPLAY'
        else 'OUT_OF_SCOPE'
      end,
      v_existing.world_revision,
      v_identity.account_id,
      v_identity.character_id,
      v_world.state;
    return;
  end if;

  if p_expected_revision <> v_world.revision then
    return query select 'REVISION_CONFLICT', v_world.revision,
      v_identity.account_id, v_identity.character_id, v_world.state;
    return;
  end if;

  return query select null::text, v_world.revision,
    v_identity.account_id, v_identity.character_id, v_world.state;
end;
$function$;

create or replace function public.baekji_player_world_command_record_v1(
  p_actor_account_id uuid,
  p_command_id uuid,
  p_command_name text,
  p_command_version integer,
  p_command_fingerprint text,
  p_result_status text,
  p_world_revision bigint
)
returns void
language plpgsql
security invoker
set search_path = public, extensions
as $function$
begin
  if p_actor_account_id is null
     or p_command_id is null
     or coalesce(p_command_name, '') !~ '^[A-Z][A-Z0-9_]{1,95}$'
     or p_command_version is null
     or p_command_version <> 1
     or coalesce(p_command_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or p_result_status is null
     or p_result_status not in ('APPLIED', 'NOOP', 'OUT_OF_SCOPE')
     or p_world_revision is null
     or p_world_revision < 0 then
    raise exception using message = 'INVALID_WORLD_COMMAND_RESULT', errcode = 'P0001';
  end if;

  insert into public.baekji_player_world_command_ledger(
    actor_account_id, command_id, command_name, command_version,
    command_fingerprint, result_status, world_revision
  ) values (
    p_actor_account_id, p_command_id, p_command_name, p_command_version,
    p_command_fingerprint, p_result_status, p_world_revision
  );
end;
$function$;

-- Helpers are implementation details, not RPC endpoints.  SECURITY DEFINER
-- command owners retain implicit owner execution while every API role is
-- explicitly denied direct access.
revoke all on function public.baekji_player_world_command_preflight_v1(text, uuid, bigint, text, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.baekji_player_world_command_record_v1(uuid, uuid, text, integer, text, text, bigint) from public, anon, authenticated, service_role;

create or replace function public.baekji_player_confirm_briefing_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint
)
returns table(status text, revision bigint, command_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_world public.baekji_mvp_state_store%rowtype;
  v_preflight record;
  v_current_session_id text;
  v_party_id text;
  v_member_ids jsonb;
  v_confirmed jsonb;
  v_fingerprint text := encode(digest('CONFIRM_BRIEFING_V1:{}', 'sha256'), 'hex');
begin
  select * into v_preflight from public.baekji_player_world_command_preflight_v1(
    p_session_token, p_command_id, p_expected_revision,
    'CONFIRM_BRIEFING_V1', 1, v_fingerprint
  );
  if v_preflight.status is not null then
    return query select v_preflight.status, v_preflight.revision, p_command_id;
    return;
  end if;
  v_world.state := v_preflight.world_state;
  v_world.revision := v_preflight.revision;

  v_current_session_id := nullif(v_world.state #>> array['characters', v_preflight.actor_character_id, 'currentSessionId'], '');
  if v_current_session_id is null then
    perform public.baekji_player_world_command_record_v1(v_preflight.actor_account_id, p_command_id, 'CONFIRM_BRIEFING_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
    return;
  end if;

  v_party_id := nullif(v_world.state #>> array['sessions', v_current_session_id, 'partyId'], '');
  v_member_ids := coalesce(v_world.state #> array['sessions', v_current_session_id, 'memberIds'], '[]'::jsonb);
  if v_party_id is null
     or coalesce(v_world.state #>> array['sessions', v_current_session_id, 'status'], '') <> 'BRIEFING'
     or not (v_member_ids ? v_preflight.actor_character_id)
     or coalesce(v_world.state #>> array['parties', v_party_id, 'creatorId'], '') = ''
     or v_world.state #>> array['parties', v_party_id, 'creatorId'] = v_preflight.actor_character_id then
    perform public.baekji_player_world_command_record_v1(v_preflight.actor_account_id, p_command_id, 'CONFIRM_BRIEFING_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
    return;
  end if;

  v_confirmed := coalesce(v_world.state #> array['sessions', v_current_session_id, 'briefingConfirmedBy'], '[]'::jsonb);
  if v_confirmed ? v_preflight.actor_character_id then
    perform public.baekji_player_world_command_record_v1(v_preflight.actor_account_id, p_command_id, 'CONFIRM_BRIEFING_V1', 1, v_fingerprint, 'NOOP', v_world.revision);
    return query select 'NOOP'::text, v_world.revision, p_command_id;
    return;
  end if;

  update public.baekji_mvp_state_store
  set state = jsonb_set(
        state,
        array['sessions', v_current_session_id, 'briefingConfirmedBy'],
        v_confirmed || to_jsonb(v_preflight.actor_character_id),
        true
      ),
      revision = revision + 1,
      writer_id = 'player-command:' || v_preflight.actor_account_id::text,
      updated_at = now()
  where state_key = 'day1_world'
  returning revision into v_world.revision;

  perform public.baekji_player_world_command_record_v1(v_preflight.actor_account_id, p_command_id, 'CONFIRM_BRIEFING_V1', 1, v_fingerprint, 'APPLIED', v_world.revision);
  return query select 'APPLIED'::text, v_world.revision, p_command_id;
end;
$function$;

revoke all on function public.baekji_player_confirm_briefing_v1(text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.baekji_player_confirm_briefing_v1(text, uuid, bigint) to service_role;
