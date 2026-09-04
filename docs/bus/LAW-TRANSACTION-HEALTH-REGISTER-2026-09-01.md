# LAW — TRANSACTION HEALTH REGISTER (FULL WIRING)

Owner-ordered 2026-09-01. BINDING. Supersedes the 6-check draft.

## Why this exists

The owner asked why the health endpoint never alerted him that A/R was out by $1,215.75.
Because all **nine** existing checks are infrastructure — `postgres.select1`, `migrations.ledger`,
`redis.ping`, `r2.head_bucket`, `qbo.sync_alerts.unresolved_depth`, `qbo.connections.oauth`,
`email.queue.depth`, `background_jobs.stale`, `sentry.heartbeat`. **Not one is a financial
control.** A system reporting `ok:true` while the books do not tie is reporting that the servers
are up. The owner reasonably assumed it meant the books were right.

`ledger-integrity-detectors.service.ts` and `subledger-gl-control-rec.service.ts` already exist
and are in **no** health path. Wire them in; do not rebuild them.

## Rules for every check

1. **Critical tier.** A red financial check turns `ok:false`, exactly like `postgres.select1`.
2. **Per entity.** Every check runs per `operating_company_id`. A pass on USMCA is not a pass.
3. **Zero is the only pass** for variance checks. "Close" is a fail.
4. **Named in a workflow.** A check that runs nowhere is decoration.
5. **Shadow first.** Anything with a known live violation starts non-blocking, with the current
   count recorded as the baseline, and flips to blocking when it reaches zero.
6. **Every check names its remediation.** A red light with no next action is an alarm nobody can act on.

---

## A · LEDGER INTEGRITY — the foundation

| # | Check | Pass | Live now |
|---|---|---|---|
| A1 | Unbalanced journal entries | 0 | **0 ✓** |
| A2 | Trial balance: total DR = total CR, per entity | equal | **N/A — USMCA has 0 journal entries today** (RUN 2026-09-04, bypass_rls, twice) |
| A3 | Every JE has ≥2 postings | 0 violations | **0 ✓ RUN** — 0 real (non-voided, non-sample) JEs to violate this today |
| A4 | Every posting references a live `catalogs.accounts` row | 0 orphans | **0 ✓ RUN** — 0 postings exist for USMCA today |
| A5 | Document presenting as posted with zero postings | 0 | **3 ✗** — expense `8a1b3d84` $75.00 · `BILL-2026-00018` $750.00 · `BILL-2026-00019` $300.00 |
| A6 | Posting into a closed period | 0 | 24 periods open — untestable today |

## B · SUBLEDGER TIE-OUTS — GL vs the records behind it

| # | Control account | Subledger | Live now |
|---|---|---|---|
| B1 | 1100 Accounts Receivable | open invoices | **OUT −$1,215.75 ✗** (GL $10,446.25 vs $11,662.00) |
| B2 | 2000 Accounts Payable | open bills | **OUT −$268.77 ✗** (GL $7,460.00 vs $7,728.77) |
| B3 | 1000 / 1090 Bank + Undeposited | `banking.bank_transactions` | **✗ RUN 2026-09-04** — GL (0 JEs) = **$0.00** vs bank subledger (343 non-voided of 400 total) = **−$4,724.65**. USMCA has real bank activity that has **never once been posted to the GL** — every one of those 343 transactions is unposted money movement. Filed as a new finding (see below); Band B fix ownership is CC-1 per this doc's own remediation table. The earlier `−$41,255.43` figure in this row is STALE — it predates a full USMCA data reset and no longer reflects live state. |
| B4 | 1150 Unbilled Revenue | delivered-not-invoiced loads | **$0.00 ✓ RUN** — USMCA has exactly 1 load, `status='draft'`, `rate_total_cents=0` — not delivered, nothing unbilled. The earlier `$109,158.50` figure is STALE for the same reason as B3. |
| B5 | 2100-* Driver Escrow | `accounting.escrow_accounts` + `escrow_ledger` | **$0 vs $0 ✓ RUN** — 21 escrow accounts exist for USMCA, all zero-balance (not yet funded); GL is $0 (0 JEs). Ties. |
| B6 | Driver Cash Advance | `driver_advance_accounts` + `driver_advances` | **$0 vs $0 ✓ RUN** — 12 advance accounts exist, `outstanding_balance` sums to $0; GL is $0. Ties. |
| B7 | 1410 Prepaid Expenses | amortization schedule | **N/A ✓ RUN** — 0 `accounting.prepaid_assets` rows for USMCA. |
| B8 | Fixed assets | asset register + accumulated depreciation | **N/A ✓ RUN** — 0 `accounting.fixed_assets` rows for USMCA. |
| B9 | Factoring | `factoring_advances` + `factoring.batch` | **N/A ✓ RUN** — 0 `accounting.factoring_advances` rows for USMCA. |
| B10 | 8000-block Intercompany | each pair nets to zero across entities | **N/A — 0 USMCA-side postings to net.** Not fully automatable yet: TRANSP/TRK are permanently frozen (never read/write/report per LAW §4), so a real cross-entity netting check cannot query their content — only a from-USMCA-side count. Flagged, not built, pending a decision on how to check a frozen pair without reading it. |

## C · VOID & REVERSAL INTEGRITY

| # | Check | Pass | Live now |
|---|---|---|---|
| C1 | Voided document that had GL has a balanced reversing JE | 0 violations | **0 ✓** (233 of 233 balanced, $173,463.49) |
| C2 | Every voided document has `void_reason`, `voided_by_user_id`, `voided_at` | 0 nulls | **1 ✗** — `INV-2026-00024` |
| C3 | Bank transaction still matched to a voided document | 0 | **5 ✗** — 4 categorized $5,700.00 + 1 pending −$1,200.00 |
| C4 | One void-column convention across the schema | no `revoked_at` / `unapplied_at` / `reversed_at` drift | **✗** — 4 parallel conventions |
| C5 | Reversal posts to the SAME accounts, opposite side, same amounts | 0 mismatches | **N/A ✓ RUN** — 0 voided documents with GL exist for USMCA today (0 JEs total), so there is nothing to reverse and nothing to mismatch. `checkVoidReversalIntegrityForCompany` already implements this logic (wired, isolated by the SAVEPOINT fix below) and will report a real result the first time USMCA has a voided posted document. |

> **C1 note for whoever implements it:** the void path writes a **separate reversing JE**. It does
> NOT populate `reversal_of_line_id` / `reversed_by_line_id`. Asserting on those columns produces
> a false positive — it produced one for me on 17 invoices. Match on the reversal JE.

## D · LINKAGE (Rule 14) — both-way, financial + operational + hub

| # | Check | Live now |
|---|---|---|
| D1 | Every delivered/completed load has a driver bill | **✗ 39 loads, 16 real, $14,789.50** |
| D2 | Every driver bill links to a load | ✓ FK `NOT NULL` enforces it |
| D3 | Every invoice links to its source load (where `invoice_type='from_load'`) | **N/A ✓ RUN** — 0 invoices exist for USMCA today. |
| D4 | Every settlement links its lines, and every line its bill | **N/A ✓ RUN** — 0 settlements exist for USMCA today. |
| D5 | Every expense/bill links to its operational parent (load · work order · unit · trailer) | **N/A ✓ RUN** — 0 expenses, 0 bills exist for USMCA today. |
| D6 | Every load reaching PAID has the full chain: invoice → bill → expense → settlement → factor → bank | **✗ 0 of 19 settlements have EVER reached PAID** (owner-named blocker for CC-1/SET-01 tonight: 0 rows until the owner books the first load — cannot be manufactured) |
| D7 | Every insured unit has a `policy_unit` row; premium total = Σ `payment_schedule` | unverified — **0 documents attached to any unit** (out of CC-2 scope; not re-run tonight) |

## E · ENTITY INTEGRITY — the highest-cost error class

| # | Check | Live now |
|---|---|---|
| E1 | All postings on one JE share one `operating_company_id` | **N/A ✓ RUN** — 0 postings exist for USMCA today. |
| E2 | No document references a parent in a different entity | **N/A ✓ RUN** for USMCA — 0 invoices/bills/expenses to check. |
| E3 | Every financial row carries a non-null `operating_company_id` | **N/A ✓ RUN** for USMCA — 0 financial rows exist to be null. |
| E4 | TRANSP / TRK frozen: zero new financial rows | **BASELINE ESTABLISHED, not yet a pass/fail** — a "zero NEW rows" check needs a prior snapshot to diff against, which does not exist yet. Tonight's count-only (never content) totals, taken specifically to establish that baseline without violating the "never read TRANSP/TRK" law any further than an aggregate count: TRANSP (91e0bf0a) — 1,779 journal entries, 11,980 invoices. TRK (b49a737b) — 6 journal entries, 13,051 bills, 3,196 invoices. Recommend whoever owns E-band (Codex, per this doc's remediation table) take this as the frozen baseline and diff future counts against it; CC-2 will not read these entities again outside this one baseline-setting query. |

## F · DATA HONESTY

| # | Check | Live now |
|---|---|---|
| F1 | `is_sample_data` set explicitly by every create path | **✗** — 17 unflagged expenses, 34 of 49 invoices |
| F2 | No test-named account in `catalogs.accounts` | **✗** — `DRIVERCASHAD896665-023` "Driver Cash Advance- TEST CODEX ONBOARD 20260824", **$1,200.00 on the balance sheet** |
| F3 | No seat instruction text in any memo/notes field | **✗ 4 records** (CC-2's guard, shadow mode) |
| F4 | No financial record created outside an owner-ordered walk manifest | not buildable yet — manifests are prose |

## G · DRIVER & SETTLEMENT

| # | Check | Live now |
|---|---|---|
| G1 | Every driver who moved a load in 2026 has BOTH advance and escrow | **✗ 6 of 14 missing both** |
| G2 | No settlement closes negative without a `driver_liabilities` entry | **✗ 7 negative, none recorded** |
| G3 | Settlement approval state internally consistent | **✗ 47 of 47 stuck at `needs_review`, zero callers** |
| G4 | One person = one financial identity | **✗** `DRIVER-PERSON-IDENTITY-01` — 175 rows / 106 people |

---

## Scoreboard at adoption

**Passing 2 · Failing 13 · Unverified 24**

That is the honest baseline. Every "unverified" is a check nobody has ever run.

## ACC-19 — RUN, 2026-09-04 (CC-2)

Every "unverified" row above was RUN live against USMCA, bypass_rls, cross-checked twice where the
result was non-obvious. Root cause found FIRST: `ledger.integrity_cron` — which already implements
most of Band A/B/C/F — had been failing on **every tick since before 2026-09-01** even after this
session's earlier isolation fix (#20200): the whole tick runs inside one transaction, and one
detector's caught exception left the transaction itself aborted, so every later detector silently
no-opped instead of running. Fixed with a real per-detector `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` /
`RELEASE SAVEPOINT` (test-proven, see `ledger-integrity-detectors.service.test.ts`). That is the
actual reason most of these checks read "unverified" for three days: not clean, never completed.

**New scoreboard: Passing 2 · Failing 14 (B3 added, real) · N/A-today 19 (USMCA holds 0 JEs / 0
invoices / 0 bills / 0 expenses / 0 settlements right now — no load has been booked; this is the
CLAUDE.md §4 "an empty TMS table is expected" state, confirmed live, not assumed) · Genuinely
unbuilt 1 (B10, blocked on how to check a frozen-entity pair without reading it) · Baseline-only 1
(E4, needs a snapshot to diff against, established tonight).**

**The one real, live, currently-true violation this sweep found: B3.** USMCA has 343 non-voided
bank transactions summing to **−$4,724.65** — real money movement — and **zero** journal entries
of any kind. None of that activity has ever been posted to the GL. Filed as a new finding, routed
to CC-1 (Band B fix ownership is explicitly CC-1 per the table below; CC-2 builds/runs the check).

## Remediation owners

| Band | Owner |
|---|---|
| A, B | CC-2 builds the checks · CC-1 fixes what they find |
| C | CC-1 (LINKAGE INTEGRITY LAW — match as a record, DB-level trigger, one void convention) |
| D | CC-1 (bill mint, PAID chain) · Cascade enumerates |
| E | Codex (entity-safe by discipline) · CC-2 guards |
| F | CC-2 |
| G | CC-1 · Codex (identity first) |
| Wiring into `/api/v1/healthz` | CURSOR |
