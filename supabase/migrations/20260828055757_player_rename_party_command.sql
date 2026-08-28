-- Remote migration version: 20260828055757.
-- Actor-bound party-name mutation. The canonical world row and the actor's
-- command ledger share one lock order with B1-B5 so retries stay idempotent.
create or replace function public.baekji_player_rename_party_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint,
  p_party_id text,
  p_name text
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
  v_clean_name text;
  v_flow_text text;
  v_flow_next bigint;
  v_now_ms bigint;
  v_name_units integer := 0;
  v_name_invalid boolean := false;
  v_state_next jsonb;
begin
  if coalesce(p_party_id, '') !~ '^[A-Za-z0-9_-]{1,96}$'
     or p_name is null or p_name ~ '[[:cntrl:]]' then
    raise exception using message = 'INVALID_WORLD_COMMAND', errcode = 'P0001';
  end if;
  v_clean_name := btrim(p_name);
  v_clean_name := regexp_replace(v_clean_name, '\s+', ' ', 'g');
  select coalesce(sum(case when octet_length(ch) > 3 then 2 else 1 end), 0)::integer into v_name_units
  from regexp_split_to_table(v_clean_name, '') as ch;
  v_name_invalid := length(v_clean_name) < 1 or v_name_units > 24;

  -- command_fingerprint binds RENAME_PARTY_V1, p_party_id, and normalized p_name.
  v_fingerprint := encode(digest('RENAME_PARTY_V1:' || p_party_id || ':' || v_clean_name, 'sha256'), 'hex');
  select * into v_preflight from public.baekji_player_world_command_preflight_v1(
    p_session_token, p_command_id, p_expected_revision, 'RENAME_PARTY_V1', 1, v_fingerprint
  );
  if v_preflight.status is not null then
    return query select v_preflight.status, v_preflight.revision, p_command_id;
    return;
  end if;
  select v_preflight.actor_account_id as account_id, v_preflight.actor_character_id as character_id into v_identity;
  v_world.state := v_preflight.world_state;
  v_world.revision := v_preflight.revision;
  if v_name_invalid then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'RENAME_PARTY_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
    return;
  end if;

  v_party := v_world.state #> array['parties', p_party_id];
  v_actor := v_world.state #> array['characters', v_identity.character_id];
  v_members := coalesce(v_party -> 'memberIds', '[]'::jsonb);
  v_flow_text := coalesce(v_party ->> 'flowRevision', '0');
  -- creatorId must be v_identity.character_id; memberIds includes
  -- v_identity.character_id; currentPartyId is p_party_id; currentSessionId
  -- is empty, otherwise the result below is OUT_OF_SCOPE.
  if v_party is null or v_actor is null
     or coalesce(jsonb_typeof(v_party), '') <> 'object' or coalesce(jsonb_typeof(v_actor), '') <> 'object'
     or jsonb_typeof(v_members) <> 'array'
     or exists(select 1 from jsonb_array_elements(v_members) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[A-Za-z0-9_-]{1,96}$')
     or coalesce(jsonb_typeof(v_party -> 'creatorId'), '') <> 'string'
     or coalesce(jsonb_typeof(v_party -> 'name'), '') <> 'string'
     or coalesce(jsonb_typeof(v_party -> 'status'), '') <> 'string'
     or (v_party ? 'nameCustomized') and jsonb_typeof(v_party -> 'nameCustomized') <> 'boolean'
     or (v_party ? 'flowRevision') and (coalesce(jsonb_typeof(v_party -> 'flowRevision'), '') <> 'number'
       or v_flow_text !~ '^[0-9]{1,16}$'
       or case when v_flow_text ~ '^[0-9]{1,16}$' then v_flow_text::bigint > 9007199254740990 else false end)
     or coalesce(v_party ->> 'creatorId', '') <> v_identity.character_id
     or not (v_members ? v_identity.character_id)
     or coalesce(v_actor ->> 'currentPartyId', '') <> p_party_id
     or coalesce(v_actor ->> 'currentSessionId', '') <> ''
     or coalesce(v_party ->> 'sessionId', '') <> ''
     or coalesce(v_party ->> 'status', '') not in ('RECRUITING', 'COMPOSITION_CONFIRMED', 'READY_CHECK') then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'RENAME_PARTY_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
    return;
  end if;

  -- A name equal to an already-customized value is the only no-op. Persisting
  -- the generated default name deliberately marks it customized.
  if coalesce(v_party ->> 'name', '') = v_clean_name and coalesce(v_party -> 'nameCustomized', 'false'::jsonb) = 'true'::jsonb then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'RENAME_PARTY_V1', 1, v_fingerprint, 'NOOP', v_world.revision);
    return query select 'NOOP'::text, v_world.revision, p_command_id;
    return;
  end if;

  v_flow_next := v_flow_text::bigint + 1;
  v_now_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_state_next := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(v_world.state, array['parties', p_party_id, 'name'], to_jsonb(v_clean_name), true),
        array['parties', p_party_id, 'nameCustomized'], 'true'::jsonb, true),
      array['parties', p_party_id, 'nameCustomizedAt'], to_jsonb(v_now_ms), true),
    array['parties', p_party_id, 'flowRevision'], to_jsonb(v_flow_next), true);
  update public.baekji_mvp_state_store
  set state = v_state_next, revision = revision + 1,
      writer_id = 'player-command:' || v_identity.account_id::text, updated_at = now()
  where state_key = 'day1_world'
  returning revision into v_world.revision;
  perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'RENAME_PARTY_V1', 1, v_fingerprint, 'APPLIED', v_world.revision);
  return query select 'APPLIED'::text, v_world.revision, p_command_id;
end;
$function$;

revoke all on function public.baekji_player_rename_party_v1(text, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.baekji_player_rename_party_v1(text, uuid, bigint, text, text) to service_role;
