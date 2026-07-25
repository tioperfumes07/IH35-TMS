# RENDER PRE-DEPLOY UNBLOCK — Mexico CoL checksum (2026-07-25)

## Incident

Live API stuck on `ce05d91` while `origin/main` tip is `2bdac206` (#3553 fleet catalog RETURNING fix).

Last four Render deploys: `pre_deploy_failed` on commits `2bdac206`, `87d00511`, `8bff58ab`, `d240a0fe`.

Pre-deploy: `npm run db:migrate && …`

## Root cause

```
Migration 202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql was modified after apply
ledger checksum d709ac509f113e7f42e7bf9f7b94c0fa0ef740f5157a7598f7d76402c8096101
disk checksum   8429d94902bd28c3a8fdfc8958e795d8044ce36410f0ce1ba6ffe90643b5c718
```

Neon prod (`br-fancy-credit-akjnd07a`) confirms the ledger row at `2026-07-25T21:55:01.713Z`.

`#3553` itself is correct and merged; it cannot reach prod until migrate stops failing closed.

## Fix (this PR)

1. `scripts/lib/migration-checksum-overrides.json` — sanctioned escape hatch matching both hashes.
2. `scripts/lib/prod-migration-ledger-checksums.json` — pin ledger truth `d709ac50…`.
3. `.held-migrations.json` — move file from stale `superseded` ("never applied") to `applied_held` with live evidence.

No SQL edit. No Neon DDL. No re-apply.

## Prove after merge + redeploy

```bash
curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow
# version must be ancestry of 2bdac206 (or later tip), NOT ce05d91
```

Fleet catalog CREATE must stop 500ing (RETURNING-comment fix).
