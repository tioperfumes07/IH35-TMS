# DEEP MODULE AUDIT — BANKING (Module 4)

## LIVE REFRESH 2026-07-25 (pkt6 / BANK-00) — supersedes prior thin DoD stub

**Why this section exists:** prior `banking.md` was a thin DoD/refresh note without a formal ranked
`BANK-F##` FAIL list (PERMANENT-FIX §1 / Full Audit Law). This rewrite publishes **M** and maps every
finding to `docs/module-completion/banking.json`. Seed counts below are GUARD-verified Neon
`br-fancy-credit-akjnd07a` (`SET app.bypass_rls='lucia'`, same transaction).

| Metric | Count | Maps to |
|---|---:|---|
| `banking.bank_transactions` | **10628** | BANK-ECON-01 PASS |
| `matched_journal_entry_id IS NOT NULL` | **3** | BANK-ECON-02 / BANK-SURF-02 **FAIL** |
| `banking.transfers` | **0** | BANK-ECON-03 / BANK-SURF-03 **FAIL** |
| `banking.reconciliation_sessions` | **0** | BANK-ECON-04 / BANK-SURF-04 **FAIL** |
| Live `bank_accounts` (`deactivated_at IS NULL`) with `ledger_account_id` | **7 / 7** | BANK-ECON-05 **PASS** (9 deactivated excluded — never delete) |
| Counterparty FK (`categorization_vendor_id` OR `categorization_customer_id`) | **2** | BANK-LINK-01 (wiring exists; density sparse) |

**Already-covered code (do NOT duplicate build PRs):**

| PR | State | Finding / manifest | What it covers |
|---|---|---|---|
| [#3424](https://github.com/tioperfumes07/IH35-TMS/pull/3424) | **MERGED** | BANK-F01 · BANK-ECON-02 / SURF-02 poster path | bulk categorize → `maybePostBankCategorizationToGl`; density still 3/10628 until ops + flag smoke |
| [#3445](https://github.com/tioperfumes07/IH35-TMS/pull/3445) | **MERGED** | BANK-F02 · BANK-ECON-03 / SURF-03 | `markBankFeedLineAsTransfer()` mints `banking.transfers`; Neon still **0** until operator use |
| [#3454](https://github.com/tioperfumes07/IH35-TMS/pull/3454) | **OPEN HOLD** | BANK-F03 · BANK-ECON-04 / SURF-04 | RLS on `banking.bank_accounts` blocks recon start (`lucia` bypass missing) |

**Module verdict: NOT DONE.** N of M from manifest (machine): see `docs/module-completion/banking.md`.
Published ranked-open **M = 10** (P0–P3 below). M grows when new FAILs appear (Rule 21).

---

## §7 Module-file header

| Field | Value |
|---|---|
| Module / sidebar ID | **BANKING** (Architectural Design Module 4) |
| Audit owner | Cursor (pkt6-bank-audit) — **DoD A–E + VERIFY 1–8** |
| Started / last updated | **2026-07-25** (BANK-00 ranked list) |
| Live environment | Neon prod `br-fancy-credit-akjnd07a` · `SET app.bypass_rls = 'lucia'` same txn |
| Routes / nav | Design Module 4 tabs + flyout: Accounts, Transactions, Reconciliation, Factoring, Escrow, Relay, Reports, Statement Import, Plaid, Settings, Transfers, Cash GL, Email Queue, Account Visibility |
| Canonical schema | **`banking.*`** — RETIRE `bank.*` (never write/FK retire for new work) |
| Audit status | **IN PROGRESS** — ranked list published; economics density still FAIL; surface structural proof via BANK-04 |
| Open finding counts | **P0 = 3 · P1 = 4 · P2 = 2 · P3 = 1** (**M = 10**) |
| Financial HOLD finding IDs | `BANK-F01`, `BANK-F02`, `BANK-F03`, `BANK-F05`, `BANK-F07` |
| Evidence rule | CI-green / merged / thin HOLD ≠ done. Hostile reviewer proves from this file + Neon lucia. |

---

## 0. Executive summary

1. **Feed exists; GL linkage is near-zero.** ~10.6k bank rows; **3** have `matched_journal_entry_id`. Poster path shipped (#3424); live density is the FAIL.
2. **Transfers and reconciliation economics are true empties** (`transfers=0`, `reconciliation_sessions=0`) — not RLS-masked zeros. Code paths: #3445 merged (mint transfer); #3454 HOLD (recon RLS root cause).
3. **Cash GL bind is PASS** — **7/7 live** accounts bound; prior 8/16 over-counted 9 deactivated rows (archive-never-delete). Protect with cashbind guard (BANK-05).
4. **Surfaces / Factoring·Escrow·Relay·Plaid·Import** were UNVERIFIED for full DoD; BANK-04 publishes structural prove + guards. Never delete those entry tabs (Rule 07 / §F.24).

---

## 1. Definition of Done — layer verdicts (binding)

| Layer | Verdict | Evidence |
|---|---|---|
| **A** Active path | **PARTIAL** | Routes mounted for core leaves; recon start blocked live (#3454) |
| **B** Wizard depth | **UNVERIFIED** | Categorize/Match field matrix not re-run browser this pass |
| **C** Law §9 F+R | **FAIL live** | matched_je 3/10628; transfers/recon 0; counterparty FK sparse |
| **D** Purpose→economics | **FAIL live** | Categorize/match/transfer/recon do not move live density |
| **E** Evidence | **This file + Neon** | Bypass `lucia` required |

**Module verdict: NOT DONE.**

---

## 2. Neon live proof (bypass lucia · seed 2026-07-25)

| Relation / predicate | Count |
|---|---:|
| `banking.bank_transactions` | **10628** |
| `matched_journal_entry_id` set | **3** |
| `banking.transfers` | **0** |
| `banking.reconciliation_sessions` | **0** |
| `banking.bank_accounts` total | **16** |
| live (`deactivated_at IS NULL`) | **7** |
| live ∧ `ledger_account_id IS NOT NULL` | **7** |

Settling SQL:

```sql
BEGIN;
SELECT set_config('app.bypass_rls','lucia',true);
SELECT count(*) FROM banking.bank_transactions;
SELECT count(*) FROM banking.bank_transactions WHERE matched_journal_entry_id IS NOT NULL;
SELECT count(*) FROM banking.transfers;
SELECT count(*) FROM banking.reconciliation_sessions;
SELECT count(*) FILTER (WHERE deactivated_at IS NULL) AS live,
       count(*) FILTER (WHERE deactivated_at IS NULL AND ledger_account_id IS NOT NULL) AS live_bound
FROM banking.bank_accounts;
ROLLBACK;
```

---

## 3. Surface inventory (every leaf)

Legend: `HAVE` / `MISSING` / `DRIFT` / `WILL FAIL` / `UNVERIFIED`.

| # | Surface | Path | Live path? | Live economics | Verdict | Finding |
|---|---|---|---|---|---|---|
| 1 | Accounts / Home | `/banking` | LIVE | tiles + cash-bind | `HAVE` chrome; economics elsewhere | BANK-F04 |
| 2 | Account detail / Register | `/banking/accounts/:id` | LIVE | feed per account | `HAVE` route | BANK-F04 |
| 3 | Transactions (feed) | `/banking/transactions` | LIVE | 10628 rows | `HAVE` · JE density FAIL | BANK-F01 |
| 4 | Categorize / Match | DesignView + MatchDrawer | LIVE | 3 categorized/JE | `WILL FAIL` density | BANK-F01 / F05 |
| 5 | Rules | `/banking/categorization-rules` | LIVE | — | `UNVERIFIED` depth | BANK-F08 |
| 6 | Transfers | `/banking/transfers` | LIVE | **0** rows | `WILL FAIL` | BANK-F02 |
| 7 | Reconciliation | `/banking/reconciliation` (+ workspace) | LIVE | **0** sessions | `WILL FAIL` | BANK-F03 |
| 8 | Factoring (Faro) entry | `/banking/factoring` | LIVE | entry → `/factoring` | `HAVE` tab; econ separate | BANK-F06 |
| 9 | Driver Escrow | `/banking/driver-escrow` | LIVE | honest empty ok | `HAVE` tab | BANK-F06 |
| 10 | Relay Card | `/banking/relay` | LIVE | feed visibility | `HAVE` tab | BANK-F06 |
| 11 | Statement Import | `/banking/statement-import` | LIVE | — | `HAVE` tab | BANK-F06 |
| 12 | Plaid Connections | `/banking/plaid-connections` | LIVE | — | `HAVE` tab | BANK-F06 |
| 13 | Settings | `/banking/settings` | LIVE | — | `HAVE` tab | BANK-F09 |
| 14 | Reports | `/banking/reports` | LIVE | — | `HAVE` | BANK-F09 |
| 15 | Cash GL setup | `/banking/cash-gl-setup` | LIVE | 7/7 bound | `HAVE` · PASS protect | BANK-F10 |
| 16 | Email Queue / Visibility | `/banking/email-queue`, `account-visibility` | LIVE | — | `HAVE` (never-delete) | BANK-F09 |

---

## 4. Findings (ranked) → buildable blocks — **published M = 10**

### P0 — FIN-HOLD (live economics)

| ID | Finding | Proof | Manifest | Block / PR | Owner gate? |
|---|---|---|---|---|---|
| **BANK-F01** | Bank feed almost unlinked to JE (**3 / 10628**) | Neon §2 | BANK-ECON-02, BANK-SURF-02 | **Covered by #3424 MERGED** — do not re-build poster; remaining = density + flag smoke | Flag ON + operator categorize = Jorge |
| **BANK-F02** | `banking.transfers` = **0** | Neon §2 | BANK-ECON-03, BANK-SURF-03 | **Covered by #3445 MERGED** — mint path exists; remaining = operator use → count > 0 | Operator use |
| **BANK-F03** | `reconciliation_sessions` = **0**; recon start blocked by `bank_accounts` RLS (no lucia bypass) | Neon + #3454 | BANK-ECON-04, BANK-SURF-04 | **#3454 OPEN HOLD** — do not duplicate | `JORGE-APPROVED` + Neon-apply |

### P1 — surfaces + linkage (BANK-04)

| ID | Finding | Proof | Manifest | Block | FIN-HOLD? |
|---|---|---|---|---|---|
| **BANK-F04** | Banking Home + account detail DoD A–E was UNVERIFIED (routes exist; full matrix not locked) | Routes + prior guards | BANK-SURF-01 | BANK-04 structural guard + evidence | Structural = NON-FINANCIAL; money touch = HOLD |
| **BANK-F05** | Categorize/Match VERIFY 1–8 incomplete vs live density FAIL | same as F01 | BANK-SURF-02 | Docs map to #3424; no duplicate poster PR | **FIN-HOLD** for any new posting |
| **BANK-F06** | Factoring / Escrow / Relay / Plaid / Statement Import active-path + honest-empty UNVERIFIED | Tabs reachable | BANK-SURF-05 | BANK-04 composite surface guard | No |
| **BANK-F07** | Bank txn ↔ counterparty / Bill/Payment/Transfer EntityLink both-way UNVERIFIED at Neon density | Code has `categorization_vendor_id` / `customer_id` + EntityLink kinds | BANK-LINK-01 | BANK-04 counterparty + EntityLink structural guard | **FIN-HOLD** if schema |

### P2

| ID | Finding | Manifest / notes | Block |
|---|---|---|---|
| **BANK-F08** | Categorization Rules / Automatch depth not re-proven this pass | Rules leaf | Future click-through after F01 density |
| **BANK-F09** | Settings / Reports / Email Queue / Visibility — reachability OK; deep wizard UNVERIFIED | never-delete entry points | Honesty guards exist; no delete |

### P3 — controls (BANK-05 protect PASS)

| ID | Finding | Manifest | Block | FIN-HOLD? |
|---|---|---|---|---|
| **BANK-F10** | Cashbind metric can lie if deactivated rows counted (prior 8/16) — **ECON-05 PASS must not regress**; GATE-01 must stay honest | BANK-ECON-05 PASS, BANK-GATE-01 PASS, BANK-CTRL-01 PASS | BANK-05 cashbind guard + confirm 1430 theater gate | Protect only |

---

## 5. Manifest map (Rule 24)

| Manifest item | Status (machine) | Ranked id(s) | Notes |
|---|---|---|---|
| BANK-ECON-01 | PASS | — | feed > 0 |
| BANK-ECON-02 | FAIL | BANK-F01 | #3424 code; density open |
| BANK-ECON-03 | FAIL | BANK-F02 | #3445 code; count 0 |
| BANK-ECON-04 | FAIL | BANK-F03 | #3454 HOLD |
| BANK-ECON-05 | PASS | BANK-F10 | 7/7 live bound — keep guard |
| BANK-SURF-01 | UNVERIFIED→prove | BANK-F04 | BANK-04 |
| BANK-SURF-02 | FAIL | BANK-F01 / F05 | do not duplicate #3424 |
| BANK-SURF-03 | FAIL | BANK-F02 | do not duplicate #3445 |
| BANK-SURF-04 | FAIL | BANK-F03 | do not duplicate #3454 |
| BANK-SURF-05 | UNVERIFIED→prove | BANK-F06 | BANK-04 |
| BANK-LINK-01 | UNVERIFIED→prove | BANK-F07 | BANK-04 |
| BANK-CTRL-01 | PASS | BANK-F10 | flag OFF by design |
| BANK-GATE-01 | PASS | BANK-F10 | verify-step 1430 |

---

## 6. Ordered next actions

1. **BANK-00 (this file):** ranked list + published M — **DONE**.
2. **BANK-04:** structural guards for BANK-F04 / F06 / F07; docs-only for F05 (#3424). One PR per finding.
3. **BANK-05:** cashbind guard (BANK-F10); do not weaken GATE-01 / 1430.
4. **Do not open competing PRs** for F01–F03 while #3424/#3445/#3454 cover code.
5. No module COMPLETE claim while M open economics remain FAIL.

---

**Honesty line:** Banking is **not** DoD-complete. Feed chrome without JE/transfer/recon density is not a finished money module. This file replaces the prior thin stub as the working ranked audit.
