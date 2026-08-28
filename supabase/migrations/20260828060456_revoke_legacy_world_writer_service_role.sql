-- Remote migration version: 20260828060456.
-- The command API now owns revision checks and writes. Keep only the
-- server-side full-state read required by the existing admin snapshot routes.
revoke execute on function public.baekji_mvp_get_revision(text) from service_role;
revoke execute on function public.baekji_mvp_put_state(text, jsonb, text, bigint) from service_role;
