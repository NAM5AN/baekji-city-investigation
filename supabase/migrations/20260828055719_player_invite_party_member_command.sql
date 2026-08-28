-- Remote migration version: 20260828055719.
-- Stage 8B-B4: server-owned fresh/reinvite party invitation.
-- The browser never chooses the reinvite branch; active removal state is
-- derived while holding the canonical world row lock.
create or replace function public.baekji_player_invite_party_member_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint,
  p_party_id text,
  p_invitee_id text
)
returns table(status text, revision bigint, command_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_identity record;
  v_world public.baekji_mvp_state_store%rowtype;
  v_preflight record;
  v_fingerprint text;
  v_party jsonb;
  v_target jsonb;
  v_members jsonb;
  v_invited jsonb;
  v_declined jsonb;
  v_removal jsonb;
  v_markers jsonb;
  v_marker_text text;
  v_removal_text text;
  v_existing_marker bigint := 0;
  v_removal_at bigint := 0;
  v_next_marker bigint;
  v_active_removal boolean := false;
  v_pending boolean := false;
  v_valid_marker boolean := false;
begin
  if coalesce(p_party_id, '') !~ '^[A-Za-z0-9_-]{1,96}$'
     or coalesce(p_invitee_id, '') !~ '^[A-Za-z0-9_-]{1,96}$' then
    raise exception using message = 'INVALID_WORLD_COMMAND', errcode = 'P0001';
  end if;

  v_fingerprint := encode(digest('INVITE_PARTY_MEMBER_V1:' || p_party_id || ':' || p_invitee_id, 'sha256'), 'hex');
  select * into v_preflight from public.baekji_player_world_command_preflight_v1(
    p_session_token, p_command_id, p_expected_revision, 'INVITE_PARTY_MEMBER_V1', 1, v_fingerprint
  );
  if v_preflight.status is not null then
    return query select v_preflight.status, v_preflight.revision, p_command_id;
    return;
  end if;
  select v_preflight.actor_account_id as account_id, v_preflight.actor_character_id as character_id into v_identity;
  v_world.state := v_preflight.world_state;
  v_world.revision := v_preflight.revision;

  v_party := v_world.state #> array['parties', p_party_id];
  v_target := v_world.state #> array['characters', p_invitee_id];
  v_members := coalesce(v_world.state #> array['parties', p_party_id, 'memberIds'], '[]'::jsonb);
  v_invited := coalesce(v_world.state #> array['parties', p_party_id, 'invitedIds'], '[]'::jsonb);
  v_declined := coalesce(v_world.state #> array['parties', p_party_id, 'declinedIds'], '[]'::jsonb);
  if v_party is null or jsonb_typeof(v_party) <> 'object'
     or v_target is null or jsonb_typeof(v_target) <> 'object'
     or jsonb_typeof(v_members) <> 'array'
     or jsonb_typeof(v_invited) <> 'array'
     or jsonb_typeof(v_declined) <> 'array'
     or coalesce(v_world.state #>> array['parties', p_party_id, 'status'], '') <> 'RECRUITING'
     or coalesce(v_world.state #>> array['parties', p_party_id, 'sessionId'], '') <> ''
     or coalesce(v_world.state #>> array['parties', p_party_id, 'creatorId'], '') <> v_identity.character_id
     or not (coalesce(v_world.state #> array['parties', p_party_id, 'memberIds'], '[]'::jsonb) ? v_identity.character_id)
     or coalesce(v_world.state #>> array['characters', v_identity.character_id, 'currentPartyId'], '') <> p_party_id
     or coalesce(v_world.state #>> array['characters', p_invitee_id, 'currentPartyId'], '') <> ''
     or coalesce(v_world.state #> array['parties', p_party_id, 'memberIds'], '[]'::jsonb) ? p_invitee_id then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'INVITE_PARTY_MEMBER_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
    return;
  end if;

  v_removal := v_world.state #> array['partyMembershipRemovals', p_party_id || ':' || p_invitee_id];
  -- A present removal key is authoritative history. Never silently reinterpret
  -- malformed history as a fresh invite, because the client repair runtime may
  -- still recognize it as a removal.
  if v_removal is not null
     and (jsonb_typeof(v_removal) <> 'object'
       or not (v_removal ? 'active')
       or jsonb_typeof(v_removal -> 'active') <> 'boolean') then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'INVITE_PARTY_MEMBER_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
    return;
  end if;
  v_active_removal := v_removal is not null and (v_removal -> 'active') = 'true'::jsonb;
  if v_active_removal then
    v_removal_text := coalesce(v_removal ->> 'at', '');
    if coalesce(v_removal ->> 'partyId', '') <> p_party_id
       or coalesce(v_removal ->> 'memberId', '') <> p_invitee_id
       or v_removal_text !~ '^[1-9][0-9]{0,14}$' then
      perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'INVITE_PARTY_MEMBER_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
      return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id;
      return;
    end if;
    v_removal_at := v_removal_text::bigint;
  end if;
  v_markers := v_world.state #> array['parties', p_party_id, 'membershipReinvitedAtBy'];
  if jsonb_typeof(v_markers) <> 'object' then v_markers := '{}'::jsonb; end if;
  v_marker_text := coalesce(v_markers ->> p_invitee_id, '');
  if v_marker_text ~ '^[0-9]{1,15}$' then v_existing_marker := v_marker_text::bigint; end if;
  v_pending := v_invited ? p_invitee_id;
  v_valid_marker := v_active_removal and v_existing_marker > v_removal_at;
  if (not v_active_removal and v_pending) or (v_active_removal and v_pending and v_valid_marker) then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'INVITE_PARTY_MEMBER_V1', 1, v_fingerprint, 'NOOP', v_world.revision);
    return query select 'NOOP'::text, v_world.revision, p_command_id;
    return;
  end if;

  v_next_marker := greatest(floor(extract(epoch from clock_timestamp()) * 1000)::bigint, v_removal_at + 1, v_existing_marker);
  if v_active_removal then
    v_markers := jsonb_set(v_markers, array[p_invitee_id], to_jsonb(v_next_marker), true);
  end if;
  update public.baekji_mvp_state_store
  set state = jsonb_set(
        jsonb_set(
          jsonb_set(state, array['parties', p_party_id, 'invitedIds'],
            case when v_pending then v_invited else v_invited || to_jsonb(p_invitee_id) end, true),
          array['parties', p_party_id, 'declinedIds'], v_declined - p_invitee_id, true),
        array['parties', p_party_id, 'membershipReinvitedAtBy'], v_markers, v_active_removal),
      revision = revision + 1,
      writer_id = 'player-command:' || v_identity.account_id::text,
      updated_at = now()
  where state_key = 'day1_world'
  returning revision into v_world.revision;
  perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'INVITE_PARTY_MEMBER_V1', 1, v_fingerprint, 'APPLIED', v_world.revision);
  return query select 'APPLIED'::text, v_world.revision, p_command_id;
end;
$function$;

revoke all on function public.baekji_player_invite_party_member_v1(text, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.baekji_player_invite_party_member_v1(text, uuid, bigint, text, text) to service_role;
