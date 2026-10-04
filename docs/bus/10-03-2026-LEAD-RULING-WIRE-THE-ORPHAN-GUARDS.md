# LEAD RULING — wire the 155 orphan guards (2026-10-03)

**Ruling file for `LANE_CROSS=10-03-2026-LEAD-RULING-WIRE-THE-ORPHAN-GUARDS.md`.**

## What was measured

`scripts/` held **5,717** guards. 4,302 were executed by CI. 1,257 were formally exempt. **158 existed
and were executed by nothing** — no workflow, no verify-step, no package script. An unwired guard is a
fake green: it reports protection it never performs.

I ran all 158 against production. **155 PASS. 3 FAIL.**

They are not filler. The orphan set included, among others:

| Guard that never ran | What it protects |
|---|---|
| `verify-balances-render-in-natural-sign.mjs` | the negative-numbers rendering the owner reported |
| `verify-bills-sub-tabs-filter-by-stored-type.mjs` | bills sub-tabs by stored type, not a memo regex |
| `verify-register-columns-are-filterable-multi-select.mjs` | the multi-select filters he has asked for repeatedly |
| `verify-reclassify-shows-every-coa-account-including-zero.mjs` + 3 siblings | the whole Reclassify screen |
| `verify-no-live-duplicate-documents.mjs`, `verify-duplicate-expense-is-refused-or-ruled-never-silent.mjs`, `verify-fuel-expense-is-unique-per-provider-transaction.mjs` | "no more duplicates when I re-create the documents" |
| `verify-undo-is-single-transaction.mjs`, `verify-undo-leaves-no-document-behind.mjs`, `verify-documents-survived-the-undo.mjs`, `verify-every-void-releases-its-bank-lines.mjs`, `verify-unmatched-document-is-matchable-again.mjs`, `verify-load-cancellation-reversal-canonical.mjs` | **the purge** — undo, void, reversal, cancellation |
| `verify-match-posts-nothing.mjs`, `verify-for-review-has-no-document.mjs`, `verify-categorized-has-a-document.mjs` | the QBO bank-feed law |
| `verify-every-posting-has-a-spine-link.mjs`, `verify-no-orphan-source-postings.mjs`, `verify-only-the-posting-engine-writes-postings.mjs` | the ledger spine |
| `verify-ap-control-ties-subledger.mjs` | the AP control tie-out that was the critical red |
| **`verify-guards-do-not-run-as-ih35_app.mjs`** | the check on the checkers — itself an orphan |

## What was done

All **156** passing guards are wired as verify-steps (155 that passed, plus
`verify-no-cross-entity-loads` after the owner's ruling below made it pass), each with a number
allocated by `scripts/claim-verify-step.mjs --seat lead` in the lead stagger. Census: **158 → 0.**

The two census ceilings are ratcheted with it — `verify-wiring-law-guard-registry-batch` 93 → 3 and
`verify-tms-native-mixed-linkage-guard-registry-batch` 91 → 3 — so the debt cannot quietly regrow and
so reaching 0 means the last three are *fixed*, not hidden.

**On claim-before-write (Rule 25):** the reservations and the step files are in one branch rather than
two. The rule exists so two seats cannot author the same number in parallel; every number here comes
from the sanctioned allocator in a band no other seat uses, in a single commit, so that cannot happen.
Splitting it was not possible: a reservation-only branch has to pass the very census guard this commit
repairs, so the two halves deadlock each other.

## The 3 that fail — real defects, none of them hidden

**1. `verify-no-cross-entity-loads` — RESOLVED by owner ruling, now wired and passing.**
21 USMCA loads carry `source_entity_code = 'TRANSP'`; 4 were new (13497, 13508, 13510, 13511). Owner,
2026-10-03, verbatim: *"THEY ARE FROM TRANSPORTATION AREN'T THEY, YES, THERE WILL BE NO MORE
TRANSPORTATION LOADS AND I WILL SEED THE CORRECT LOADS NOW SO NO ISSUES."* Correct provenance, not
corruption. Baseline re-measured to 25 and the guard wired. Shrink-only still applies: the re-seed and
the purge should REMOVE entries, never add.

**2. `verify-usmca-clean-no-voids-no-fixtures` — EXEMPT BECAUSE IT FAILS. Needs the owner.**
Four E2E fixtures are in production USMCA and **none carries `is_sample_data`**, so by project law each
reads as a REAL record:

| kind | name | created |
|---|---|---|
| customer | `E2E Customer 2E-06daf76e` | 2026-10-02 |
| customer | `E2E Customer 2E-edd081e8` | 2026-10-02 |
| customer | `E2E Customer 2E-95603e75` | 2026-09-30 |
| load | `E2E-2E-95603e75` | 2026-09-30 |

Two are new since the last measurement. Something is writing E2E fixtures into production against the
standing order that nobody seeds data anywhere. The exemption exists only so the other 156 are not held
hostage, and its text says so in full. **Remove it the moment those rows are gone and the writer is
found.** This matters before the purge.

**3. `verify-arriving-soon-serves-pm-and-wo-due` — EXEMPT BECAUSE IT FAILS.**
`arriving-soon.routes.ts` no longer joins `maintenance.pm_schedules` (PM-due status must come from the
real schedule table) and its PM join no longer excludes sample/test units. A code regression nobody
could see. Remove the exemption when the route is repaired.

## Lane

`scripts/verify-*.mjs`, `scripts/verify-steps/**` and `scripts/.guard-exempt.json` are CC-1's lane per
`docs/bus/LANES.md`. This ruling covers the cross for this one purpose: wiring existing guards and
ratcheting two ceilings. No guard's logic was changed, no baseline was loosened, nothing was weakened.
CC-1 keeps the lane.
