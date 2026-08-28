# TXH-01 — SYS-F-TRANSACTION-HEALTH-REGISTER
**OWNER APPROVED 2026-08-28** ("yes" to spec + read-only backend). Cursor lead landed this file.

## LIVE THIS SESSION (do not copy Claude's spec-time SHAs)

Verified **2026-08-28 ~16:48Z** by Cursor (not memory):

| Surface | How | Value |
|---------|-----|--------|
| Backend | `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` | **`069d531`** (`ok:true`) |
| Frontend | `GET https://app.ih35dispatch.com/version.json` | **`6230c39`** (`builtAt` 2026-08-28T16:48:12.624Z) |
| Claude spec-time (STALE) | claimed backend `08d96f7`, frontend `de04cbf` | **do not judge the matrix against these** |

Frontend and backend **deploy separately**. Scoreboard / `/system` chrome = **frontend `version.json`**. Detectors / API = **healthz `version`**. A mismatch is `DEPLOY MISMATCH`, not a failed detector.

**Seats:** **one Devin** (owner 2026-08-28). `INBOX-DEVIN-A` / `FEED/NOW-DEVIN-A` are **VOID as a second seat**. Do not dual-dispatch.

**`/system` tabs (code vs live USMCA):** `SYSTEM_TABS` in `SystemModulePage.tsx` is **7** labels (includes QBO Reconciliation + QBO Sync). Live **USMCA hides QBO**, so the owner sees **5**: Overview · Program Tracker · Software / Build · Ledger Health · Claude Coder. This block adds **Transactions** → **6 visible on USMCA**, **8 in the full `SYSTEM_TABS` array**. Update `scripts/verify-system-module.mjs` with the new label in the **same** build PR. `docs/approved-screens/system.png` was **not found** in-repo this turn — build PR must add/update it (Rule 05).

---

# TXH-01 — SYS-F-TRANSACTION-HEALTH-REGISTER · System → Transactions: every document, and whether it is sick
**FINDING:** SYS-F-TRANSACTION-HEALTH-REGISTER (P1) · **Lane:** NON-FINANCIAL · **Module:** system.

## RESPOND-BEFORE-CODING (Rule 00/02)
**Spec sources reviewed:** this file; live healthz `069d531`; live `version.json` `6230c39`; `SystemModulePage.tsx` `SYSTEM_TABS`; Claude block 2026-08-28.
**Approved screens:** `docs/approved-screens/system.png` — **MISSING in repo this turn** — must ship with the build PR.
**Tab count:** USMCA visible 5 → **6** (Transactions). Code array 7 → **8**.
**NEW SPEC:** yes — owner approved 2026-08-28.
**Deviations:** none.

## THE LOAD-BEARING RULE
**Read-only. Additive. NO migration, NO new table, NO `health_status` / `transaction_status` / `is_healthy` column.** Status is **computed at read time** from the ledger and **never stored**. Persisting status is the `MODULE_PROGRESS` N-of-N disease.

## Backend
`GET /api/v1/system/transaction-health` — owner-only, entity-scoped, cursor pagination.
`apps/backend/src/system/transaction-health.service.ts` — **no INSERT/UPDATE/DELETE**.
Every DB read: explicit transaction; `SET LOCAL app.bypass_rls` as **its own statement** (never CTE `WITH b AS (SELECT set_config)`).

Documents: invoice · bill · bill_payment · customer_payment · expense · journal_entry · factoring_batch · settlement.

| Field | FAIL / special |
|---|---|
| `posted` | no JE for a document that should have one |
| `balanced` | JE debit − credit ≠ 0 |
| `linked` | any required F+R edge missing |
| `sample_consistent` | doc flag ≠ JE flag (ACCT-F210). `factoring.batch` → **`UNVERIFIABLE`** (no `is_sample_data` / `created_at`) — never fake OK |
| `findings[]` | open `_system.reconciliation_findings` naming this doc |
| `status` | derived: FAIL if any FAIL; WARN if sample-inconsistent or findings-only; else OK |

Default UI filter: **Show only issues**. Entity filter: TRANSP + USMCA + TRK (not USMCA-only). Issues **include unposted**.

Row click → existing document route. No new detail surface.

**RETIRE:** this block **reads** `mdata.vendors` for labels only. Owner still owes RETIRE-vs-live ruling; not inferred here.

## GUARD (build PR — claim-reserve EVEN Cursor band first)
`scripts/verify-transaction-health-computed-not-stored.mjs` + claimed `NNNN`.
1. No migration adds health/status column.
2. Service has no INSERT/UPDATE/DELETE.
3. `posted` via `getPostingBySource` / `transaction_source_links`, not a document status column.
4. Bypass is own `SET LOCAL` statement.
5. `operating_company_id` filter.
6. `factoring_batch.sample_consistent` cannot be planted `"OK"`.
7. Zero document types wired = FAIL.

## ACCEPTANCE
Known-bad must FAIL: factoring batch `583d6d03-e545-4c86-9ec7-0c9af3e38b52` (`factor_id` NULL) and pledged invoice `6708d422-35c5-44c2-842e-b789991c7c3f` (`factoring_status='not_factored'`). If they show OK, the register is lying.

Proven on USMCA `5c854333` and TRANSP `91e0bf0a`. Judge the tab on **frontend `version.json`**, not backend healthz.

## GIT-GATE KEYS (build commit)
```
FINDING: SYS-F-TRANSACTION-HEALTH-REGISTER
LANE: NON-FINANCIAL
DOD-A: UNVERIFIED
DOD-B: N/A
DOD-C: UNVERIFIED
DOD-D: N/A
DOD-E: UNVERIFIED
VERIFY-1: UNVERIFIED
VERIFY-2: N/A
VERIFY-3: UNVERIFIED
VERIFY-4: UNVERIFIED
VERIFY-5: UNVERIFIED
VERIFY-6: UNVERIFIED
VERIFY-7: UNVERIFIED
VERIFY-8: UNVERIFIED
MODULE_PROGRESS: system UNVERIFIED
ITEMS_TOUCHED: SYS-F-TRANSACTION-HEALTH-REGISTER
MIGRATE: N/A
ROOT CAUSE: Findings are per account/company; documents are per document; no join, so a wrong balance cannot be traced to a bill from any screen.
FIX: Read-only GET /api/v1/system/transaction-health + System → Transactions; status computed never stored.
GUARD: claim-reserve then verify-transaction-health-computed-not-stored
LIVE PROOF: UNVERIFIED — spec only. Spec-land live: backend 069d531, frontend version.json 6230c39.
REMAINING: (1) factoring.batch is_sample_data + created_at = FINANCIAL-HOLD G1 family. (2) mdata.vendors RETIRE ruling. (3) claim-reserve NNNN. (4) system.png. (5) build.
```
