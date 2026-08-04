# IH35-TMS — FULL SYSTEM AUDIT: MASTER INSTRUCTIONS FOR CASCADE
### (auto-loads every session · runs until fully PROD-VERIFIED · the anti-bullshit spec)

**To: Cascade.** This one document is (A) the session boot harness that runs the audit automatically each session
until it is fully performed, and (B) the full spec. **"Complete" is NOT five layers.** A module is complete only
when the repo's committed bar — **DoD A–E + VERIFY 1–8** — is PROD-VERIFIED per entity (TRANSP & USMCA; TRK where
relevant). That bar explicitly includes **connectivity & wiring (V3)**, the **universal picker + creator law (V2)**,
and **deep cross-module linkage forward+reverse (V4)** — not just "the table exists." The owner lifted the approval
holds for verification (no JORGE-APPROVED gate, no asking). The owner did NOT lift honesty. A guess is a defect.

> **CHANGE LOG**
> **v3 (2026-08-03):** "Complete" corrected from 5 layers (A–E) to the committed **DoD A–E + VERIFY 1–8**. Connectivity
> & wiring (V3), universal picker+creator law incl. Lists (V2), and deep linkage F+R (V4) are mandatory, not extras.
> Added §B12 spelling out the exact live click-throughs.
> **v2:** Rule 10, Rule 11, COUNTS-vs-LINKAGE read split (§B6), scoreboard integrity (§B10).

---

# PART A — THE HARNESS

## A0. HARD RULES

1. Verify against PROD + current `origin/main`. Never a stale clone, never memory. Sync first, every session.
2. Three tiers only: `PROD-VERIFIED` · `[AUDIT — RE-VERIFY LIVE]` · `UNVERIFIED — <blocker>`.
3. A number is a PROD fact. No count/dollar without a live Neon query result in the evidence cell.
4. A reverse link, a picker, a navigation link — proven only by EXECUTING it live.
5. `0` is not a verdict until re-run under the app path (lucia + operating_company_id), TRANSP and USMCA.
6. Canonical target first: `to_regclass` non-null and NOT RETIRE.
7. Every real FAIL gets a mutation-proven guard.
8. No `--admin`, no fake green. CI is the gate. Additive only.
9. A guess is a defect. Cannot verify → `UNVERIFIED — <blocker> · Step-1 reproduce`.
10. A COUNT NEVER UPGRADES A ROW'S TIER.
11. Re-baseline FAILs every session.
12. Complete = DoD A–E + VERIFY 1–8, per entity.

## A1. SESSION BOOT SEQUENCE

1. `git fetch origin && git checkout main && git pull --ff-only` → record SHA.
2. Re-read PART B — §B3, §B5, §B6, §B8, §B11, §B12.
3. Open ledger + run-log (create if absent).
4. Confirm prod verification available (healthz/shallow + live app session).
5. Re-baseline pass (Rule 11): downgrade FAIL → FIX where the fix merged.

## A2. THE RESUME LOOP

WORKLIST = tier-2 rows + resolvable UNVERIFIED + FAILs whose fix merged.
For each row: run DoD A–E + VERIFY 1–8, per entity. Set PROD-VERIFIED or terminal UNVERIFIED.
After pass: scoreboard machine check, run-log line.

## A3. COMPLETION CONDITION

Zero rows tagged `[AUDIT — RE-VERIFY LIVE]`. Then `AUDIT COMPLETE @ SHA <sha>`.

---

# PART B — THE SPEC (reference — full version in docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md)
