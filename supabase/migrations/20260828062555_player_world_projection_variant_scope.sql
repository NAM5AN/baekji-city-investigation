-- Remote migration version: 20260828062555.
-- Stage 8B projection privacy correction: nearby visibility is an exact
-- (variant, spatial scope) pair, never two independent membership tests.
-- Player reads must never expose the generic v3 world document.  This
-- function is intentionally SECURITY INVOKER and is callable only by the
-- server service role; the session token is still verified in the database so
-- the projected actor cannot be supplied by the caller.
create or replace function public.baekji_player_world_projection_v1(p_session_token text)
returns table(state jsonb, revision bigint)
language plpgsql
security invoker
set search_path = public, extensions
as $function$
declare
  v_identity record;
  v_world public.baekji_mvp_state_store%rowtype;
  v_actor jsonb;
  v_parties jsonb := '{}'::jsonb;
  v_own_sessions jsonb := '{}'::jsonb;
  v_nearby_sessions jsonb := '{}'::jsonb;
  v_sessions jsonb := '{}'::jsonb;
  v_characters jsonb := '{}'::jsonb;
  v_item_claims jsonb := '{}'::jsonb;
  v_field_placements jsonb := '{}'::jsonb;
  v_field_placement_claims jsonb := '{}'::jsonb;
  v_item_transfer_offers jsonb := '[]'::jsonb;
  v_item_transfer_resolutions jsonb := '[]'::jsonb;
  v_party_transfer_requests jsonb := '{}'::jsonb;
  v_party_membership_notices jsonb := '{}'::jsonb;
  v_party_membership_removals jsonb := '{}'::jsonb;
  v_sound_events jsonb := '[]'::jsonb;
  v_active_scopes text[] := array[]::text[];
  v_visible_character_ids text[] := array[]::text[];
  v_visible_variants text[] := array[]::text[];
begin
  select * into v_identity
  from public.baekji_player_session_verify_v2(p_session_token)
  limit 1;
  if not found then
    raise exception using message = 'PLAYER_SESSION_INVALID', errcode = 'P0001';
  end if;

  select * into v_world
  from public.baekji_mvp_state_store
  where state_key = 'day1_world';
  if not found or coalesce((v_world.state ->> 'version')::integer, 0) <> 3 then
    raise exception using message = 'PLAYER_WORLD_UNAVAILABLE', errcode = 'P0001';
  end if;

  v_actor := v_world.state -> 'characters' -> v_identity.character_id;
  if v_actor is null or jsonb_typeof(v_actor) <> 'object' then
    raise exception using message = 'PLAYER_WORLD_CHARACTER_NOT_FOUND', errcode = 'P0001';
  end if;

  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  into v_parties
  from jsonb_each(coalesce(v_world.state -> 'parties', '{}'::jsonb)) entry
  where coalesce(entry.value -> 'memberIds', '[]'::jsonb) ? v_identity.character_id
     or coalesce(entry.value -> 'invitedIds', '[]'::jsonb) ? v_identity.character_id;

  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  into v_own_sessions
  from jsonb_each(coalesce(v_world.state -> 'sessions', '{}'::jsonb)) entry
  where coalesce(entry.value -> 'memberIds', '[]'::jsonb) ? v_identity.character_id;

  select coalesce(array_agg(distinct scope_key), array[]::text[]),
         coalesce(array_agg(distinct variant), array[]::text[])
  into v_active_scopes, v_visible_variants
  from (
    select
      case
        when entry.value -> 'movement' is not null then 'route:' || coalesce(entry.value #>> '{movement,fromNode}', '') || ':' || coalesce(entry.value #>> '{movement,targetNode}', '')
        when entry.value -> 'activeEncounter' is not null then 'route:' || coalesce(entry.value #>> '{activeEncounter,fromNode}', '') || ':' || coalesce(entry.value #>> '{activeEncounter,targetNode}', '')
        when nullif(entry.value ->> 'currentDetailId', '') is not null then 'detail:' || coalesce(entry.value ->> 'currentNode', '') || ':' || coalesce(entry.value ->> 'currentDetailId', '')
        else 'node:' || coalesce(entry.value ->> 'currentNode', '')
      end as scope_key,
      nullif(entry.value ->> 'variant', '') as variant
    from jsonb_each(v_own_sessions) entry
    where entry.value ->> 'status' = 'ACTIVE'
  ) own_active;

  select coalesce(jsonb_object_agg(entry.key, jsonb_strip_nulls(jsonb_build_object(
    'id', entry.value ->> 'id',
    'status', entry.value ->> 'status',
    'variant', entry.value ->> 'variant',
    'currentNode', entry.value ->> 'currentNode',
    'currentDetailId', entry.value ->> 'currentDetailId',
    'partyId', entry.value ->> 'partyId',
    'memberIds', coalesce(entry.value -> 'memberIds', '[]'::jsonb)
  ))), '{}'::jsonb)
  into v_nearby_sessions
  from jsonb_each(coalesce(v_world.state -> 'sessions', '{}'::jsonb)) entry
  where not (coalesce(entry.value -> 'memberIds', '[]'::jsonb) ? v_identity.character_id)
    and entry.value ->> 'status' = 'ACTIVE'
    and (
      case
        when entry.value -> 'movement' is not null then 'route:' || coalesce(entry.value #>> '{movement,fromNode}', '') || ':' || coalesce(entry.value #>> '{movement,targetNode}', '')
        when entry.value -> 'activeEncounter' is not null then 'route:' || coalesce(entry.value #>> '{activeEncounter,fromNode}', '') || ':' || coalesce(entry.value #>> '{activeEncounter,targetNode}', '')
        when nullif(entry.value ->> 'currentDetailId', '') is not null then 'detail:' || coalesce(entry.value ->> 'currentNode', '') || ':' || coalesce(entry.value ->> 'currentDetailId', '')
        else 'node:' || coalesce(entry.value ->> 'currentNode', '')
      end
    ) = any(v_active_scopes)
    and exists (
      select 1
      from jsonb_each(v_own_sessions) own_entry
      where own_entry.value ->> 'status' = 'ACTIVE'
        and coalesce(own_entry.value ->> 'variant', '') = coalesce(entry.value ->> 'variant', '')
        and (
          case
            when own_entry.value -> 'movement' is not null then 'route:' || coalesce(own_entry.value #>> '{movement,fromNode}', '') || ':' || coalesce(own_entry.value #>> '{movement,targetNode}', '')
            when own_entry.value -> 'activeEncounter' is not null then 'route:' || coalesce(own_entry.value #>> '{activeEncounter,fromNode}', '') || ':' || coalesce(own_entry.value #>> '{activeEncounter,targetNode}', '')
            when nullif(own_entry.value ->> 'currentDetailId', '') is not null then 'detail:' || coalesce(own_entry.value ->> 'currentNode', '') || ':' || coalesce(own_entry.value ->> 'currentDetailId', '')
            else 'node:' || coalesce(own_entry.value ->> 'currentNode', '')
          end
        ) = (
          case
            when entry.value -> 'movement' is not null then 'route:' || coalesce(entry.value #>> '{movement,fromNode}', '') || ':' || coalesce(entry.value #>> '{movement,targetNode}', '')
            when entry.value -> 'activeEncounter' is not null then 'route:' || coalesce(entry.value #>> '{activeEncounter,fromNode}', '') || ':' || coalesce(entry.value #>> '{activeEncounter,targetNode}', '')
            when nullif(entry.value ->> 'currentDetailId', '') is not null then 'detail:' || coalesce(entry.value ->> 'currentNode', '') || ':' || coalesce(entry.value ->> 'currentDetailId', '')
            else 'node:' || coalesce(entry.value ->> 'currentNode', '')
          end
        )
    );

  v_sessions := v_own_sessions || v_nearby_sessions;

  select coalesce(array_agg(distinct character_id), array[]::text[])
  into v_visible_character_ids
  from (
    select v_identity.character_id as character_id
    union
    select jsonb_array_elements_text(coalesce(entry.value -> 'memberIds', '[]'::jsonb))
    from jsonb_each(v_parties) entry
    union
    select jsonb_array_elements_text(coalesce(entry.value -> 'memberIds', '[]'::jsonb))
    from jsonb_each(v_sessions) entry
  ) visible;

  select coalesce(jsonb_object_agg(entry.key,
    case when entry.key = v_identity.character_id then entry.value
    else jsonb_strip_nulls(jsonb_build_object(
      'id', entry.value ->> 'id',
      'contamination', entry.value -> 'contamination',
      'symptom', entry.value -> 'symptom',
      'currentPartyId', entry.value -> 'currentPartyId',
      'currentSessionId', entry.value -> 'currentSessionId',
      'onlineAt', entry.value -> 'onlineAt'
    )) end
  ), '{}'::jsonb)
  into v_characters
  from jsonb_each(coalesce(v_world.state -> 'characters', '{}'::jsonb)) entry
  where entry.key = any(v_visible_character_ids);

  -- The renderer needs only claim existence.  In particular, claim values
  -- contain another actor's inventory key and must not become player-visible.
  select coalesce(jsonb_object_agg(entry.key, coalesce((
    select jsonb_object_agg(claim.key, '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(entry.value) = 'object' then entry.value else '{}'::jsonb end) claim
  ), '{}'::jsonb)), '{}'::jsonb)
  into v_item_claims
  from jsonb_each(coalesce(v_world.state -> 'itemClaimsByVariant', '{}'::jsonb)) entry
  where entry.key = any(v_visible_variants);
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  into v_field_placements
  from jsonb_each(coalesce(v_world.state -> 'fieldItemPlacementsByVariant', '{}'::jsonb)) entry
  where entry.key = any(v_visible_variants);
  select coalesce(jsonb_object_agg(entry.key, coalesce((
    select jsonb_object_agg(claim.key, '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(entry.value) = 'object' then entry.value else '{}'::jsonb end) claim
  ), '{}'::jsonb)), '{}'::jsonb)
  into v_field_placement_claims
  from jsonb_each(coalesce(v_world.state -> 'fieldItemPlacementClaimsByVariant', '{}'::jsonb)) entry
  where entry.key = any(v_visible_variants);

  -- Transfer entries are visible only to their giver or receiver.  Those
  -- records are required to reserve the actor's own inventory and resolve a
  -- pending offer, while unrelated transfers remain absent.
  select coalesce(jsonb_agg(entry.value), '[]'::jsonb)
  into v_item_transfer_offers
  from jsonb_array_elements(case when jsonb_typeof(v_world.state -> 'itemTransferOffers') = 'array' then v_world.state -> 'itemTransferOffers' else '[]'::jsonb end) entry
  where entry.value ->> 'giverId' = v_identity.character_id
     or entry.value ->> 'receiverId' = v_identity.character_id;
  select coalesce(jsonb_agg(entry.value), '[]'::jsonb)
  into v_item_transfer_resolutions
  from jsonb_array_elements(case when jsonb_typeof(v_world.state -> 'itemTransferResolutions') = 'array' then v_world.state -> 'itemTransferResolutions' else '[]'::jsonb end) entry
  where entry.value ->> 'receiverId' = v_identity.character_id
     or exists (
       select 1
       from jsonb_array_elements(v_item_transfer_offers) offer
       where offer.value ->> 'id' = entry.value ->> 'transferId'
     );

  -- A transfer request is actionable by its requester and by the leader of
  -- its target party.  Do not publish unrelated party-routing history.
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  into v_party_transfer_requests
  from jsonb_each(coalesce(v_world.state -> 'partyTransferRequests', '{}'::jsonb)) entry
  where entry.value ->> 'requesterId' = v_identity.character_id
     or coalesce(v_world.state #>> array['parties', coalesce(entry.value ->> 'targetPartyId', ''), 'creatorId'], '') = v_identity.character_id;

  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  into v_party_membership_notices
  from jsonb_each(coalesce(v_world.state -> 'partyMembershipNotices', '{}'::jsonb)) entry
  where entry.value ->> 'memberId' = v_identity.character_id
     or entry.value ->> 'leaderId' = v_identity.character_id
     or (v_parties ? coalesce(entry.value ->> 'partyId', ''));
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  into v_party_membership_removals
  from jsonb_each(coalesce(v_world.state -> 'partyMembershipRemovals', '{}'::jsonb)) entry
  where entry.value ->> 'memberId' = v_identity.character_id
     or (v_parties ? coalesce(entry.value ->> 'partyId', ''));

  -- Sound events are visibility metadata, not a route to another session's
  -- action logs.  Keep only the minimum acoustic fields for own/nearby
  -- sessions and omit actor/action-log identifiers.
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', entry.value ->> 'id',
    'type', entry.value ->> 'type',
    'level', entry.value ->> 'level',
    'kind', entry.value ->> 'kind',
    'sourceSessionId', entry.value ->> 'sourceSessionId',
    'sourceNode', entry.value ->> 'sourceNode',
    'sourceFloorId', entry.value ->> 'sourceFloorId',
    'at', entry.value -> 'at'
  ))), '[]'::jsonb)
  into v_sound_events
  from jsonb_array_elements(case when jsonb_typeof(v_world.state -> 'soundEvents') = 'array' then v_world.state -> 'soundEvents' else '[]'::jsonb end) entry
  where exists (
    select 1 from jsonb_each(v_sessions) session
    where session.key = entry.value ->> 'sourceSessionId'
  );

  return query select jsonb_build_object(
    'version', 3,
    'storyDay', v_world.state -> 'storyDay',
    'loopId', v_world.state -> 'loopId',
    'eventSeq', v_world.state -> 'eventSeq',
    'sessionSeq', v_world.state -> 'sessionSeq',
    'characters', v_characters,
    'parties', v_parties,
    'sessions', v_sessions,
    'itemClaimsByVariant', v_item_claims,
    'fieldItemPlacementsByVariant', v_field_placements,
    'fieldItemPlacementClaimsByVariant', v_field_placement_claims,
    'itemTransferOffers', v_item_transfer_offers,
    'itemTransferResolutions', v_item_transfer_resolutions,
    'partyTransferRequests', v_party_transfer_requests,
    'partyMembershipNotices', v_party_membership_notices,
    'partyMembershipRemovals', v_party_membership_removals,
    'soundEvents', v_sound_events
  ), v_world.revision;
end;
$function$;

revoke all on function public.baekji_player_world_projection_v1(text) from public, anon, authenticated;
grant execute on function public.baekji_player_world_projection_v1(text) to service_role;
