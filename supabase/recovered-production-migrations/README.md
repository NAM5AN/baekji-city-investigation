# Recovered production migrations

These files are exact source snapshots recovered from the `shorts`
(`kfgtvifupumjuewwxzmz`) production migration history on 2026-08-13.
Their UTF-8 bytes, including the absence of a trailing newline where production has
none, are preserved and verified byte-for-byte against the captured source payload.

They are an **archive-only** audit/reference archive, **not an active migration chain**.
Do not apply this directory automatically or include it in any Supabase migration command.
The repository's existing `supabase/migrations/0001_*.sql` describes a later
server-authority design, so mixing both histories without a deliberate reconciliation
migration would be misleading and may conflict with production objects.

| Version | Name | Production bytes | MD5 from production |
| --- | --- | ---: | --- |
| 20260809050616 | baekji_test_backend_recovery | 6775 | a13e1d163fd18cf7e84ce30341ab311d |
| 20260809152353 | admin_auth_foundation | 4108 | 18cae308b96e958a1c63c54855300844 |
| 20260809154048 | fix_admin_login_and_session_verify | 2138 | db976f6f7df4b9be9b9fa8a48b59a4e8 |
| 20260809162058 | admin_mvp3_communications | 9683 | d6faadada50573ecf6a7b102080c2a73 |
| 20260809234033 | admin_control_mvp4_audit_and_atomic_state | 6753 | debfce8027694fbb1af158e1959c15c2 |
| 20260810004035 | admin_operations_mvp5 | 2193 | 991928cee250b20c8f6a6ea1c2734d5a |
| 20260810074520 | admin_system_sender_label | 6160 | 4715cbfb0ab5e1596a6463ca3f2cdcb5 |

Before reusing any SQL here, review all `SECURITY DEFINER` functions, grants, RLS
policies, and compatibility with the current publishable-key client.
