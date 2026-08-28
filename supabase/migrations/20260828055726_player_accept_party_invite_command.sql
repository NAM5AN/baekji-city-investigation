-- Remote migration version: 20260828055726.
-- Stage 8B-B5: actor-bound accept, with server-owned fresh/reinvite split.
create or replace function public.baekji_player_accept_party_invite_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint,
  p_party_id text
)
returns table(status text, revision bigint, command_id uuid)
language plpgsql security definer set search_path = public, extensions
as $function$
declare
  v_identity record; v_world public.baekji_mvp_state_store%rowtype; v_preflight record;
  v_fingerprint text; v_party jsonb; v_actor jsonb; v_creator jsonb; v_members jsonb; v_invited jsonb; v_declined jsonb; v_confirmed jsonb; v_ready jsonb; v_ready_state jsonb; v_joined_map jsonb; v_markers jsonb; v_removal jsonb;
  v_party_status text; v_creator_id text; v_removal_text text; v_marker_text text; v_joined_text text; v_removal_at bigint := 0; v_existing_marker bigint := 0; v_existing_joined bigint := 0; v_joined_at bigint;
  v_active_removal boolean := false; v_state_next jsonb; v_removal_next jsonb;
begin
  if coalesce(p_party_id,'') !~ '^[A-Za-z0-9_-]{1,96}$' then raise exception using message='INVALID_WORLD_COMMAND',errcode='P0001'; end if;
  v_fingerprint := encode(digest('ACCEPT_PARTY_INVITE_V1:' || p_party_id,'sha256'),'hex');
  select * into v_preflight from public.baekji_player_world_command_preflight_v1(p_session_token,p_command_id,p_expected_revision,'ACCEPT_PARTY_INVITE_V1',1,v_fingerprint);
  if v_preflight.status is not null then return query select v_preflight.status,v_preflight.revision,p_command_id; return; end if;
  select v_preflight.actor_account_id as account_id,v_preflight.actor_character_id as character_id into v_identity;
  v_world.state:=v_preflight.world_state; v_world.revision:=v_preflight.revision;

  v_party := v_world.state #> array['parties',p_party_id]; v_actor := v_world.state #> array['characters',v_identity.character_id]; v_creator_id:=coalesce(v_party->>'creatorId','');
  v_members := coalesce(v_party->'memberIds','[]'::jsonb); v_invited := coalesce(v_party->'invitedIds','[]'::jsonb); v_declined := coalesce(v_party->'declinedIds','[]'::jsonb); v_confirmed := coalesce(v_party->'confirmedBy','[]'::jsonb); v_ready := coalesce(v_party->'readyBy','[]'::jsonb); v_ready_state := coalesce(v_party->'readyStateBy','{}'::jsonb); v_joined_map := coalesce(v_party->'membershipJoinedAtBy','{}'::jsonb); v_markers := coalesce(v_party->'membershipReinvitedAtBy','{}'::jsonb);
  if jsonb_typeof(v_party) <> 'object' or jsonb_typeof(v_actor) <> 'object'
     or jsonb_typeof(v_members) <> 'array' or jsonb_typeof(v_invited) <> 'array' or jsonb_typeof(v_declined) <> 'array'
     or jsonb_typeof(v_confirmed) <> 'array' or jsonb_typeof(v_ready) <> 'array' or jsonb_typeof(v_ready_state) <> 'object' or jsonb_typeof(v_joined_map) <> 'object' or jsonb_typeof(v_markers) <> 'object'
     or exists(select 1 from jsonb_array_elements(v_members) e where jsonb_typeof(e) <> 'string')
     or exists(select 1 from jsonb_array_elements(v_invited) e where jsonb_typeof(e) <> 'string')
     or exists(select 1 from jsonb_array_elements(v_declined) e where jsonb_typeof(e) <> 'string')
     or exists(select 1 from jsonb_array_elements(v_confirmed) e where jsonb_typeof(e) <> 'string')
     or exists(select 1 from jsonb_array_elements(v_ready) e where jsonb_typeof(e) <> 'string') then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id,p_command_id,'ACCEPT_PARTY_INVITE_V1',1,v_fingerprint,'OUT_OF_SCOPE',v_world.revision);
    return query select 'OUT_OF_SCOPE'::text,v_world.revision,p_command_id; return;
  end if;
  v_party_status := coalesce(v_party->>'status','');
  v_creator:=v_world.state #> array['characters',v_creator_id];
  if v_creator_id !~ '^[A-Za-z0-9_-]{1,96}$' or not (v_members ? v_creator_id) -- characters[v_creator_id] must remain assigned to this party.
     or jsonb_typeof(v_creator) <> 'object' or coalesce(v_creator->>'currentPartyId','') <> p_party_id or coalesce(v_creator->>'currentSessionId','') <> ''
     or coalesce(v_actor->>'currentPartyId','') <> '' or coalesce(v_actor->>'currentSessionId','') <> '' or not (v_invited ? v_identity.character_id) or v_members ? v_identity.character_id
     or v_party_status not in ('RECRUITING','COMPOSITION_CONFIRMED') or v_party_status = 'READY_CHECK' or coalesce(v_party->>'sessionId','') <> '' then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id,p_command_id,'ACCEPT_PARTY_INVITE_V1',1,v_fingerprint,'OUT_OF_SCOPE',v_world.revision);
    return query select 'OUT_OF_SCOPE'::text,v_world.revision,p_command_id; return;
  end if;

  v_removal := v_world.state #> array['partyMembershipRemovals',p_party_id || ':' || v_identity.character_id];
  if v_removal is not null and (jsonb_typeof(v_removal) <> 'object' or jsonb_typeof(v_removal -> 'active') <> 'boolean' or coalesce(v_removal->>'partyId','') <> p_party_id or coalesce(v_removal->>'memberId','') <> v_identity.character_id or coalesce(v_removal->>'at','') !~ '^[1-9][0-9]{0,14}$') then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id,p_command_id,'ACCEPT_PARTY_INVITE_V1',1,v_fingerprint,'OUT_OF_SCOPE',v_world.revision);
    return query select 'OUT_OF_SCOPE'::text,v_world.revision,p_command_id; return;
  end if;
  v_active_removal := v_removal is not null and (v_removal->'active')='true'::jsonb;
  if v_removal is not null then v_removal_text:=v_removal->>'at'; v_removal_at:=v_removal_text::bigint; end if;
  v_marker_text:=v_markers->>v_identity.character_id;
  v_joined_text:=v_joined_map->>v_identity.character_id;
  if (v_marker_text is not null and v_marker_text !~ '^[1-9][0-9]{0,14}$') or (v_joined_text is not null and v_joined_text !~ '^[1-9][0-9]{0,14}$') then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id,p_command_id,'ACCEPT_PARTY_INVITE_V1',1,v_fingerprint,'OUT_OF_SCOPE',v_world.revision);
    return query select 'OUT_OF_SCOPE'::text,v_world.revision,p_command_id; return;
  end if;
  if v_marker_text is not null then v_existing_marker:=v_marker_text::bigint; end if;
  if v_active_removal and (v_party_status <> 'RECRUITING' or v_existing_marker <= v_removal_at) then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id,p_command_id,'ACCEPT_PARTY_INVITE_V1',1,v_fingerprint,'OUT_OF_SCOPE',v_world.revision);
    return query select 'OUT_OF_SCOPE'::text,v_world.revision,p_command_id; return;
  end if;
  if v_joined_text is not null then v_existing_joined:=v_joined_text::bigint; end if;
  v_joined_at:=greatest(floor(extract(epoch from clock_timestamp())*1000)::bigint,v_removal_at+1,v_existing_joined+1,v_existing_marker+1);

  v_members:=v_members || to_jsonb(v_identity.character_id); v_invited:=v_invited-v_identity.character_id; v_declined:=v_declined-v_identity.character_id;
  v_confirmed:=v_confirmed-v_identity.character_id;
  v_ready:=v_ready-v_identity.character_id;
  v_ready_state:=v_ready_state-v_identity.character_id;
  if v_party_status = 'COMPOSITION_CONFIRMED' then
    -- confirmedBy keeps every other member; readyBy removes only this actor;
    -- readyStateBy writes this actor as ready: false at v_joined_at.
    v_confirmed:=v_confirmed || to_jsonb(v_identity.character_id); v_ready:=v_ready-v_identity.character_id; v_ready_state:=jsonb_set(v_ready_state,array[v_identity.character_id],jsonb_build_object('ready',false,'at',v_joined_at),true);
  end if;
  if v_party_status = 'RECRUITING' then -- confirmedBy/readyBy/readyStateBy retain every non-actor entry.
    v_confirmed:=v_confirmed; v_ready:=v_ready; v_ready_state:=v_ready_state-v_identity.character_id;
  end if;
  v_joined_map:=jsonb_set(v_joined_map,array[v_identity.character_id],to_jsonb(v_joined_at),true); v_markers:=v_markers-v_identity.character_id;
  v_state_next:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_world.state,array['parties',p_party_id,'memberIds'],v_members,true),array['parties',p_party_id,'invitedIds'],v_invited,true),array['parties',p_party_id,'declinedIds'],v_declined,true),array['parties',p_party_id,'confirmedBy'],v_confirmed,true),array['parties',p_party_id,'readyBy'],v_ready,true),array['parties',p_party_id,'readyStateBy'],v_ready_state,true),array['parties',p_party_id,'membershipJoinedAtBy'],v_joined_map,true),array['parties',p_party_id,'membershipReinvitedAtBy'],v_markers,true),array['characters',v_identity.character_id,'currentPartyId'],to_jsonb(p_party_id),true);
  v_state_next:=jsonb_set(v_state_next,array['characters',v_identity.character_id,'currentSessionId'],'null'::jsonb,true);
  if v_active_removal then
    -- partyMembershipRemovals: active false, then clearedAt, only for active history.
    v_removal_next:=jsonb_set(jsonb_set(v_removal,array['active'],'false'::jsonb,true),array['clearedAt'],to_jsonb(v_joined_at),true);
    v_state_next:=jsonb_set(v_state_next,array['partyMembershipRemovals',p_party_id || ':' || v_identity.character_id],v_removal_next,true);
  end if;
  update public.baekji_mvp_state_store set state=v_state_next,revision=revision+1,writer_id='player-command:'||v_identity.account_id::text,updated_at=now() where state_key='day1_world' returning revision into v_world.revision;
  perform public.baekji_player_world_command_record_v1(v_identity.account_id,p_command_id,'ACCEPT_PARTY_INVITE_V1',1,v_fingerprint,'APPLIED',v_world.revision);
  return query select 'APPLIED'::text,v_world.revision,p_command_id;
end;$function$;
revoke all on function public.baekji_player_accept_party_invite_v1(text,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.baekji_player_accept_party_invite_v1(text,uuid,bigint,text) to service_role;
