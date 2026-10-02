# Population diff — Cursor 642 vs Owner 632

**Measured:** 2026-10-02 · Cursor census `artifacts/engine-audit-632/` (merged #24201) · Owner workbook
`~/Downloads/10-02-2026-IH35-ENGINE-AUDIT-632-ENGINES.xlsx` sheet **1 ENGINE REGISTER**

## Cursor selection criteria (send this)

Source of truth: `scripts/ops/engine-audit-632-independent.mjs`

1. Walk `apps/backend/src` recursively (skip `node_modules`, `dist`).
2. Keep files whose **basename** matches `/\.(service|cron|worker|job|engine)\.ts$/`.
3. Exclude basename containing `.test.` and any path under `__tests__/`.
4. Reachability (WIRED / TEST-ONLY / ORPHAN): build the import graph from all production `.ts`
   under `apps/backend/src`, resolving relative `from './…'` / `import('./…')` specs with the
   **`.js` extension stripped** before filesystem resolve (without that strip the graph falsely
   reports ~0 wired / ~632 orphan).
5. Writer / money-writer / nine-check flags derived from static source text (same METHOD sheet 5/7).

Identical population rule as the workbook banner: *every file in apps/backend/src named
.service / .cron / .worker / .job / .engine*.

## Counts

| metric | Cursor | Owner sheet 1 | Diff |
|---|---:|---:|---:|
| population | **642** | **632** unique engine paths (634 data rows − blanks) | **+10 net** |
| writers | **348** | 333 (published) | +15 |
| only in Cursor | **11** | — | tip growth after owner scan |
| only in Owner | — | **1** | deleted or never on tip Cursor scanned |

Net: 632 − 1 + 11 = **642**.

## The 11 extra files (Cursor only — tip engines owner sheet missed)

1. `accounting/bank-recon/bank-match-fuel-post.service.ts`
2. `cron/telematics-preservation.cron.ts`
3. `driver-finance/settlement-ap-chain.service.ts`
4. `driver-finance/settlement-line-categorize.service.ts`
5. `driver-finance/settlement-pay-line.service.ts`
6. `factoring/repurchase-due.service.ts`
7. `factoring/reserve-by-customer.service.ts`
8. `feed/document-expense-ingestion.service.ts`
9. `mdata/canonical/variant-candidates.service.ts`
10. `telematics/odometer-manual-upsert.service.ts`
11. `telematics/preservation.service.ts`

## The 1 owner-only path (not in Cursor 642 CSV)

- `telematics/arrival-detection.service.ts` — **not present** under `apps/backend/src` on the tip
  Cursor measured (renamed/removed/never landed). Owner should drop it or confirm a different path.

## Reading / correction

Cursor population is the tip set. Owner's 632 is short by the 11 tip engines (and long by 1 stale
path). **Correct the workbook up to 642** (add the 11, remove arrival-detection) — do not defend 632.
Writer count +15 tracks the same tip growth plus any writer-classifier FP the owner already named
(comment counted as money write).

NO production writes.
