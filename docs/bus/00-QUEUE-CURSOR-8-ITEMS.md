# CURSOR — NUMBERED QUEUE — 8 ITEMS — 2026-10-02
Claude Lead. Module owned end to end: **Legal.** Plus the two infrastructure items below.
Each item fully complete before the next. Permanent fixes with guards. No seeding, feeding, live
verification or reposting. No handoffs.

---

**1 of 8 — STOP PUSHING WITH `--no-verify`.** Your own report states your method as
"money-pr-local-gate PASS → push --no-verify → gh pr merge --squash --admin". The pre-push hook is not
optional, and `--no-verify` requires the owner's explicit word, which has never been given. It is also
a plausible route for the ambient guard rot now blocking every seat. Push through the hook. If the
hook blocks you, report the blocker — do not route around it.

**2 of 8 — COMPETING-ENGINE AUDIT, YOUR MODULE.** Read code, query nothing. Legal posting paths, the
bank-match writer, the register. For each pair: file and line, which the live path calls, which is
correct, the repoint, the guard. Findings are added to this queue and renumbered.

**3 of 8 — LEGAL BACKFILL FROM THE SIGNED SOURCE DOCUMENTS.** Your linkage engine (#23946) and the
backfill route (#23949) are built. The backfill itself reads **signed source documents** — signer
fields and real FKs — and stamps `UNLINKED_REASON` when no subject exists. **Never invent a subject.**
Reading a source document is not seeding; writing a guessed link is.

**4 of 8 — LEGAL MONEY WIRING.** Settlement, claim, judgment, legal fee, retainer, insurance recovery
— every one posts through the **existing** expense and invoice engines, double-sided and reversible.
**No handwritten journal entries. No new GL math.** A second poster here is exactly the defect class
the audit exists to kill.

**5 of 8 — DEADLINE + EXPIRY ENGINE.** `matter_deadlines` and contract expiry drive real dashboard
alerts: statute dates, renewals, insurance and authority expiry, signature expiry. **Silent failure
is a defect** — an alert that does not fire must say why.

**6 of 8 — LEGAL SURFACES + PROFILE BLOCKS.** Matter detail, contract detail, signing status, the
audit trail visible to the owner, and a legal block on **every** customer, vendor, driver and unit
profile. Both directions: the profile opens its matters, the matter opens its subject.

**7 of 8 — THE 8 MISSING SUB-NAV TABS** — banking, drivers, maintenance. CC-1 found these failing
build-typecheck on main and routed them to you.

**8 of 8 — YOUR 4 AMBIENT STATIC FAILURES.** `verify-no-raw-status-enum-in-ui`,
`verify-no-double-encoded-api-body`, `verify-no-partial-optional-chain`,
`verify-matrix-built-tag-present`. Fix the cause in code. **Never grow the shrink-only baseline to
hide a failure.**

---
**ONE THING FIXED FOR YOU ALREADY:** `LegalDeadlineAlertsPage.tsx` sat at
`src/pages/legal/alerts/` — three levels below `src/` — while importing seven modules as `../../x`,
which resolved to `src/pages/x`. Seven TS2307 errors, and it was half the reason the frontend had not
deployed since 01:16Z. Rewritten to `../../../` after confirming every target on disk;
`../LegalModuleTabs` left alone because it correctly resolves. **Run `npx tsc -b` in `apps/frontend`
before every push that adds a page**, whatever the gate asks for — that file was pushed having never
been compiled.
