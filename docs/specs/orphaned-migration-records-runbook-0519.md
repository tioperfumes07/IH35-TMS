# Orphaned applied-migration records — 0519 MIG2 (DESIGN / RUNBOOK — owner-gated)

Status: DESIGN/RUNBOOK ONLY. Touches the migration ledger (`ih35_migrations.applied_migrations`) → any
remediation is migration-adjacent / financial-cluster; an agent does not modify the ledger or force checksums.
Source: manifest row `0519-mig2-4-applied-migrations-no-file-on-disk` (tier-3, needs-design).

## The claim
4 rows in `ih35_migrations.applied_migrations` (applied on prod) have **no matching file** in `db/migrations/`
— a recovery gap: if the DB were rebuilt from files, those 4 changes could not be re-run, and the ledger no
longer maps 1:1 to source. **UNVERIFIED** at repo level — needs a gated prod read to identify the 4 specific
rows.

## Step 1 — Identify the 4 (gated prod read, owner-run or explicit per-read OK, §1.5)
```
-- ledger rows with no corresponding db/migrations/ file:
SELECT id, name, checksum, applied_at
FROM ih35_migrations.applied_migrations am
WHERE NOT EXISTS (
  -- compare am.name / numeric prefix against the on-disk file list (compiled from `ls db/migrations/`)
  SELECT 1 FROM (VALUES ('<file1>'), ('<file2>'), ...) AS files(fname)
  WHERE files.fname LIKE am.name || '%'
)
ORDER BY applied_at;
```
(Practically: dump `SELECT name FROM ih35_migrations.applied_migrations ORDER BY 1` and diff against
`ls db/migrations/*.sql` — the 4 with no file are the orphans.)

## Step 2 — Classify each orphan (owner decision)
For each of the 4, determine which case it is:
- **(a) Renamed/renumbered file** still present under a different name → reconcile via
  `db/migrations/checksum-overrides.json` (the existing mechanism — see memory
  `never-edit-applied-migration-checksum-freeze`), do NOT edit the applied file.
- **(b) Legitimately-applied one-off** (hotfix/manual DDL) with no committed file → **recover the SQL** (from
  the schema it produced / PR history) into a NEW, idempotent, higher-numbered file so a fresh rebuild
  reproduces it. Ledger row stays; the file gap closes going forward.
- **(c) Truly orphaned/erroneous** ledger row → owner decides; ledger is effectively append-only, so document
  rather than delete.

## Step 3 — Document (this runbook)
Record the 4 names + disposition here once identified, so the next rebuild is deterministic. **REC-15.**

## Guard (buildable NON-FINANCIAL, but needs the prod ledger list)
A `scripts/verify-migration-ledger-file-parity.mjs` can assert every **on-disk** `db/migrations/*.sql` is
well-formed/numbered and (once the expected ledger set is captured as a committed fixture) flag drift. It
cannot by itself read prod; the authoritative check is the Step-1 query. Deferred until the 4 are identified.

## Disposition
No code/ledger change this pass — identification requires a gated prod read; remediation is owner-gated.
