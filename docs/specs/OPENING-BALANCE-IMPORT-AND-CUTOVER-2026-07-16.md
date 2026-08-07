# Opening-Balance Import (re-syncable) + 04/01/2026 Cutover — design (build-and-ship)

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

**Authoritative build spec.** Owner decisions LOCKED (GUARD → CODER, 2026-07-15). Every code/migration piece is
**financial → build-and-ship**: owner approves + applies migrations on Neon; GUARD validates each migration on a
throwaway PG (apply-twice) and re-proofs live. **QBO is never written to.** This doc captures the design so it
can't drift before the sequence reaches it; it does not authorize a build ahead of the sequence.

> **⚑ OWNER-FINAL UPDATE (2026-07-16, Ch.11) — SUPERSEDES the prior 07/01/2026 cutover / 06/30/2026 opening lock.**
> **New locked dates: opening balances as of 03/31/2026; parallel live posting + daily TMS↔QBO reconcile from
> 04/01/2026.** **Reason:** Chapter 11 was approved end of March 2026 → the books change in April, so **03/31/2026
> is the fresh-start line.** Owner decides the figures; the accountant's embezzlement cleanup (Anarely / Ignacio
> Muñoz) keeps re-syncing into provisional opening balances until the owner locks them. **Impact:** April, May, and
> June 2026 move from "mirror QBO" to **LIVE TMS posting** (3 additional live months vs the old 07/01 line) — expected.

## Locked owner decisions
- **Cutover date: 04/01/2026** (Ch.11 fresh-start; supersedes 07/01/2026). Pre-04/01 = TMS **mirrors QBO exactly**;
  post-04/01 = TMS **posts live in parallel** and reconciles daily vs QBO. QBO stays the system of record through cutover.
- **Opening balances = QBO Balance Sheet / Trial Balance as of 03/31/2026, per entity** (TRANSP, TRK;
  USMCA ≈ 0 — TMS-authoritative from day one, no QBO).
- **Re-syncable, not frozen.** The accountant is still finalizing the embezzlement cleanup, so pre-04/01 QBO
  numbers will change. The opening balance must be **re-pullable** and re-posted (void-and-repost or a dated
  adjustment) — **never hand-edited**. Every version is kept (audit trail of how opening balances evolved).

## Build components (all HOLD)

### 1. Re-syncable opening-balance snapshot (NOT a frozen JE)
- New table (additive migration, FORCED RLS, grants, idempotent): per `operating_company_id`, `as_of`
  (=2026-03-31), rows of `{account_ref, amount, pulled_at, snapshot_version}`, pulled from the QBO
  BalanceSheet / TrialBalance report.
- **Re-pull flow:** on demand (accountant finalizes cleanup) → pull fresh snapshot → `snapshot_version++` →
  **diff vs the prior version** → drive a re-post of the opening entry (§3). Keep all versions (append-only
  history; void-not-delete).

### 2. QBO-account → canonical mapping
- Map each QBO account to a `catalogs.accounts` row **via `mdata.qbo_*` (canonical), never `accounting.qbo_*`
  (RETIRE)**.
- **DEPENDS ON the QBO dual-write collapse**, which adds the sync columns to `mdata.qbo_*` and repoints the
  writers/readers. **Sequence that collapse FIRST.**
- **Owner must confirm the QBO account → `catalogs.accounts` mapping before the opening JE posts.**

### 3. Opening JE dated 03/31/2026
- Balanced (debits = credits) through the **EXISTING poster — no new GL math**. **Opening Balance Equity is the
  plug**, mirroring QBO (a permanent OBE balance is a defect → later OBE→Retained-Earnings reclass, per the
  accounting architecture).
- **Owner-entered / owner-approved only.** Re-posts (from §1 re-pull) are void-and-repost or a dated adjustment,
  never a hand-edit.

### 4. Cutover switch (per entity, one at a time)
- Posting flags flip to **LIVE for 04/01/2026 onward, per entity**, only **AFTER**: (a) that entity's opening
  balance is imported + **tied to QBO**, AND (b) the **settlement + QBO dual-write collapses have landed**.
- One entity/module at a time; **GUARD verifies each ties to QBO live before the next**.
- **HARD RULE: never flip a posting flag for an entity before its opening balance is imported + tied** — a live
  ledger with no opening balance is wrong from day one.

### 5. Reconciliation — pre vs post cutover
- **Pre-04/01 differences = EXPECTED** ("mirror-to-QBO until the accountant finalizes") — opening/embezzlement
  drift, **not an error**; do not page.
- **Post-04/01 differences = real posting errors → page.** Daily TMS↔QBO reconcile.

## Sequence (locked — tables get fixed first)
1. **Settlement Phase-1 migration** (`202607430000`) — VALIDATED, awaiting owner Neon apply.
2. **Settlement Phase-2 repoints** (one PR per writer, HOLD) — gated on #1 applied + GUARD-verified.
3. **QBO dual-write collapse** — repoint `qbo-accounts/customers/vendors-push.ts` → `mdata.qbo_*` only, **add
   the sync columns to `mdata.qbo_*`** (this is what §2 mapping needs), archive `accounting.qbo_*`.
4. **Opening-balance import** (§1–§3) — needs canonical `mdata.qbo_accounts` from #3.
5. **Per-entity cutover flag-flips** (§4) — after each entity's opening balance is imported + tied.

## Needs owner (blocking §2/§3/§4)
- **Connect TRK's QuickBooks company** (separate realm `1432746210`) so its 03/31/2026 opening balance can be
  pulled. (TRANSP realm `123145885549599` already connected.)
- **Confirm the QBO account → `catalogs.accounts` mapping** before the opening JE posts.

## Cross-refs
`docs/specs/ACCOUNTING-ARCHITECTURE.md` (parallel double-books, OBE clearing), `docs/lockdown/00_LOCKED_DECISIONS.md` §8,
the settlement-engine + QBO-clone programs, and the auto-memory opening-JE / opening-balance rulings.
