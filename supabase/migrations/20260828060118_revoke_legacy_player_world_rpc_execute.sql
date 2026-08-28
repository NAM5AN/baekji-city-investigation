-- Remote migration version: 20260828060118.
-- Stage 8B-3: only server-side administrative reads retain this legacy full-world API.
-- The player command/projection functions use SECURITY DEFINER with search_path = ''
-- and are granted separately in their own migrations.  These legacy functions are
-- intentionally not redefined here: their established signatures are revoked as-is.

revoke execute on function public.baekji_mvp_get_state(text) from public;
revoke execute on function public.baekji_mvp_get_state(text) from anon;
revoke execute on function public.baekji_mvp_get_state(text) from authenticated;

revoke execute on function public.baekji_mvp_get_revision(text) from public;
revoke execute on function public.baekji_mvp_get_revision(text) from anon;
revoke execute on function public.baekji_mvp_get_revision(text) from authenticated;

-- The recovered production definition is (state_key text, state jsonb,
-- writer_id text, expected_revision bigint); do not reorder these arguments.
revoke execute on function public.baekji_mvp_put_state(text, jsonb, text, bigint) from public;
revoke execute on function public.baekji_mvp_put_state(text, jsonb, text, bigint) from anon;
revoke execute on function public.baekji_mvp_put_state(text, jsonb, text, bigint) from authenticated;

grant execute on function public.baekji_mvp_get_state(text) to service_role;
