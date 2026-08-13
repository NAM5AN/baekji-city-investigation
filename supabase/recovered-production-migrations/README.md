# Recovered production migrations

These files are exact source snapshots recovered from the `shorts`
(`kfgtvifupumjuewwxzmz`) production migration history on 2026-08-13.

They are an audit/reference archive, **not an active migration chain**. Do not apply
this directory automatically. The repository's existing `supabase/migrations/0001_*.sql`
describes a later server-authority design, so mixing both histories without a deliberate
reconciliation migration would be misleading and may conflict with production objects.

| Version | Name | MD5 from production |
| --- | --- | --- |
| 20260809050616 | baekji_test_backend_recovery | a13e1d163fd18cf7e84ce30341ab311d |
| 20260809152353 | admin_auth_foundation | 18cae308b96e958a1c63c54855300844 |
| 20260809154048 | fix_admin_login_and_session_verify | db976f6f7df4b9be9b9fa8a48b59a4e8 |
| 20260809162058 | admin_mvp3_communications | d6faadada50573ecf6a7b102080c2a73 |

Before reusing any SQL here, review all `SECURITY DEFINER` functions, grants, RLS
policies, and compatibility with the current publishable-key client.
