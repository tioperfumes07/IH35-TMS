# QBO Mirror — Single Canonical Source (DESIGN — owner approval required before any code)

**Block:** Tier-1 Batch1 #03 (0008-g3 / 0091-e1-1 / 0243-e1-1, consolidated). **Date:** 2026-07-10.
**Status:** DESIGN-ONLY. No table drop, no repoint, no migration in this deliverable. The canonical
choice below requires the owner's explicit approval before any code repoint block is cut.

---

## 1. The defect (verified)

The QBO master-data mirror exists in **two physical copies**, written by different code paths, risking
divergence and split-brain reads (reconciliation / catalog logic can read the wrong copy).

- **Prod fact (prior-agent-verified 2026-07-10; NOT re-verifiable in this pass — Neon MCP was
  disconnected mid-session, flag as UNVERIFIED-NOW):** `accounting.qbo_accounts` = 1647 rows AND
  `mdata.qbo_accounts` = 1647 rows (identical). `accounting.qbo_vendors` and `mdata.qbo_vendors` both
  exist; `mdata.qbo_items` exists. → re-run a live count before executing any repoint.
- `accounting.qbo_*` was cloned `LIKE mdata.qbo_*` — same shape, second physical copy.

## 2. Code inventory (repo grep, `apps/backend/src`, 2026-07-10 — repo-verifiable)

### Writers/readers of `accounting.qbo_*` (the copy recommended for RETIREMENT)
| file | hits |
|---|---|
| `sync/qbo-accounts-push.ts` | 12 |
| `onboarding/usmca-carrier-bootstrap.ts` | 8 |
| `sync/qbo-vendors-push.ts` | 5 |
| `sync/qbo-customers-push.ts` | 5 |
| `sync/qbo-accounts-status.routes.ts` | 5 |
| `sync/qbo-vendors-status.routes.ts` | 2 |
| `sync/qbo-customers-status.routes.ts` | 2 |
| `qbo-subaccount-setup/usmca-bootstrap.ts` | 1 |
| `integrations/integrity-monitors/driver-vendor-mapping.ts` | 1 |

→ Concentrated in the older `sync/*` push family + the USMCA bootstrap. ~9 files.

### Writers/readers of `mdata.qbo_*` (recommended CANONICAL)
| file | hits |
|---|---|
| `qbo/push.service.ts` | 14 |
| `qbo/master-data-sync.service.ts` | 12 |
| `mdata/qbo-autocomplete.routes.ts` | 11 |
| `mdata/qbo-master-write.routes.ts` | 9 |
| `qbo-sync/drift-detector.ts` | 8 |
| `accounting/qbo-recon-reads.ts` | 7 |
| `outbox/handlers/tms-{vendor,customer,item,invoice,account}-push.handler.ts` | 5–6 each |
| `accounting/qbo-master-read.routes.ts` | 6 |
| `reconciliation/reconciliation-worker.service.ts` | 4 |
| `qbo/sync-conflict-detection.routes.ts` | 4 |
| `lists/names-master.routes.ts` | 4 |
| `integrations/qbo/mirror-integrity.service.ts` | 4 |
| `qbo-sync/master-data-anchor-drift.ts` | 3 |
| (+ `sync/qbo-{accounts,vendors,customers}-push.ts` also touch mdata, 3 each) |

→ Broad adoption: the **reconciliation worker + all six outbox push handlers + drift detector +
master-data-sync + the recon reads** already use `mdata.qbo_*`.

## 3. Recommendation — canonical = `mdata.qbo_*`

The evidence points one way:
1. **The reconciliation path already reads `mdata.qbo_*`** (`accounting/qbo-recon-reads.ts`,
   `reconciliation-worker.service.ts`, `qbo-sync/drift-detector.ts`). Reconciliation is the whole point
   of the parallel-books architecture — the canonical copy must be the one it reads.
2. **The live outbox push handlers** (`tms-*-push.handler.ts`) — the current write-back gate path — mirror
   into `mdata.qbo_*`.
3. `accounting.qbo_*` is fed mainly by the **older `sync/*` push family** and the USMCA bootstrap — a
   narrower, more-retireable surface (~9 files) than `mdata.qbo_*` (~20 files).

**Retire `accounting.qbo_*`; make `mdata.qbo_*` the single source.**

## 4. Retirement plan (ADDITIVE — no drop; each step owner-gated where it touches schema/data)

1. **Re-verify prod counts** (Neon prod branch) that the two copies are identical per entity before touching anything.
2. **Repoint writers:** the `sync/qbo-*-push.ts` family + `usmca-carrier-bootstrap.ts` +
   `qbo-subaccount-setup/usmca-bootstrap.ts` write to `mdata.qbo_*` (or dual-write during cutover), so
   nothing new lands only in `accounting.qbo_*`.
3. **Repoint readers:** `sync/qbo-*-status.routes.ts` + `integrity-monitors/driver-vendor-mapping.ts`
   read `mdata.qbo_*`.
4. **Deprecate (do NOT drop) `accounting.qbo_*`:** mark deprecated in a comment + migration note; keep the
   table (void-not-delete / additive-only). A physical drop needs the owner saying "remove X" in writing.
5. **CI guard** (`verify-no-new-accounting-qbo-mirror-writer`): fail if any NEW code writes
   `INSERT/UPDATE ... accounting.qbo_{accounts,vendors,customers,items,invoices,bills}`. Grandfather the
   current writers on an allowlist that shrinks as they are repointed.

## 5. Acceptance (for the follow-on CODE block, not this doc)
- Committed inventory (this §2) kept current.
- After repoint: exactly one writer + one reader path per entity type; per-entity counts reconcile
  `mdata.qbo_*` == prior `accounting.qbo_*`.
- CI guard present and proven (fails on a new `accounting.qbo_*` writer).

## 6. Owner decision required
- **Confirm canonical = `mdata.qbo_*`** (or choose `accounting.qbo_*` instead — then the retirement set
  inverts). No code repoint proceeds until this is confirmed in writing.
- This is Tier-1 (financial master data + would eventually touch schema): the code block that executes the
  repoint is BUILD-AND-HOLD, never self-merged.

## 7. Provenance
- Repo inventory: `grep -rE 'accounting\.qbo_*|mdata\.qbo_*' apps/backend/src` (excl. tests), 2026-07-10.
- Prod row-count facts: prior-agent live read 2026-07-10 (Neon `br-fancy-credit-akjnd07a`); re-verify before code.
- Design-only. No money state, schema, flag, or posting changed.
