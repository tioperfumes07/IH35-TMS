# LEAD RULING 2026-10-03 — CC-3 owns the guard-harness role rule (LANE_CROSS)

Recorded by CC-3 from the Lead's restart brief to CC-3, 2026-10-03, item 2, verbatim:

> OWNER HAS ORDERED IT REPAIRED. Split:
>   YOU: every guard and script pins its role (SET LOCAL ROLE NONE, as your D3 branch
>        does) or runs on the DIRECT URL. Make it a rule in the guard harness, NOT a
>        per-script fix. Add verify-guards-do-not-run-as-ih35_app.
>   CC-1 AND ME: the app pool's own SET ROLE. DO NOT TOUCH IT.
>   Re-measure your dispatch counts on the direct URL and say which changed.

Scope this crosses into (CC-1 lane, guard harness only): `scripts/money-pr-local-gate.mjs`,
`scripts/lib/run-required-guards.mjs`, `scripts/lib/require-live-db.mjs`, new `scripts/lib/guard-db-url.mjs`,
new `scripts/verify-guards-do-not-run-as-ih35_app.mjs`, `docs/law/LAW.json`.
NOT crossed: `apps/backend/src/auth/db.ts` (the app pool's SET ROLE) — CC-1 + Lead.
