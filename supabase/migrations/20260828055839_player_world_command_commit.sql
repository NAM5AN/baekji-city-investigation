-- Remote migration version: 20260828055839.
-- Stage 8B command cutover: the application server is the only owner allowed
-- to read the canonical source document and submit a reducer result.  The
-- database remains authoritative for identity, idempotency and CAS.

create or replace function public.baekji_player_world_command_source_v1(
  p_session_token text
)
returns table(
  revision bigint,
  actor_account_id uuid,
  actor_character_id text,
  world_state jsonb,
  character_names jsonb
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identity record;
begin
  select * into v_identity
  from public.baekji_player_session_verify_v2(p_session_token)
  limit 1;
  if not found then
    raise exception using message = 'PLAYER_SESSION_INVALID', errcode = 'P0001';
  end if;

  return query
  select store.revision, v_identity.account_id, v_identity.character_id, store.state,
    (select coalesce(jsonb_object_agg(account.id::text, account.character_name), '{}'::jsonb)
     from public.baekji_tester_accounts as account)
  from public.baekji_mvp_state_store as store
  where store.state_key = 'day1_world';
end;
$function$;

-- Login/signup bootstrap is intentionally narrow: it creates only a missing
-- actor record and never rewrites, merges, or repairs an existing character.
create or replace function public.baekji_player_character_bootstrap_v1(
  p_session_token text
)
returns table(revision bigint, created boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identity record;
  v_world public.baekji_mvp_state_store%rowtype;
begin
  select * into v_identity
  from public.baekji_player_session_verify_v2(p_session_token)
  limit 1;
  if not found then
    raise exception using message = 'PLAYER_SESSION_INVALID', errcode = 'P0001';
  end if;

  select * into v_world
  from public.baekji_mvp_state_store as store
  where store.state_key = 'day1_world'
  for update;
  if not found or coalesce(jsonb_typeof(v_world.state -> 'characters'), '') <> 'object' then
    raise exception using message = 'WORLD_STATE_UNAVAILABLE', errcode = 'P0001';
  end if;

  if v_world.state -> 'characters' ? v_identity.character_id then
    return query select v_world.revision, false;
    return;
  end if;

  update public.baekji_mvp_state_store as store
  set state = jsonb_set(
        store.state,
        array['characters', v_identity.character_id],
        jsonb_build_object(
          'id', v_identity.character_id,
          'contamination', 0,
          'symptom', '안정',
          'inventory', '{}'::jsonb,
          'currentPartyId', null,
          'currentSessionId', null,
          'onlineAt', null
        ),
        true
      ),
      revision = store.revision + 1,
      writer_id = 'player-bootstrap:' || v_identity.account_id::text,
      updated_at = now()
  where store.state_key = 'day1_world'
  returning store.revision into v_world.revision;

  return query select v_world.revision, true;
end;
$function$;

create or replace function public.baekji_player_world_command_commit_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint,
  p_command_name text,
  p_command_fingerprint text,
  p_result_status text,
  p_next_state jsonb
)
returns table(status text, revision bigint, command_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_preflight record;
  v_revision bigint;
  v_actor jsonb;
begin
  if p_result_status not in ('APPLIED', 'NOOP', 'OUT_OF_SCOPE') then
    raise exception using message = 'INVALID_WORLD_COMMAND_RESULT', errcode = 'P0001';
  end if;

  select * into v_preflight
  from public.baekji_player_world_command_preflight_v1(
    p_session_token,
    p_command_id,
    p_expected_revision,
    p_command_name,
    1,
    p_command_fingerprint
  );

  if v_preflight.status is not null then
    return query select v_preflight.status, v_preflight.revision, p_command_id;
    return;
  end if;

  if p_result_status = 'APPLIED' then
    if coalesce(jsonb_typeof(p_next_state), '') <> 'object'
       or coalesce(p_next_state ->> 'version', '') <> '3'
       or coalesce(jsonb_typeof(p_next_state -> 'characters'), '') <> 'object'
       or coalesce(jsonb_typeof(p_next_state -> 'parties'), '') <> 'object'
       or coalesce(jsonb_typeof(p_next_state -> 'sessions'), '') <> 'object'
       or pg_column_size(p_next_state) > 8 * 1024 * 1024 then
      raise exception using message = 'INVALID_WORLD_STATE_RESULT', errcode = 'P0001';
    end if;

    v_actor := p_next_state #> array['characters', v_preflight.actor_character_id];
    if coalesce(jsonb_typeof(v_actor), '') <> 'object'
       or coalesce(v_actor ->> 'id', '') <> v_preflight.actor_character_id then
      raise exception using message = 'ACTOR_STATE_REQUIRED', errcode = 'P0001';
    end if;

    if p_next_state = v_preflight.world_state then
      p_result_status := 'NOOP';
    else
      update public.baekji_mvp_state_store as store
      set state = p_next_state,
          revision = store.revision + 1,
          writer_id = 'player-command:' || v_preflight.actor_account_id::text,
          updated_at = now()
      where store.state_key = 'day1_world'
        and store.revision = v_preflight.revision
      returning store.revision into v_revision;

      if v_revision is null then
        raise exception using message = 'WORLD_STATE_CAS_FAILED', errcode = '40001';
      end if;
    end if;
  end if;

  v_revision := coalesce(v_revision, v_preflight.revision);
  perform public.baekji_player_world_command_record_v1(
    v_preflight.actor_account_id,
    p_command_id,
    p_command_name,
    1,
    p_command_fingerprint,
    p_result_status,
    v_revision
  );
  return query select p_result_status, v_revision, p_command_id;
end;
$function$;

revoke all on function public.baekji_player_world_command_source_v1(text)
  from public, anon, authenticated;
revoke all on function public.baekji_player_character_bootstrap_v1(text)
  from public, anon, authenticated;
revoke all on function public.baekji_player_world_command_commit_v1(text, uuid, bigint, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.baekji_player_world_command_source_v1(text) to service_role;
grant execute on function public.baekji_player_character_bootstrap_v1(text) to service_role;
grant execute on function public.baekji_player_world_command_commit_v1(text, uuid, bigint, text, text, text, jsonb) to service_role;
