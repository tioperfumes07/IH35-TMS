# BANK-F09 — settings / reports / email-queue deep-wizard verify
**FINDING:** BANK-F09 (P1) · **Lane:** NON-FINANCIAL · **Module:** banking (+ shared email queue surface).
**Maps to scoreboard:** grow `docs/module-completion/banking.json` with `BANK-F09` (Rule 21).

## RESPOND-BEFORE-CODING (Rule 00/02)
Spec sources reviewed: IH35_ARCHITECTURAL_DESIGN.md (Banking + Reports where linked) · blueprint Banking settings · LAW-OF-THE-LAND · NEVER-DELETE
Approved screens reviewed: banking settings / statement / email-queue routes as shipped
Tab count check: no invented Banking tabs; Reports hub leaves stay design-law
Deviations: None
NEW SPEC: None

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Routes exist for banking settings-adjacent work and `/banking/email-queue` (`EmailQueuePage`) / QBO sync queue. Deep-wizard DoD (fields → submit → persist → reload → reverse drill; entity scope; honest empty) is not closed on a scoreboard leaf. This block owns that sweep — **not** a flag flip, **not** Neon DDL unless Step-1 proves a schema hole.

**Step 1:** TRANSP **and** USMCA: open each surface (Banking settings/config leaves that exist · Email queue · related report/export entry points from Banking) → exercise create/edit/filter/actions → prove every field in payload → reload hydrate → reverse drill to `email.email_queue` / bank artifacts under lucia.

## LINKAGE (Rule 14)
1. Canonical: `email.email_queue` (+ banking config tables verified via `to_regclass`) — never phantom.
2. Hubs: org.companies · identity.users · banking.bank_accounts / bank_transactions as applicable.
3. Cross-module: Banking ↔ Email ↔ Reports (entry points kept — Rule 07).
4. Deployed SHA: coder fills.

## STANDARD (Rule 15)
QuickBooks Banking settings seriousness · NetSuite notification/queue auditability · RLS.

## NEVER-DELETE + INVARIANTS
Keep all Banking entry tabs (Factoring, Escrow, Plaid, Statement Import, Email queue). No projection flag flips. OWNER decides.

## THE FIX
1. Enumerate mounted Banking settings + Email queue + Banking-linked report actions; kill ComingSoon / dual-path twins on those leaves.
2. Deep-wizard: every control bound + submitted; empty states honest (`useListState` / settled empty).
3. Entity-scoped queues; no cross-tenant leak.
4. Guard + browser VERIFY 1–8 before scoreboard PASS (Rule 23).

## GUARD
`scripts/verify-bank-f09-settings-reports-email-queue.mjs` + verify-step NNNN.

## ACCEPTANCE
Guard green + authenticated TRANSP+USMCA deep click-through — or `UNVERIFIED: <blocker>`.

## GIT-GATE COMMIT KEYS
FINDING: BANK-F09
LANE: NON-FINANCIAL
DOD-A..E / VERIFY-1..8: UNVERIFIED at dispatch
MODULE_PROGRESS: banking N of M
ITEMS_TOUCHED: BANK-F09
MIGRATE: N/A unless Step-1 proves schema gap
ROOT CAUSE: settings/reports/email-queue leaves lack a dedicated deep-wizard DoD + live VERIFY leaf
FIX: complete wizards + honest empty + guard + browser
GUARD: verify-bank-f09-settings-reports-email-queue
LIVE PROOF: UNVERIFIED: browser deep-wizard not run this session
REMAINING: build + browser hydrate
