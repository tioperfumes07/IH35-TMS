# OWNER RULE — 2026-08-07 (LOCKED by Jorge): NO MAPPING NOW — WIRE + TEST ONLY

**This is an owner business decision. It reprioritizes every lane. Auto-load and obey.**

## The rule
1. **STOP all MAPPING work immediately** — account mapping, entity mapping, QBO
   category/vendor/account mapping, historical-data mapping. Mapping is **NOT** the
   priority and is not to consume crew time.
2. **USMCA mapping is the OWNER's job.** Jorge maps USMCA himself. **Coders do NOT map USMCA.**
3. **TRANSP and TRK: do NOT map.** Owner-stated context:
   - **TRANSP** (transportation / operating carrier) is **winding down and will cease
     operating within weeks**.
   - **TRK** (trucking) is now a **LEASE company**.
   Mapping either one is wasted time — skip it.
4. **FOCUS = WIRING + TESTING, end-to-end.** Both-way linkage, real economics, the live
   scenario battery, draining the wiring reds on the Scenario Tracker. If a task's purpose is
   *mapping* and it is not required to wire or test, **STOP it and pull the next wiring/test item.**

## Account creation (owner-authorized)
- If wiring or testing needs a **chart-of-accounts / catalog account that does not exist,
  CREATE IT.** Additive, **entity-scoped**, a sensible default type/role; leave QBO-mapping null.
- **Do NOT stop to ask, and do NOT stop to map.** The owner edits / renames / refines later.
- **Never block a wire or a test on account naming or account mapping.**

## Unchanged invariants (creating an account ≠ posting or QBO-mapping)
- WORM / void-not-delete. Entity independence (create **per-entity**, never shared).
- Maker ≠ checker on money/GL. No TMS→QBO write-back. Posting flags per owner.
- Verify-live-never-guess still applies to wiring and testing.

## One-line version for the loop
> Do not map. Jorge maps USMCA. TRANSP is closing, TRK is a lease co — skip their mapping.
> Wire and test only. Need an account? Create it, owner edits later. Never block on mapping.

---

## USMCA-ONLY FOCUS (owner clarification, 2026-08-07)
- Build and test the ENTIRE software — wiring, connectivity, linkage, functionality, expenses —
  in **USMCA only, from zero**. USMCA is the single test target.
- **USMCA has NO QuickBooks.** QBO is fully out of scope now: no sync, no reconcile, no QBO mapping.
- USMCA runs the **same real operation as transportation** — same physical drivers, trucks,
  GPS/Samsara tracking. Perfecting USMCA = perfecting the real operation. BUT every USMCA record is
  **entity-scoped to USMCA** (its own driver/unit/load rows) — NEVER shared with TRANSP/TRK. Sharing
  rows across entities is the entity-leak class being drained; do not do it.
- **Ignore TRANSP's books and QuickBooks** right now. TRANSP is winding down; TRK is a lease company.
- **Internal debit/credit account resolution is WIRING, not mapping — it CONTINUES.** Choosing which
  account a JE debits/credits (fuel→Fuel Expense, escrow→Damage-Claim liability, deduction→its
  liability) is required to post a balanced JE. If the account doesn't exist, CREATE it (additive,
  entity-scoped, sensible default, QBO-map null); owner edits later. This is NOT the QBO/historical
  mapping that is stopped.
- **First step on operational slices:** read USMCA's live fleet/driver/load state the CORRECT way
  (app withLuciaBypass / correct scope — RLS on mdata.drivers/units/loads is NOT keyed on
  app.operating_company_id), then create USMCA-scoped drivers/units for the same physical fleet as
  needed, then wire + test loads → dispatch → delivery → settlement → expenses → GL end-to-end.
