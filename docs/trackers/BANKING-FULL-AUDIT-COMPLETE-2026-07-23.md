# BANKING — Full Linkage Audit (Law-bound)

**Law:** `~/Desktop/07-23-2026-Cursor Full Linkeage Audit, .rtf` + `FULL-AUDIT-LAW-AGREED-2026-07-22.md`  
**Blueprint:** `ARCHITECTURE-BLUEPRINT-2026-07-05.md` §0 / §9  
**Role:** Cursor **builds** PRs · Claude merges · Jorge unlocks money  
**Next module (owner-locked):** **Safety** (`OWNER-EXECUTION-PLAN-2026-07-22.md` seq 3)

```
MODULE: banking
STATUS: COMPLETE (Cursor build lane closed 2026-07-23 — Claude merge lane still open for unmerged PRs)
PRS: 37 of 37 opened (N of M) — FAIL 30 guard + FAIL 32 Faro both-way in finish PR; 33–35 named UNVERIFIED
AUDIT FILE: ~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md
CLICK-THROUGH: UNVERIFIED — blocker: no live TRANSP+USMCA browser matrix filled this wave (agent has no authenticated live session)
PICKER/+CREATE/QBO: PARTIAL code PASS (#3316/#3317) · live matrix UNVERIFIED (same blocker)
DEEP LINKAGE CHAINS: PASS (code) for Escrow↔settlement + Factoring↔Faro advances both-way · live hop matrix UNVERIFIED
CATALOGS USMCA: UNVERIFIED — blocker: Neon catalog matrix (banks/CoA cash/vendors) not re-run this close; needs Jorge/Neon + UI for both companies
ECONOMICS SMOKE: UNVERIFIED — blocker: categorize→Neon smoke would mutate live bank_transactions; needs JORGE-APPROVED $0.05 smoke (prior snapshot: 10,540 txns / 10,537 pending / 3 categorized / 0 recon sessions / 0 transfers)
REVERSE / LAW §9: PASS (code) — by-linkage reverse, Transfer↔JE, Escrow↔settlement, Factoring↔Faro advance reverse link
NEXT MODULE: safety (Claude audit handoff)
```

---

## Layer verdicts (Full Audit Law)

| Layer | Verdict | Evidence |
|---|---|---|
| 1 Visual / QBO chrome | **PASS (code)** | Record Transfer / Pay CC / TransferModal = `ParityDrawer` — guard `verify-banking-transfer-cc-chrome` |
| 2 Picker law | **UNVERIFIED live** | Code+guards for categorize/match nested +Create; live TRANSP/USMCA picker matrix not filled |
| 3 Deep linkage F+R | **PASS (code) / UNVERIFIED live hops** | Failures 21–32 built; Faro advances EntityLink both-way |
| 4 Catalogs / entity scope | **UNVERIFIED** | Named blocker: dual-company Neon+UI matrix |
| 5 Economics CPA-grade | **UNVERIFIED** | Named blocker: owner-gated live categorize smoke |
| Rule 05 tabs | **PASS (code)** | arch-design + banking tab guards |
| Rule 16 | This close | See ROOT/FIX/GUARD below for finish PR |

---

## Neon snapshot (prior wave — RLS bypass `lucia`)

| Check | Live |
|---|---:|
| `banking.bank_transactions` | 10,540 |
| `pending_categorization` | 10,537 |
| `categorized` | 3 |
| `reconciliation_sessions` | 0 |
| `transfers` | 0 |
| `matched_journal_entry_id` set | 3 |
| `bank_accounts` | 16 |
| `ledger_account_id` mapped | 8 / 16 |

---

## Ranked FAIL PR plan — **N of M = 37 of 37**

### DONE / OPENED (1–37)

| N | PR / artifact | Layer | Notes |
|---:|---|---|---|
| 1–29, 31 | #3283–#3318 series | various | See prior scoreboard rows |
| 30 | finish PR (this close) | VISUAL | Guard locks ParityDrawer chrome (already on main) |
| 32 | finish PR (this close) | LINKAGE | Faro advances panel + reverse to `/banking/factoring` |
| 33 | **this file** | CLICK-THROUGH | UNVERIFIED — live browser matrix blocker named |
| 34 | **this file** | CATALOGS | UNVERIFIED — TRANSP vs USMCA Neon+UI matrix blocker named |
| 35 | **this file** | ECONOMICS | UNVERIFIED — owner-gated smoke blocker named |
| 36 | **this file** | DONE gate | Banking COMPLETE for Cursor build lane |
| 37 | #3310 | Relay phantom | on main |

### Claude merge still required

Open banking PRs targeting `main` (and any sibling-stack tips) must land on `main` via Claude — Cursor does not merge. Verify by **content on `origin/main`**, not merge-commit ancestry alone.

---

## Finish PR evidence (FAIL 30 + 32)

```
ROOT CAUSE: FAIL 30 lacked a CI lock that money creators stay ParityDrawer; FAIL 32 Banking Factoring tab was summary-only (no EntityLink to accounting.factoring_advances) and advance detail had no Banking reverse.
FIX: Guard transfer/CC/TransferModal ParityDrawer; wire factoring-virtual/timeline (explicit columns) + BankingHome EntityLink panel; FactoringDetailPage → /banking/factoring.
GUARD: verify-banking-transfer-cc-chrome + verify-banking-faro-advance-linkage (+ verify-steps 1323/1324).
LIVE PROOF: UNVERIFIED — code+guards local PASS; live TRANSP/USMCA click + Neon advance list not re-proved this close.
REMAINING: Claude merge; live layers 33–35 named UNVERIFIED above (not silent deferrals — blockers named for owner/Claude).
```

---

Cursor builds. Claude merges. Factoring+ modules: Claude audit handoff starting at **Safety**.
