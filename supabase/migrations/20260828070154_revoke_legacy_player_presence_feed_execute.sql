-- Remote migration version: 20260828070154.
-- Stage 8B-3: the deployed player APIs use only the actor-bound v2 presence
-- and system-feed functions, so no role retains the obsolete token-only v1 API.

revoke execute on function public.baekji_player_admin_system_list(text, bigint, integer) from public, anon, authenticated, service_role;
revoke execute on function public.baekji_player_presence_ping(text, text) from public, anon, authenticated, service_role;
