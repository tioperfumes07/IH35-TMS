# Opening-Balance Import (re-syncable) + 07/01/2026 Cutover — design (build-and-HOLD)

**Authoritative build spec.** Owner decisions LOCKED (GUARD → CODER, 2026-07-15). Every code/migration piece is
**financial → build-and-HOLD**: owner approves + applies migrations on Neon; GUARD validates each migration on a
throwaway PG (apply-twice) and re-proofs live. **QBO is never written to.** This doc captures the design so it
can't drift before the sequence reaches it; it does not authorize a build ahead of the sequence.

## Locked owner decisions
- **Cutover date: 07/01/2026.** Pre-07/01 = TMS **mirrors QBO exactly**; post-07/01 = TMS **posts live in
  parallel** and reconciles daily vs QBO. QBO stays the system of record through cutover.
- **Opening balances = QBO Balance Sheet / Trial Balance as of 06/30/2026, per entity** (TRANSP, TRK;
  USMCA ≈ 0 — TMS-authoritative from day one, no QBO).
- **Re-syncable, not frozen.** The accountant is still finalizing the embezzlement cleanup, so pre-07/01 QBO
  numbers will change. The opening balance must be **re-pullable** and re-posted (void-and-repost or a dated
  adjustment) — **never hand-edited**. Every version is kept (audit trail of how opening balances evolved).

## Build components (all HOLD)

### 1. Re-syncable opening-balance snapshot (NOT a frozen JE)
- New table (additive migration, FORCED RLS, grants, idempotent): per `operating_company_id`, `as_of`
  (=2026-06-30), rows of `{account_ref, amount, pulled_at, snapshot_version}`, pulled from the QBO
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

### 3. Opening JE dated 06/30/2026
- Balanced (debits = credits) through the **EXISTING poster — no new GL math**. **Opening Balance Equity is the
  plug**, mirroring QBO (a permanent OBE balance is a defect → later OBE→Retained-Earnings reclass, per the
  accounting architecture).
- **Owner-entered / owner-approved only.** Re-posts (from §1 re-pull) are void-and-repost or a dated adjustment,
  never a hand-edit.

### 4. Cutover switch (per entity, one at a time)
- Posting flags flip to **LIVE for 07/01/2026 onward, per entity**, only **AFTER**: (a) that entity's opening
  balance is imported + **tied to QBO**, AND (b) the **settlement + QBO dual-write collapses have landed**.
- One entity/module at a time; **GUARD verifies each ties to QBO live before the next**.
- **HARD RULE: never flip a posting flag for an entity before its opening balance is imported + tied** — a live
  ledger with no opening balance is wrong from day one.

### 5. Reconciliation — pre vs post cutover
- **Pre-07/01 differences = EXPECTED** ("mirror-to-QBO until the accountant finalizes") — opening/embezzlement
  drift, **not an error**; do not page.
- **Post-07/01 differences = real posting errors → page.** Daily TMS↔QBO reconcile.

## Sequence (locked — tables get fixed first)
1. **Settlement Phase-1 migration** (`202607430000`) — VALIDATED, awaiting owner Neon apply.
2. **Settlement Phase-2 repoints** (one PR per writer, HOLD) — gated on #1 applied + GUARD-verified.
3. **QBO dual-write collapse** — repoint `qbo-accounts/customers/vendors-push.ts` → `mdata.qbo_*` only, **add
   the sync columns to `mdata.qbo_*`** (this is what §2 mapping needs), archive `accounting.qbo_*`.
4. **Opening-balance import** (§1–§3) — needs canonical `mdata.qbo_accounts` from #3.
5. **Per-entity cutover flag-flips** (§4) — after each entity's opening balance is imported + tied.

## Needs owner (blocking §2/§3/§4)
- **Connect TRK's QuickBooks company** (separate realm `1432746210`) so its 06/30/2026 opening balance can be
  pulled. (TRANSP realm `123145885549599` already connected.)
- **Confirm the QBO account → `catalogs.accounts` mapping** before the opening JE posts.

## Cross-refs
`docs/specs/ACCOUNTING-ARCHITECTURE.md` (parallel double-books, OBE clearing), `docs/lockdown/00_LOCKED_DECISIONS.md` §8,
the settlement-engine + QBO-clone programs, and the auto-memory opening-JE / opening-balance rulings.
