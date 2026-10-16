# ENGINE REGISTER — HANDOFF TO INCOMING AGENT
# Base: Lead engine/status register, 2026-10-03
# Addendum: banking match engine, measured live 2026-10-16

READ THE ADDENDUM AT THE BOTTOM FIRST. It is 13 days newer than the
register above it and it answers the banking-match question directly.

---

## E. ENGINES (as of 2026-10-03)

| Engine | State | Source |
|---|---|---|
| Fuel posting -> 1090 | Root cause fixed in code: the cash path resolved its credit account to Undeposited Funds via a name-ordered fallback; now it resolves the `operating_bank` ROLE or throws. | ROUND 377; merge `3e1061bbcb` inside backend deploy `dep-db0mik5a1vls739a5ht0` |
| Posting engine single-door | **10 services still INSERT into `journal_entry_postings` directly** while 87 call the engine. Pinned by a shrink-only allowlist guard. | `verify-only-the-posting-engine-writes-postings.mjs`, 10/10, 0 new |
| P&L completeness | Was silently dropping unmapped account types in TWO implementations; both now surface an `unclassified` section, excluded from gross profit and net income. | built 2026-10-03 |
| Account-type homes | Guard fails if an account type with postings has no P&L or balance-sheet home. Passing live. | `verify-every-account-type-has-a-pl-or-bs-home.mjs` |
| Duplicates | Live baseline pinned at **11 duplicate groups / 22 rows**; ratcheted so a new one fails the build. | `verify-no-live-duplicate-documents.mjs` |
| Posters resolve by role | CC-3 took this 2026-10-03 (365.1) — every poster resolving its account through the role table instead of a hard-coded number or name. Gates the purge. | CC-3 report |
| Bank-recon idempotency | **DEFECT OPEN** — keyed on a memo string. See B7 below. | |
| Swallowed DB errors | 222 reported -> **122 real** after fixing the guard's own truncating regex; baseline pinned at 122 in 82 files. | `verify-no-swallowed-db-error-in-transaction.mjs`, selftest 6/6 |

**Pre-purge position (2026-10-03):** the purge still needs the bank-recon
idempotency key moved off the memo string (B7), the bill provenance stamp,
and CC-3's 365.1 to land.

---

## B. BANKING / MATCH — root causes measured 2026-10-03

| # | Item | Status |
|---|---|---|
| B1 | Filter clears on blur | **FIXED** |
| B2 | Multi-select across banking and the app | **NOT DONE.** `MultiSelectDropdown` exists but is used in 12 files out of 1,215 pages. |
| B3 | Match-candidate filter, QBO-style by transaction type | Partly on the wire: `kinds` is a multi-select the backend parses. Broken on screen for the reason in B5. |
| B4 | Amount from / Amount to | **ALREADY WIRED** end to end (`banking.ts:597-598` -> `p7-wave2.routes.ts:215-216`). If the boxes do nothing it is B5, not missing plumbing. |
| B5 | Categorize/Match should be a popup; today it sits inline among the other rows | **ROOT CAUSE — same defect as B8 and B9.** |
| B8 | No multi / various-invoice selector for many-to-one | same as B5 |
| B9 | No "Resolve difference" | same as B5 |
| B7 | `session 7a7d1da9-aa5b-4de7-b` in descriptions | **Live rows.** 2 journal entries + 1 expense carry `Bank reconciliation interest earned - session 7a7d1da9-...`. Source: `recon-adjustments.service.ts:103` and `:266`. **Cannot simply be deleted:** `:116` uses that memo string as the IDEMPOTENCY KEY, so stripping it makes two sessions' $25 charges collide and the second vanish. The expense posts as `source_transaction_type: "expense"`, so the memo is currently the ONLY link back to the session. Fix in order: structured link on the spine -> re-key idempotency onto it -> then make the memo human. |
| B10 | QBO text/number/calendar formats app-wide | **NOT STARTED** |
| B11 | "Action type" vs "Action" | The suggestion appears in **Action** (the badge opens the Match drawer). **Action type** is a separate column showing the chosen action. QuickBooks has no "Action type" column — it puts the chosen action on the button. Owner decision, not taken. |

**B5 + B8 + B9 ARE ONE DEFECT, NOT THREE.**
`MatchDrawer.tsx` ALREADY HAS multi-document match (one bank line -> many
documents) and Resolve-difference with named difference accounts — built in
ROUND 189/206. The screen the owner is on is NOT that drawer: the register
renders its own inline candidate table, and its own source comment says it
outright — *"the orphaned MatchDrawer.tsx ... DISPLAY ONLY here"*. There are
two matchers and the owner is looking at the poorer one.
Recommendation: stop maintaining two. Categorize/Match opens the drawer as a
modal. One change closes three items.

---

# ADDENDUM — BANKING MATCH ENGINE, MEASURED LIVE 2026-10-16

Measured against the live repo today. This supersedes anything above that
disagrees with it.

## WHERE THE MATCH ENGINE IS — it is not lost

```
apps/backend/src/accounting/bank-recon/match.service.ts
  findCandidates()                    :842-932
  fetchLedgerCandidates()             :337-541    <- the candidate union
  computeMatchScore()
  acceptMatchWithResolveDifference()  :934-1041+

Route    apps/backend/src/banking/p7-wave2.routes.ts:175-214
UI       apps/frontend/src/pages/banking/components/MatchDrawer.tsx
Guard    scripts/verify-one-match-engine-owns-this-surface.mjs
Guard    scripts/verify-bank-match-is-never-auto-written.mjs
Guard    scripts/verify-no-automatch.mjs
Guard    scripts/verify-banking-suggest-matches-wired.mjs
Audit    docs/audit/BANKING-MATCH-FLOW-AUDIT.md   <- READ THIS FIRST
```

ONE engine owns this surface and a guard enforces that. Do NOT write a
second matcher. `verify-one-match-engine-owns-this-surface.mjs` declares
`match.service.ts` the owner and will fail the build.

`findCandidates()` is READ-ONLY. It persists nothing. The owner accepts
every match by hand. `verify-no-automatch.mjs` and
`verify-bank-match-is-never-auto-written.mjs` enforce this. Never add
auto-accept, and never put matching in a cron.

## DEFECT 1 — CANDIDATES COME FROM OTHER BANK ACCOUNTS

**Symptom (owner, 2026-10-16):** the matcher suggests documents belonging to
other banking accounts.

**Root cause, measured:** in `match.service.ts` the string `bank_account_id`
appears in the candidate SQL exactly ONCE — the deposits branch:

```sql
WHERE d.operating_company_id = $1::uuid
  AND d.bank_account_id = $6::uuid
  AND d.deposit_date BETWEEN $2::date AND $3::date
```

Every other source in the union is scoped by `operating_company_id` and date
ONLY. Nothing ties a candidate to the bank account the line belongs to, so
every expense in the company on any account is offered as a candidate.

**Fix:** scope each branch of `fetchLedgerCandidates()` to the bank account
of the bank line, the way the deposits branch already does. This is a
missing predicate, not a rewrite.

## DEFECT 2 — NO FACTORING PURCHASES, NO INVOICES

**Symptom (owner, 2026-10-16):** factoring purchases and invoices never
appear as candidates.

**Root cause, measured:** the union has SIX sources and neither is among
them. `p7-wave2.routes.ts` states it in its own header comment — *"open
bills + expenses + bill_payments + transfers + payments/AR + JEs,
direction-aware"* — and `docs/audit/BANKING-MATCH-FLOW-AUDIT.md` lists the
same six:

```
accounting.payments          (money-in only)
accounting.bill_payments
accounting.bills             (open-balance only)
accounting.expenses
banking.transfers            (direction-scoped)
accounting.journal_entries   (both directions)
```

Invoices and factoring purchases were never in the union.

**This contradicts a standing owner ruling (2026-09-30):** the bank-match
candidate universe is EVERY document the company creates — AR invoices,
receive-payments, deposits, ordinary vendor expenses and bills — not only
settlement-born documents. Narrowing it is the defect. That ruling was
recorded and never built into `fetchLedgerCandidates()`.

**Fix:** add the missing sources to the union, direction-aware, scoped to
the bank account per Defect 1.

## STANDING LAW FOR WHOEVER TAKES THIS

- USMCA only — `5c854333-6ea5-4faa-af31-67cb272fef80`. TRANSPORTATION
  (`91e0bf0a-133f-4ce8-a734-2586cfa66d96`) and TRUCKING
  (`b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e`) are FROZEN — never read, write,
  count or report on them.
- Production: Neon `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`.
  Entity reads REQUIRE `SET LOCAL app.bypass_rls = 'lucia'` as the first
  statement in a transaction. An empty result without it means nothing.
- NEVER AUTO-MATCH. Suggest and rank only; the owner accepts every match.
- Match = link to an existing record, NO new journal entry.
  Categorize = a new journal entry, NO document.
  Source: `docs/specs/qbo-parity/CHAIN-05-BANK-FEED-POSTING-DESIGN.md:236`.
- A categorized bank line CARRIES A VENDOR, exactly as QuickBooks does.
  Do not build a bank-line-to-expense-document path.
- Re-match and re-categorize reverse through
  `reversePostedSourceTransaction`, never the void path (CHAIN-05:130).
- NOBODY SEEDS DATA — not for a test, not for proof, in any entity.
- Every fix ships a guard proven RED on the pre-fix tree (paste the RED
  output) then GREEN.
- Gate on `npm run -s build`, frontend AND backend, plus the guard suite.
  NOT `tsc -p --noEmit` — it misses unused imports.
- Never block a merge on Chrome verification. The owner walks the screens.
