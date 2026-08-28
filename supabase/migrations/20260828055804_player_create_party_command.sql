-- Remote migration version: 20260828055804.
-- Server-owned party creation. The browser never supplies a party id, name,
-- creation time, or actor identity.
create or replace function public.baekji_player_create_party_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint
)
returns table(status text, revision bigint, command_id uuid)
language plpgsql security definer set search_path = public, extensions
as $function$
declare
  v_identity record;
  v_world public.baekji_mvp_state_store%rowtype;
  v_preflight record;
  v_fingerprint text;
  v_actor jsonb;
  v_parties jsonb;
  v_party_id text;
  v_party jsonb;
  v_created_at bigint;
  v_state_next jsonb;
  v_attempt integer := 0;
begin
  -- command_fingerprint binds CREATE_PARTY_V1 to this immutable empty payload.
  v_fingerprint := encode(digest('CREATE_PARTY_V1', 'sha256'), 'hex');
  select * into v_preflight from public.baekji_player_world_command_preflight_v1(
    p_session_token, p_command_id, p_expected_revision, 'CREATE_PARTY_V1', 1, v_fingerprint
  );
  if v_preflight.status is not null then
    return query select v_preflight.status, v_preflight.revision, p_command_id;
    return;
  end if;
  select v_preflight.actor_account_id as account_id, v_preflight.actor_character_id as character_id into v_identity;
  v_world.state := v_preflight.world_state;
  v_world.revision := v_preflight.revision;

  v_actor := v_world.state #> array['characters', v_identity.character_id];
  -- The enclosing maps and optional actor bindings are validated before any
  -- JSON path mutation, so corrupt client-era state fails closed.
  v_parties := v_world.state -> 'parties';
  if coalesce(jsonb_typeof(v_world.state -> 'characters'), '') <> 'object'
     or v_actor is null or jsonb_typeof(v_actor) <> 'object'
     or v_parties is null or jsonb_typeof(v_parties) <> 'object'
     or (v_actor ? 'currentPartyId') and coalesce(jsonb_typeof(v_actor -> 'currentPartyId'), '') not in ('string', 'null')
     or (v_actor ? 'currentSessionId') and coalesce(jsonb_typeof(v_actor -> 'currentSessionId'), '') not in ('string', 'null')
     or coalesce(v_actor ->> 'currentPartyId', '') <> ''
     or coalesce(v_actor ->> 'currentSessionId', '') <> '' then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'CREATE_PARTY_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
    return;
  end if;

  loop
    v_party_id := 'party_' || replace(gen_random_uuid()::text, '-', '');
    exit when not (v_parties ? v_party_id);
    v_attempt := v_attempt + 1;
    if v_attempt >= 8 then raise exception using message = 'WORLD_STATE_UNAVAILABLE', errcode = 'P0001'; end if;
  end loop;
  v_created_at := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_party := jsonb_build_object(
    'id', v_party_id,
    'name', format('해오름역 조사조 %s', jsonb_object_length(v_parties) + 1),
    'creatorId', v_identity.character_id,
    'destination', 'E',
    'status', 'RECRUITING',
    'memberIds', jsonb_build_array(v_identity.character_id),
    'invitedIds', '[]'::jsonb,
    'declinedIds', '[]'::jsonb,
    'confirmedBy', '[]'::jsonb,
    'readyBy', '[]'::jsonb,
    'sessionId', 'null'::jsonb,
    'createdAt', v_created_at
  );
  v_state_next := jsonb_set(
    jsonb_set(v_world.state, array['parties', v_party_id], v_party, true),
    array['characters', v_identity.character_id, 'currentPartyId'], to_jsonb(v_party_id), true);
  update public.baekji_mvp_state_store
  set state = v_state_next, revision = revision + 1,
      writer_id = 'player-command:' || v_identity.account_id::text, updated_at = now()
  where state_key = 'day1_world'
  returning revision into v_world.revision;
  perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'CREATE_PARTY_V1', 1, v_fingerprint, 'APPLIED', v_world.revision);
  return query select 'APPLIED'::text, v_world.revision, p_command_id;
end;
$function$;

revoke all on function public.baekji_player_create_party_v1(text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.baekji_player_create_party_v1(text, uuid, bigint) to service_role;
