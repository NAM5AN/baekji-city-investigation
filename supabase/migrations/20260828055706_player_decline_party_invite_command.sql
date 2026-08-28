-- Remote migration version: 20260828055706.
-- Stage 8B-B2: actor-bound decline of the caller's own pending party invite.
create or replace function public.baekji_player_decline_party_invite_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint,
  p_party_id text
)
returns table(status text, revision bigint, command_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_world public.baekji_mvp_state_store%rowtype;
  v_identity record;
  v_preflight record;
  v_invited jsonb;
  v_declined jsonb;
  v_members jsonb;
  v_fingerprint text;
begin
  if coalesce(p_party_id, '') !~ '^[A-Za-z0-9_-]{1,96}$' then
    raise exception using message = 'INVALID_WORLD_COMMAND', errcode = 'P0001';
  end if;
  v_fingerprint := encode(digest('DECLINE_PARTY_INVITE_V1:' || p_party_id, 'sha256'), 'hex');
  select * into v_preflight from public.baekji_player_world_command_preflight_v1(p_session_token, p_command_id, p_expected_revision, 'DECLINE_PARTY_INVITE_V1', 1, v_fingerprint);
  if v_preflight.status is not null then return query select v_preflight.status, v_preflight.revision, p_command_id; return; end if;
  select v_preflight.actor_account_id as account_id, v_preflight.actor_character_id as character_id into v_identity;
  v_world.state := v_preflight.world_state; v_world.revision := v_preflight.revision;

  v_invited := coalesce(v_world.state #> array['parties', p_party_id, 'invitedIds'], '[]'::jsonb);
  v_declined := coalesce(v_world.state #> array['parties', p_party_id, 'declinedIds'], '[]'::jsonb);
  v_members := coalesce(v_world.state #> array['parties', p_party_id, 'memberIds'], '[]'::jsonb);
  if coalesce(v_world.state #>> array['parties', p_party_id, 'status'], '') not in ('RECRUITING', 'COMPOSITION_CONFIRMED')
     or coalesce(v_world.state #>> array['parties', p_party_id, 'creatorId'], '') = ''
     or v_world.state #>> array['parties', p_party_id, 'creatorId'] = v_identity.character_id
     or v_members ? v_identity.character_id
     or coalesce(v_world.state #>> array['characters', v_identity.character_id, 'currentPartyId'], '') <> ''
     or not (v_invited ? v_identity.character_id) then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'DECLINE_PARTY_INVITE_V1', 1, v_fingerprint, 'OUT_OF_SCOPE', v_world.revision);
    return query select 'OUT_OF_SCOPE'::text, v_world.revision, p_command_id; return;
  end if;
  if not (v_declined ? v_identity.character_id) then v_declined := v_declined || to_jsonb(v_identity.character_id); end if;
  update public.baekji_mvp_state_store
  set state = jsonb_set(jsonb_set(state, array['parties', p_party_id, 'invitedIds'], v_invited - v_identity.character_id, true), array['parties', p_party_id, 'declinedIds'], v_declined, true),
      revision = revision + 1, writer_id = 'player-command:' || v_identity.account_id::text, updated_at = now()
  where state_key = 'day1_world' returning revision into v_world.revision;
  perform public.baekji_player_world_command_record_v1(v_identity.account_id, p_command_id, 'DECLINE_PARTY_INVITE_V1', 1, v_fingerprint, 'APPLIED', v_world.revision);
  return query select 'APPLIED'::text, v_world.revision, p_command_id;
end;
$function$;

revoke all on function public.baekji_player_decline_party_invite_v1(text, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.baekji_player_decline_party_invite_v1(text, uuid, bigint, text) to service_role;
