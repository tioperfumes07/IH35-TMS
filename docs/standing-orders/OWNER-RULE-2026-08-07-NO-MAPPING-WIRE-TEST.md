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
