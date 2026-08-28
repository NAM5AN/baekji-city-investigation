-- Remote migration version: 20260828055712.
create or replace function public.baekji_player_cancel_party_invite_v1(
  p_session_token text,
  p_command_id uuid,
  p_expected_revision bigint,
  p_party_id text,
  p_invitee_id text
)
returns table(status text, revision bigint, command_id uuid)
language plpgsql security definer set search_path = public, extensions as $function$
declare
  v_identity record; v_world public.baekji_mvp_state_store%rowtype; v_preflight record;
  v_invited jsonb; v_declined jsonb; v_members jsonb; v_fingerprint text;
begin
  if coalesce(p_party_id,'') !~ '^[A-Za-z0-9_-]{1,96}$' or coalesce(p_invitee_id,'') !~ '^[A-Za-z0-9_-]{1,96}$' then raise exception using message='INVALID_WORLD_COMMAND', errcode='P0001'; end if;
  v_fingerprint := encode(digest('CANCEL_PARTY_INVITE_V1:' || p_party_id || ':' || p_invitee_id, 'sha256'),'hex');
  select * into v_preflight from public.baekji_player_world_command_preflight_v1(p_session_token,p_command_id,p_expected_revision,'CANCEL_PARTY_INVITE_V1',1,v_fingerprint);
  if v_preflight.status is not null then return query select v_preflight.status,v_preflight.revision,p_command_id; return; end if;
  select v_preflight.actor_account_id as account_id,v_preflight.actor_character_id as character_id into v_identity;
  v_world.state:=v_preflight.world_state; v_world.revision:=v_preflight.revision;
  v_invited := coalesce(v_world.state #> array['parties',p_party_id,'invitedIds'],'[]'::jsonb);
  v_declined := coalesce(v_world.state #> array['parties',p_party_id,'declinedIds'],'[]'::jsonb);
  v_members := coalesce(v_world.state #> array['parties',p_party_id,'memberIds'],'[]'::jsonb);
  if coalesce(v_world.state #>> array['parties',p_party_id,'status'],'') not in ('RECRUITING','COMPOSITION_CONFIRMED')
     or coalesce(v_world.state #>> array['parties',p_party_id,'sessionId'],'') <> ''
     or coalesce(v_world.state #>> array['parties',p_party_id,'creatorId'],'') <> v_identity.character_id
     or not (v_members ? v_identity.character_id)
     or coalesce(v_world.state #>> array['characters',v_identity.character_id,'currentPartyId'],'') <> p_party_id
     or v_members ? p_invitee_id
     or not (v_invited ? p_invitee_id) then
    perform public.baekji_player_world_command_record_v1(v_identity.account_id,p_command_id,'CANCEL_PARTY_INVITE_V1',1,v_fingerprint,'OUT_OF_SCOPE',v_world.revision);
    return query select 'OUT_OF_SCOPE'::text,v_world.revision,p_command_id; return;
  end if;
  update public.baekji_mvp_state_store set state=jsonb_set(jsonb_set(state,array['parties',p_party_id,'invitedIds'],v_invited-p_invitee_id,true),array['parties',p_party_id,'declinedIds'],v_declined-p_invitee_id,true),revision=revision+1,writer_id='player-command:'||v_identity.account_id::text,updated_at=now() where state_key='day1_world' returning revision into v_world.revision;
  perform public.baekji_player_world_command_record_v1(v_identity.account_id,p_command_id,'CANCEL_PARTY_INVITE_V1',1,v_fingerprint,'APPLIED',v_world.revision);
  return query select 'APPLIED'::text,v_world.revision,p_command_id;
end;$function$;
revoke all on function public.baekji_player_cancel_party_invite_v1(text,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.baekji_player_cancel_party_invite_v1(text,uuid,bigint,text,text) to service_role;
