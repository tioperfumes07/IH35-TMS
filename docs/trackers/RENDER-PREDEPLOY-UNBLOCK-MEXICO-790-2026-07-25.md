# RENDER PRE-DEPLOY UNBLOCK — Mexico CoL checksum (2026-07-25)

PR: https://github.com/tioperfumes07/IH35-TMS/pull/3558

## ROOT CAUSE

`db:migrate` (Render pre-deploy) throws "modified after apply" on
`202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql`.

Owner Neon-applied it `2026-07-25T21:55:01.713Z` with `account_number` **6890** for
TRANSP+USMCA; ledger recorded `d709ac50…`. Committed disk body still carries the
NULL-placeholder text, sha256 `8429d949…`. The runner refuses on the existing ledger
row before any follow-up file, so every deploy since 21:55Z aborts — blocking #3553.

## FIX

Add the ledger↔disk pair to `migration-checksum-overrides.json` (sanctioned skip),
pin ledger truth, move the stale `superseded` entry to `applied_held`. No SQL edit,
no Neon DDL, no re-apply; file stays in the held skip-set.

## GUARD

- `verify-migration-checksum-overrides-match-disk` (37, green)
- `verify-prod-ledger-checksum-parity`
- `verify-held-registry-ledger-parity`
- `verify-hold-migrations-registered`
- `verify-held-registry-integrity`

All green.

## LIVE PROOF

Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`:

- `_system._schema_migrations` row `202607790000` checksum
  `d709ac509f113e7f42e7bf9f7b94c0fa0ef740f5157a7598f7d76402c8096101`
- `applied_by` `jorge-neon-hand-apply` @ `21:55:01.713Z`
- disk sha256 `8429d94902bd28c3a8fdfc8958e795d8044ce36410f0ce1ba6ffe90643b5c718`
- accounts TRANSP **6890** + USMCA **6890** live; `driver_pay_expense`→6890 active on both
- Only drift in the 743-row ledger sweep

## REMAINING

1. Owner applies `JORGE-APPROVED` on #3558; merge; prove Render deploy `live` and health
   version ancestry includes `2bdac206` (or later tip) — not `ce05d91`.
2. Fresh-DB parity forward migration (held, non-blocking) so a from-0001 DB can seed 6890
   without relying on the drifted applied body.
3. Land `202608080000` / `202608100000` on main (separate lanes; not this PR).

## Prove after merge + redeploy

```bash
curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow
# version must be ancestry of 2bdac206 (or later tip), NOT ce05d91
```

Fleet catalog CREATE must stop 500ing (#3553 RETURNING-comment fix).
