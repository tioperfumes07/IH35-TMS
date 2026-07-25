# DESIGN HOLD — 0007-pattern-5 split-brain escrow engines (2026-07-21)

**Status:** `[HOLD-FOR-JORGE]` — docs-only. No schema drop, no writer redirect, no Neon-apply.  
**Block:** `0007-pattern-5-split-brain-engines` (accounting pile / NEEDS-PROD → Neon-resolved).  
**Neon evidence:** `docs/trackers/NEEDS-PROD-NEON-VERDICTS-2026-07-21.md` §8 (merged via PR #3117).

## What Neon proved

| Fact | Evidence |
|---|---|
| Parallel escrow **schema** exists | `accounting.*` escrow tables **and** `driver_finance.*` escrow / ledger structures both present (`to_regclass`) |
| Live **data** divergence | **None** — both engines empty (0 posting rows); only seed `catalogs.escrow_types` (3 rows, 2026-05-13) |
| Risk window | **Open now** — first live escrow posting into the wrong store creates irreversible split-brain money |

## Law (do not invent)

- Driver escrow = **liability** (CPA skill / Architecture Blueprint).
- Canonical store must be **one** of: `accounting.escrow_*` **or** `driver_finance.escrow_*` — never both writers.
- Never delete the non-canonical tables; archive + redirect writers (Rule 07 / never-delete).
- CoA roles PRIMARY for any liability account binding; no new GL account invent.

## Owner questions (answer before any code)

1. Which schema is **canonical** for driver escrow postings going forward — `accounting.escrow_*` or `driver_finance.escrow_*`?
2. Confirm the non-canonical schema stays **read-only / archived** (routes that write it get redirected or fail-closed).
3. Confirm first live posting only after the chosen store has RLS + grants + CoA role (`escrow_liability` or locked role name) designated.

## Builder must not

- Drop either schema.
- Neon-apply a “pick winner” migration without `JORGE-APPROVED`.
- Seed invent escrow GL accounts.
- Claim STALE — the structural gap is real even with zero rows.

## Follow-up (named)

After owner answers Q1–Q3: financial-cluster PR — additive redirect + fail-closed on the non-canonical writer + Rule-17 guard that only one escrow posting engine is reachable.

---

## ACCT-R-01 update (2026-07-25) — code archaeology found the REAL defect; NOT a pick-a-winner redirect

**This is the ACCT-R-01 finding follow-up. It answers the split-brain framing above with live-code evidence
instead of picking a winner, and does NOT redirect or stop either writer (Rule 07 — never delete/disable a
working write path).**

Live read of every write path into the 6 escrow tables (2026-07-25) shows this is **not** two competing
ledgers for the same concept:

- `driver_finance.escrow_balances` / `escrow_ledger` — the legitimate **operational per-driver
  running-balance store**. Read by: `apps/backend/src/banking/escrow-visualizer.routes.ts`,
  `apps/backend/src/banking/banking.routes.ts` (account register), `master-data/drivers/operations-depth/
  escrow-history.service.ts` (driver profile history tab), `driver-finance/escrow-resolver.service.ts`'s
  `readDriverEscrowBalanceCents()` (the $2,000 settlement-cap check). Written by
  `driver-finance/settlement-payrun-close.service.ts`'s `recordEscrowContribution()` and
  `settlements/approval.service.ts`'s `updateEscrowBalance()`.
- `accounting.escrow_accounts.balance_cents` — the **GL-linked liability balance**.
  `driver-finance/escrow-separation.service.ts`'s `releaseDriverEscrowSeparation()` reads THIS balance as
  authoritative before calling the existing `releaseEscrow()` (Block-23, `accounting/escrow/service.ts`),
  which itself enforces `amount_cents <= balance_cents` (throws `escrow_release_exceeds_balance`
  otherwise).

**The actual bug:** the two writers above (contribution/hold) NEVER updated
`accounting.escrow_accounts.balance_cents` — only `depositEscrow()`/`postEscrowTransaction()` do that, and
nothing on the contribution path called it. So every real driver-settlement escrow contribution would
correctly credit the driver's escrow liability sub-account via the settlement's own JE, but
`accounting.escrow_accounts.balance_cents` would stay at **0 forever**. On separation,
`releaseDriverEscrowSeparation()` would then compute `net_release_cents` off that stale 0 balance —
returning **$0 to a driver who is actually owed real escrow**, or throwing
`escrow_release_exceeds_balance` for any non-zero release attempt. This was a live, silent, driver-payment
defect waiting to fire on the first real separation+release — exactly the "before either engine takes live
money" window §8 of `docs/trackers/NEEDS-PROD-NEON-VERDICTS-2026-07-21.md` warned about.

**The fix (PR fix/acct-r01-escrow-canonical-sync):** neither table is redirected or stopped.
`accounting/escrow/service.ts` gains `recordEscrowPostingOnly()` — inserts ONE
`accounting.escrow_postings` row (no new JE; the JE already exists or is intentionally absent per the
caller's own doc comments) so the EXISTING `accounting.apply_escrow_posting_delta()` AFTER-INSERT trigger
(migration 0234) applies the balance delta. Called from both writers immediately after their
`driver_finance.*` write. Guard `scripts/verify-acct-r01-escrow-canonical-write-path.mjs`
(verify-step 1489) fails CI if a future writer reintroduces the asymmetry.

**Answering the owner questions above with evidence, not a guess:**

1. Canonical for the *operational* per-driver running balance (UI, cap-check): `driver_finance.escrow_balances`/`escrow_ledger` — unchanged, still authoritative for those reads.
2. Canonical for the *GL liability balance* consulted at release time: `accounting.escrow_accounts.balance_cents` — now correctly kept in sync instead of staying stale at 0.
3. Neither schema is archived/stopped — both are legitimate, distinct-purpose stores per Rule 07. The risk this HOLD flagged (first live posting landing in a store the release flow doesn't read) is closed by the sync, not by elimination.

No migration required (both tables + the trigger already existed on prod per §8's `to_regclass` proof).
No Neon-apply gate — this is an app-code sync fix, not a schema change. LANE: FINANCIAL — still requires
Financial-Agent review + `JORGE-APPROVED` before merge per Rule 13 (money-posting logic change), same as
any other accounting.* write-path PR.
