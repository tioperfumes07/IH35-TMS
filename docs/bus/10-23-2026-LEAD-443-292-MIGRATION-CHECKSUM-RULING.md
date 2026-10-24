# LEAD RULING 443.292-M — checksum override for 202616131600_grant_label_resolvers_to_guard_reader.sql (10-23-2026 10:35 PM CT)

Measured:
- Applied on production 2026-10-22 17:46Z; ledger checksum 9db33e0944f010b0179ae45450e9736301f33b833d853772bcbde9662dcd811b.
- CC-1 7349992008 (10-23 22:09 CT, 443.292-B+C) rewrote the applied file: the three GRANT EXECUTE statements are wrapped in
  a DO block that grants only when the role exists (fresh CI databases have no ih35_guard_reader / ih35_ci_readonly).
  Disk checksum ba73df124c19b8cc09efed62518011741acbb2c8ebc143d011509c8e33996d2a.
- CC-2 proved on fork br-shy-lake-akubtbll that scripts/db-migrate.mjs (prod mode) refuses the modified file — every Render
  pre-deploy would fail.

Ruling: allow the new checksum through scripts/lib/migration-checksum-overrides.json. On production both roles exist, so
the guarded file grants exactly the same three functions to the same two roles as the applied file: no schema or privilege
difference on production. On a fresh database the guard lets the replay pass. Editing an applied migration is otherwise
forbidden; the next change of this kind goes in a NEW follow-up migration.
