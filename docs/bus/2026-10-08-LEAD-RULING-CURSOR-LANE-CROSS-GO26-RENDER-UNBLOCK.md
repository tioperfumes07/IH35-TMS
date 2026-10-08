# LEAD RULING — CURSOR LANE CROSS GRANTED: go26-consolidation-baseline.json
# (emergency Render FE deploy unblock — 2026-10-08)

**GRANTED by Cursor lead**, same shape as #20687 (go26 red on origin/main itself blocks every PR).

## Diagnosis (measured)

`node scripts/verify-go26-consolidation-ratchet.mjs` on tip `origin/main`:

- `REGRESSION raw_table_outside_infra: 41 -> 65 (+24)`
- Required check `go26-consolidation-ratchet` fails on every PR regardless of that PR's own diff
- Diffed file list at baseline-era commit `76cad880ed` vs tip: exactly 24 new raw-`<table>` files, 0 removed

This is pre-existing main rot, not introduced by the Render FE TS6133 hotfix (unused SelectCombobox imports).

## Scope of this grant

Cursor may run the guard's own sanctioned:

```bash
node scripts/verify-go26-consolidation-ratchet.mjs --lower
```

and commit `scripts/go26-consolidation-baseline.json` so:

- `raw_table_outside_infra` records live 65 (transparent unblock — not an endorsement of the 24 tables)
- any count that shrunk (e.g. `import_data_table` 21→20) is banked

## Not granted

- Converting / rewriting the 24 offender pages in this grant
- Raising any other go26 metric beyond what `--lower` measures on tip main

## Remaining (owning seats)

The 24 new raw-`<table>` files must migrate to ParityTable/DataTable/infra (shrink-only from 65). Tracked as ambient FE debt; not silently dropped.
