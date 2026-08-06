# DESIGN / EVIDENCE (build-and-ship) — Plaid bank reconcile-COMMIT (CONN-1)

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

- **Block:** `CONN-1-plaid-reconcile-commit` — "CONNECTIONS / TASK 1 — Plaid bank reconcile-commit (enable the commit)"
- **Module:** banking · **Pile:** NEEDS-PROD · **Classification:** FINANCIAL CLUSTER, **Tier 1 (writes GL)**
- **Status:** DESIGN / EVIDENCE ONLY. **No code in this PR.** The block registry (`.block-ready/CONN-1-plaid-reconcile-commit.json`)
  already correctly reads `PENDING (GATED)`. This doc records the honest verdict and the exact owner ceremony
  so the block stops looping through the audit as an ambiguous "gap".
- **Branch:** `design/conn-1-plaid-reconcile-commit-hold` (pinned to `origin/main` @ `e2db37a74`)
- **CPA posture (loaded `ih35-accounting-decisions`):** reuse the existing poster; write NO new GL math;
  flags default OFF; the commit is the **owner's hand** — the builder never runs a live reconcile-commit.

---

## 1. Honest verdict — NOT a code/UI/wiring gap

| Question | Evidence (`origin/main` @ `e2db37a74`) | Verdict |
|---|---|---|
| Does the reconcile-commit code exist? | `apps/backend/src/accounting/bank-recon/{recon-worklist.service.ts, match.service.ts, recon-worklist.routes.ts}` all present; UI accept/reject in `apps/frontend/src/pages/banking/BankReconciliationPage.tsx` (`acceptBankReconMatch` / `rejectBankReconMatch`). | ✅ BUILT |
| Does it reuse the proven poster (no new GL math)? | `match.service.ts` links `matched_journal_entry_id`; commit reuses the CHAIN-05-proven posting engine (recorded 2026-07-12). | ✅ CONFIRMED |
| Do the guards pass? | `verify-bank-recon-poster-ledger-account-id` → OK; `verify-recon-no-green-on-no-data` → PASS ("zero-connection tick fails loudly; skip path leaves an audit trace"); `verify-bank-recon-match-tenant-scope`, `verify-bank-recon-variance-uses-q8`, `verify-bank-recon-tolerance-from-q11` present. | ✅ GUARDED |
| Has a reconcile session ever COMMITTED on prod? | Recorded evidence 2026-07-12: **0 reconciliation sessions** on TRANSP. | ❌ NEVER EXERCISED |

**Conclusion:** the *only* thing outstanding is a **live, owner-gated Tier-1 exercise** (a real session that
posts matches, locks, ties to the GL, and is reversible). A guard that passes on code shape while **0 sessions
exist proves nothing about the commit** — per the block's own `acceptance[]` (`zero_count_means: PENDING`),
this **must read PENDING (GATED)**, never DONE, and it is **not** something the builder can close by writing code.

There is **no UI/wiring gap to fix here** — so, per the dispatch instruction, this is an **evidence note**, not
a rebuild. Rebuilding proven, guarded code would be a patch-over-a-non-defect (Rule 16 forbidden).

## 2. Linkage (already wired in code)
`banking.bank_transactions` ↔ bank reconciliation sessions/matches ↔ `accounting.journal_entries` ↔
`catalogs.accounts` ↔ `audit.row_changes`; per `operating_company_id`; reversible (void-not-delete).

## 3. Owner ceremony to move CONN-1 from PENDING → DONE (Tier 1 — owner's hand only)
1. Owner picks an entity + period with a synced Plaid feed and open matchable ledger rows.
2. Owner (or with explicit per-action OK) runs one reconcile session: accept matches → post → lock.
3. GUARD proves live (RLS-immune, per-entity GUC, positive control before trusting any 0):
   - `> 0` committed reconciliation sessions for that entity,
   - matched rows carry `matched_journal_entry_id`, JE debits = credits, tie to the register,
   - the session is reversible (void-not-delete).
4. On that live proof, flip the block to DONE with the Neon evidence attached. **Flags stay OFF until then.**

**No code ships from this document.** Builder stops here (financial cluster Tier 1, Rule 13).
