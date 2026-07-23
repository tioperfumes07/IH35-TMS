# TRUE AUDIT — Accounting + Banking (2026-07-23)

**Method:** Neon prod `br-fancy-credit-akjnd07a` with `app.bypass_rls=lucia` same txn · repo `origin/main` @ live fetch · open PRs by content not ancestry.  
**Law:** Full Audit five layers. CI-green ≠ done. Owner-declared COMPLETE ≠ live economics PASS.

---

## Neon live counts (RLS bypass · this session)

| Metric | Count | Meaning for audit |
|---|---:|---|
| `banking.bank_transactions` | **10,549** | Feed exists |
| `banking.transfers` | **0** | No transfer economics live |
| `banking.bank_accounts` | **16** | |
| cash GL bound (`ledger_account_id`) | **8 / 16** | Half unbound |
| `matched_journal_entry_id` set | **3** | Almost no JE linkage |
| `banking.reconciliation_sessions` | **0** | Recon not live-proven |
| `accounting.expenses` | **0** | Expense chain never exercised live |
| `accounting.bills` | **16,201** | Headers exist |
| `accounting.bill_lines` | **1** | **Lines essentially absent** vs headers |
| `accounting.bill_payments` | **0** | Pay Bill never live |
| `accounting.chart_of_accounts_roles` | **0** | **Poster cannot resolve control accounts** |
| `accounting.factoring_advances` | **0** | Faro advances empty on prod |
| `accounting.journal_entries` | **8** | Sparse |

---

## ACCOUNTING — true layer verdicts

| Layer | Verdict | Evidence |
|---|---|---|
| 1 Visual / QBO chrome | **PASS (repo)** | Expense/Bill/PayBill = ParityDrawer on main; guards exist |
| 2 Picker law | **UNVERIFIED live** | Code remediations shipped; TRANSP/USMCA live matrix not re-run this session |
| 3 Deep linkage F+R | **PARTIAL code / FAIL live economics** | Expense reverse pages on main; live expenses=0, bill_payments=0 |
| 4 Catalogs / CoA roles | **FAIL live** | `chart_of_accounts_roles = 0` with RLS bypass — false-empty ruled out |
| 5 Economics CPA-grade | **FAIL live** | bills 16201 vs bill_lines 1; roles 0; expenses 0; no smoke this session |
| Owner status file | Said COMPLETE 2026-07-23 | **Owner process close ≠ evidence PASS.** Named: CoA roles empty + bill lines gap remain fact |

**Accounting module for Full Audit Law:** **NOT EVIDENCE-COMPLETE.** Owner may still choose to accept UNVERIFIED/HOLD-NEON and move sequence — but this file will not call layers 4–5 PASS.

---

## BANKING — true layer verdicts

| Layer | Verdict | Evidence |
|---|---|---|
| 1 Visual / QBO chrome | **PASS (repo+guard)** | Transfer/CC ParityDrawer + `verify-banking-transfer-cc-chrome` |
| 2 Picker law | **UNVERIFIED live** | Categorize/Match +Create code; live matrix not filled |
| 3 Deep linkage F+R | **PARTIAL code / UNVERIFIED live** | Links panel / Faro EntityLink / escrow code in drain PR; Neon advances=0, matched_je=3 |
| 4 Catalogs USMCA | **UNVERIFIED** | Dual-company matrix not run this session |
| 5 Economics | **FAIL / UNVERIFIED smoke** | 10,549 txns · 0 transfers · 0 recon sessions · no categorize smoke |
| Relay | **PASS honesty (repo)** | Phantom `is_relay` disclosed; not treated as discriminator |

**Banking module:** **NOT COMPLETE.** Build drain consolidates open conflicting PRs; live layers remain open.

---

## Clear git picture (target state after drain PR)

| Item | State |
|---|---|
| `origin/main` | `7da922c26` (+ whatever Claude merges) |
| **Drain PR** `fix/banking-honesty-drain-main` | One clean PR off main: honesty 14–21 + load EntityLink fix + Faro both-way + chrome guards |
| #3296–#3305 | **Close as superseded** by drain (were CONFLICTING) |
| #3322 | **Close as superseded** by drain (same 30/32 content) |
| #3320 | Meta-guard — separate; still CONFLICTING (not banking product) |

---

## What “verified” means here

- **Verified now:** Neon counts above; repo guards local PASS on drain branch; open PR conflict inventory.
- **Not verified:** Live browser click-through TRANSP+USMCA; picker matrix; categorize→Neon smoke; CoA role re-seed.
