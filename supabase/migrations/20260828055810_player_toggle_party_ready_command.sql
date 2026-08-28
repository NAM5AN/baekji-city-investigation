-- Remote migration version: 20260828055810.
-- Actor-bound readiness toggle. The browser supplies only the party target;
-- the session token determines the actor and the server supplies the marker
-- timestamp. The canonical world row is locked before the per-actor ledger.
create or replace function public.baekji_player_toggle_party_ready_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint,
  p_party_id text
)
returns table(status text, revision bigint, command_id uuid)
language plpgsql security definer set search_path = public, extensions
as $function$
declare
  v_identity record;
  v_world public.baekji_mvp_state_store%rowtype;
  v_preflight record;
  v_fingerprint text;
  v_party jsonb;
  v_actor jsonb;
  v_members jsonb;
  v_ready jsonb;
  v_ready_state jsonb;
  v_ready_state_next jsonb;
  v_ready_next jsonb;
  v_flow_text text;
  v_flow_next bigint;
  v_status text;
  v_status_next text;
  v_now_ms bigint;
  v_actor_ready boolean;
  v_state_next jsonb;
begin
  if coalesce(p_party_id, '') !~ '^[A-Za-z0-9_-]{1,96}$' then
    raise exception using message = 'INVALID_WORLD_COMMAND', errcode = 'P0001';
  end if;

  v_fingerprint := encode(digest('TOGGLE_PARTY_READY_V1:' || p_party_id, 'sha256'), 'hex');
  select * into v_preflight from public.baekji_player_world_command_preflight_v1(
    p_session_token, p_command_id, p_expected_revision, 'TOGGLE_PARTY_READY_V1', 1, v_fingerprint
  );
  if v_preflight.status is not null then
    return query select v_preflight.status, v_preflight.revision, p_command_id;
    return;
  end if;
  select v_preflight.actor_account_id as account_id, v_preflight.actor_character_id as character_id into v_identity;
  v_world.state := v_preflight.world_state;
  v_world.revision := v_preflight.revision;

  v_party := v_world.state #> array['parties', p_party_id];
  v_actor := v_world.state #> array['characters', v_identity.character_id];
  v_members := coalesce(v_party -> 'memberIds', '[]'::jsonb);
  v_ready := coalesce(v_party -> 'readyBy', '[]'::jsonb);
  v_ready_state := coalesce(v_party -> 'readyStateBy', '{}'::jsonb);
  v_flow_text := coalesce(v_party ->> 'flowRevision', '0');
  v_status := coalesce(v_party ->> 'status', '');

  -- The state checks match the browser's legacy readiness projection: a
  -- readyStateBy object marker with boolean .ready wins, then a boolean
  -- marker, then membership of readyBy. Ambiguous arrays and malformed or
  -- foreign markers fail closed instead of being silently repaired here.
  if coalesce(jsonb_typeof(v_party), '') <> 'object'
     or coalesce(jsonb_typeof(v_actor), '') <> 'object'
     or jsonb_typeof(v_members) <> 'array'
     or jsonb_typeof(v_ready) <> 'array'
     or jsonb_typeof(v_ready_state) <> 'object'
     or coalesce(jsonb_typeof(v_party -> 'creatorId'), '') <> 'string'
     or coalesce(jsonb_typeof(v_party -> 'status'), '') <> 'string'
     or (v_party ? 'sessionId') and coalesce(jsonb_typeof(v_party -> 'sessionId'), '') not in ('string', 'null')
     or (v_actor ? 'currentPartyId') and coalesce(jsonb_typeof(v_actor -> 'currentPartyId'), '') not in ('string', 'null')
     or (v_actor ? 'currentSessionId') and coalesce(jsonb_typeof(v_actor -> 'currentSessionId'), '') not in ('string', 'null')
     or (v_party ? 'flowRevision') and (coalesce(jsonb_typeof(v_party -> 'flowRevision'), '') <> 'number'
       or v_flow_text !~ '^[0-9]{1,16}$'
       or case when v_flow_text ~ '^[0-9]{1,16}$' then v_flow_text::bigint > 9007199254740990 else false end) then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'TOGGLE_PARTY_READY_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
    return;
  end if;

  if exists(select 1 from jsonb_array_elements(v_members) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[A-Za-z0-9_-]{1,96}$')
     or exists(select 1 from jsonb_array_elements(v_ready) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[A-Za-z0-9_-]{1,96}$')
     or (select count(*) <> count(distinct e #>> '{}') from jsonb_array_elements(v_members) e)
     or (select count(*) <> count(distinct e #>> '{}') from jsonb_array_elements(v_ready) e)
     or exists(select 1 from jsonb_array_elements(v_ready) e where not (v_members ? (e #>> '{}')))
     or exists(
       select 1
       from jsonb_each(v_ready_state) as markers(member_id, marker_value)
       where not (v_members ? member_id)
          or not (
            jsonb_typeof(marker_value) = 'boolean'
            or (
              jsonb_typeof(marker_value) = 'object'
              and jsonb_typeof(marker_value -> 'ready') = 'boolean'
              and (
                not (marker_value ? 'at')
                or (
                  jsonb_typeof(marker_value -> 'at') = 'number'
                  and coalesce(marker_value ->> 'at', '') ~ '^[0-9]{1,16}$'
                  and case
                    when coalesce(marker_value ->> 'at', '') ~ '^[0-9]{1,16}$'
                    then (marker_value ->> 'at')::bigint <= 9007199254740991
                    else false
                  end
                )
              )
            )
          )
     )
     or coalesce(v_party ->> 'creatorId', '') !~ '^[A-Za-z0-9_-]{1,96}$'
     or not (v_members ? coalesce(v_party ->> 'creatorId', ''))
     or coalesce(v_party ->> 'creatorId', '') = v_identity.character_id
     or not (v_members ? v_identity.character_id)
     or coalesce(v_actor ->> 'currentPartyId', '') <> p_party_id
     or coalesce(v_actor ->> 'currentSessionId', '') <> ''
     or coalesce(v_party ->> 'sessionId', '') <> ''
     or v_status not in ('RECRUITING', 'COMPOSITION_CONFIRMED', 'READY_CHECK') then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'TOGGLE_PARTY_READY_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
    return;
  end if;

  -- Compute the actor's current readiness before replacing that one marker.
  -- This is the exact object-boolean / boolean / readyBy precedence used by
  -- runtime-domain-rules.js.
  v_actor_ready := case
    when jsonb_typeof(v_ready_state -> v_identity.character_id) = 'object'
         and jsonb_typeof(v_ready_state -> v_identity.character_id -> 'ready') = 'boolean'
      then (v_ready_state -> v_identity.character_id ->> 'ready')::boolean
    when jsonb_typeof(v_ready_state -> v_identity.character_id) = 'boolean'
      then (v_ready_state ->> v_identity.character_id)::boolean
    else v_ready ? v_identity.character_id
  end;
  v_now_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_ready_state_next := jsonb_set(
    v_ready_state,
    array[v_identity.character_id],
    jsonb_build_object('ready', not v_actor_ready, 'at', v_now_ms),
    true
  );

  -- readyBy is a derived legacy projection. Rebuild only its membership from
  -- the existing member list, keeping all non-actor readyStateBy values as-is.
  -- In confirmed/legacy-ready-check states the leader is effectively ready.
  select coalesce(jsonb_agg(to_jsonb(member_id) order by first_ordinal), '[]'::jsonb)
  into v_ready_next
  from (
    select distinct on (element #>> '{}') element #>> '{}' as member_id, ordinal as first_ordinal
    from jsonb_array_elements(v_members) with ordinality as members(element, ordinal)
    where case
      when element #>> '{}' = v_party ->> 'creatorId' and v_status in ('COMPOSITION_CONFIRMED', 'READY_CHECK') then true
      when jsonb_typeof(v_ready_state_next -> (element #>> '{}')) = 'object'
           and jsonb_typeof(v_ready_state_next -> (element #>> '{}') -> 'ready') = 'boolean'
        then (v_ready_state_next -> (element #>> '{}') ->> 'ready')::boolean
      when jsonb_typeof(v_ready_state_next -> (element #>> '{}')) = 'boolean'
        then (v_ready_state_next ->> (element #>> '{}'))::boolean
      else v_ready ? (element #>> '{}')
    end
    order by element #>> '{}', ordinal
  ) as ready_members;

  v_flow_next := v_flow_text::bigint + 1;
  v_state_next := jsonb_set(
    jsonb_set(
      jsonb_set(v_world.state, array['parties', p_party_id, 'readyStateBy'], v_ready_state_next, true),
      array['parties', p_party_id, 'readyBy'], v_ready_next, true),
    array['parties', p_party_id, 'flowRevision'], to_jsonb(v_flow_next), true);
  if v_status = 'READY_CHECK' then
    v_status_next := 'COMPOSITION_CONFIRMED';
    v_state_next := jsonb_set(v_state_next, array['parties', p_party_id, 'status'], to_jsonb(v_status_next), true);
  end if;
  update public.baekji_mvp_state_store
  set state = v_state_next, revision = revision + 1,
      writer_id = 'player-command:' || v_identity.account_id::text, updated_at = now()
  where state_key = 'day1_world'
  returning revision into v_world.revision;
  perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'TOGGLE_PARTY_READY_V1', 1, v_fingerprint, 'APPLIED', v_world.revision);
  return query select 'APPLIED'::text, v_world.revision, p_command_id;
end;
$function$;

revoke all on function public.baekji_player_toggle_party_ready_v1(text, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.baekji_player_toggle_party_ready_v1(text, uuid, bigint, text) to service_role;
