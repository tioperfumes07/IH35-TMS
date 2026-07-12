# `maint` vs `maintenance` schema canonicalization — 0519 DC2 / S1 (DESIGN DOC — owner-gated)

Status: DESIGN ONLY. Consolidating two schemas that both hold maintenance data is a schema/data-migration +
write-path change → financial-cluster per §1.4; an agent does not self-author/merge it. Source: manifest rows
`0519-dc2` and `0519-s1` (same underlying finding, two section IDs — **S1 is a duplicate of DC2**).

## The defect (verified in repo, this session)
- The canonical LINKAGE map (standards §10(b)) names **`maintenance.*` CANONICAL** and
  **`maint.part` / `maint.pm_schedule` / `maint.position_*` / `maint.part_position_assignment` RETIRE.**
- But `apps/backend/src/maint/parts.routes.ts` still **actively WRITES the RETIRE schema** — confirmed:
  `INSERT INTO maint.part (...)` (line ~112), `UPDATE maint.part` (line ~173), reads `FROM maint.part`
  (line ~89); `apps/backend/src/maint/pm.routes.ts` similarly references `maint.pm`. Writing a RETIRE table is
  exactly what LINKAGE guard **G4** forbids.
- Manifest: `maint` holds ~144 rows actively receiving data alongside `maintenance` (~17,286 rows); queries
  against `maintenance` **miss** the `maint` rows → split-brain / under-counted maintenance data.
- The cited verdict doc `docs/audits/SCHEMA-CANONICALIZATION-VERDICTS-2026-06-28.md` exists but does **not**
  rule on the `maint` vs `maintenance` pair (only bank/banking, factor/factoring, settlement variants).

**Re-verify against prod (§0):** row counts (144 / 17,286), and that `maint.part`/`maint.pm` still exist and
receive writes, before authoring anything. Counts are UNVERIFIED audit claims.

## Canonicalization verdict (proposed, for the owner to ratify)
**`maintenance.*` is canonical; `maint.*` retires.** Rationale: `maintenance.*` already holds the overwhelming
majority of rows, is the schema named canonical in §10(b), and the WO module + `maintenance.work_orders` hub
(§10 hub table, 21 refs) is built on it.

## Approach (owner-gated, phased — additive-only, void-not-delete)
1. **Column-map the two schemas (gated prod read):** `maint.part → maintenance.parts`,
   `maint.pm → maintenance.pm_schedules`, etc. Identify every column and its canonical target; note gaps.
2. **Repoint the WRITE paths first (backend, no data move yet):** change `maint/parts.routes.ts` and
   `maint/pm.routes.ts` to INSERT/UPDATE the canonical `maintenance.*` tables. This is a backend change that
   touches maintenance data-model wiring → still owner-gated (writes maintenance rows), but it STOPS new
   divergence immediately and is the highest-value first step. Ship behind the existing WO plumbing.
3. **Backfill the 144 `maint.*` rows → `maintenance.*`** via an idempotent migration (dedupe on natural key;
   `ON CONFLICT DO NOTHING`); set `is_active`/audit; **never DELETE** the `maint.*` rows — mark them
   migrated (`archived_at`) and leave read-only for provenance.
4. **Read paths:** repoint any remaining readers of `maint.*` to `maintenance.*`; verify no report under-counts.
5. **Retire:** once zero writers/readers remain, leave `maint.*` as archived read-only (additive-only — never
   drop the schema without an explicit owner "remove X").
**Guard:** a `scripts/verify-no-maint-schema-writes.mjs` asserting no `INSERT INTO maint.`/`UPDATE maint.` in
`apps/backend/src` (aligns with LINKAGE G4). Buildable NON-FINANCIAL **after** step 2 repoints the writers —
until then it would fail on the existing legitimate-but-to-be-migrated code.

## Owner gates
- Ratify `maintenance.*` as canonical (or override).
- Approve the write-path repoint (step 2) and the backfill migration (step 3) — schema/data, financial-cluster.

## Disposition
DC2 and S1 both resolve via this single plan. No code changed in this pass (repoint + backfill are owner-gated).
