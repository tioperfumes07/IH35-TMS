# BANK-F08 — categorization-rules / automatch depth (deep-wizard DoD)
**FINDING:** BANK-F08 (P1) · **Lane:** NON-FINANCIAL (UI/wiring depth) · FINANCIAL-HOLD only if a migration or posting flag is introduced · **Module:** banking.
**Maps to scoreboard:** grow `docs/module-completion/banking.json` with `BANK-F08` (Rule 21 — M grows; do not hide under SURF-02).

## RESPOND-BEFORE-CODING (Rule 00/02)
Spec sources reviewed: IH35_ARCHITECTURAL_DESIGN.md (Banking) · IH35_MASTER_BLUEPRINT_v3_FULL.md (bank feed / rules) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md · LAW-OF-THE-LAND · Quality hardline
Approved screens reviewed: banking categorize / rules surfaces (QBO Banking Rules parity)
Tab count check (Rule 05): Banking design tabs unchanged unless Fix adds an approved leaf
Deviations: None
NEW SPEC: None — QBO Rules / automatch parity is in-scope Banking law; do not invent tabs

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Banking routes include `/banking/categorization-rules` (`CategorizationRulesPage`). Deep-wizard DoD (every field controlled + in submit, rule match → categorize suggestion → apply, entity-scoped, reverse drill to bank_transactions) is **not** yet a scoreboard leaf with VERIFY 1–8 evidence. SURF-02 covers Categorize/Match density; this block owns **Rules + automatch depth**.

**Step 1:** Authenticated TRANSP **and** USMCA click-through: open Categorization Rules → create/edit rule with all visible fields → save → reload → prove rule fires automatch on a pending bank txn (or honest empty + why) → reverse drill txn→rule. Neon lucia: rule table + bank_transactions link columns.

## LINKAGE (Rule 14)
1. Canonical: `banking.*` rules/match tables (verify `to_regclass` live — never invent) + `banking.bank_transactions`.
2. Hubs: org.companies · mdata.vendors/customers · catalogs.accounts · banking.bank_accounts · (optional) accounting.journal_entries when feed posting ON.
3. Cross-module: Banking Categorize + Rules; never delete Factoring/Escrow/Plaid surfaces (Rule 07).
4. Deployed SHA vs main: coder fills.

## STANDARD (Rule 15)
QuickBooks Banking **Rules** + automatch · Alvys/McLeod bank-feed seriousness · RLS entity scope.

## NEVER-DELETE + INVARIANTS
Additive only. No projection / bank-feed GL flag flips. OWNER decides cutover. No new GL math.

## THE FIX
1. Inventory `CategorizationRulesPage` + API: every rendered field in create/edit must be controlled **and** in submit (DoD-B).
2. Automatch path: rule → candidate txn → apply categorize uses same canonical columns as manual categorize (check_number/class/location/billable/tags where applicable — ACCT-R-11).
3. Entity scope TRANSP+USMCA; no cross-entity rule leak.
4. Guard pins route mounted + field/submit parity + no ComingSoon twin; browser proof before PASS (Rule 23).

## GUARD
`scripts/verify-bank-f08-categorization-rules-automatch.mjs` + verify-step NNNN (verify-steps only).

## ACCEPTANCE
Structural guard green + TRANSP+USMCA browser DoD A–E / VERIFY 1–8 — or `UNVERIFIED: <blocker>`. Scoreboard PASS only with live proof.

## GIT-GATE COMMIT KEYS
FINDING: BANK-F08
LANE: NON-FINANCIAL
DOD-A..E / VERIFY-1..8: UNVERIFIED at dispatch — fill at build
MODULE_PROGRESS: banking N of M (M grows when leaf added)
ITEMS_TOUCHED: BANK-F08
MIGRATE: N/A unless schema gap proven live
ROOT CAUSE: Rules/automatch surface lacks a dedicated deep-wizard DoD leaf and live VERIFY evidence
FIX: deep-wizard completeness + automatch→categorize same canonical path + guard + browser
GUARD: verify-bank-f08-categorization-rules-automatch
LIVE PROOF: UNVERIFIED: browser Rules→automatch not proven this session
REMAINING: build + browser hydrate TRANSP+USMCA
