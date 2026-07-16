# Highest-cost honesty gaps (ranked) — GUARD-ACCEPTED 2026-07-16

**Source of ranking:** Cursor audit + GUARD-FEEDBACK-2026-07-16.  
**Sequence law:** financial/legal integrity **before** UX chrome.  
**Tab counts:** design decision — **HOLD for owner ruling**; never delete tabs to “match.”

**Recommendation law:** Fix root causes. Never delete modules. Never claim done without live proof. Posting flags OFF until CPA/tie-out.

| # | Gap | Why | Evidence |
|---|-----|-----|----------|
| **1** | **425C hardcoded petition_date** | Active Ch.11 court filing legal exposure | Form425CHome was `"2025-02-03"` — **FIX IN WORKTREE (bind from case SoR / Profiles; not prod until merge+live)** |
| **2** | Fuel GL poster zero callers + Relay silo | Books/IFTA lie after “successful” import | poster.service.ts; relay ingest — **Relay/QBO specs delivered** |
| **3** | QBO dual-write collapse Step-2 | Unblocks opening balances 03/31 | mdata cols applied; accounting.qbo_* RETIRE |
| **4** | Dual settlement engines payroll.* + driver_finance.* | Wrong SoR for pay | team-splits / auto-deductions / driver-settlement.service |
| **5** | Fine→liability without deduction seed | Settlements under-deduct | applier reads policies not fines |
| **6** | Claim → expense → WO → receivable → settlement | Court/insurance graph missing | Held FKs; no claim detail |
| **7** | Opening balances as-of 03/31/2026 not done | Books cannot tie | 0 accounts with OB (GUARD) |
| **8** | Dead EntityLinks / query params | Fake green links | expense null; dead ?ids |
| **9** | Bank Register unbound + sort/group | Daily ops ≠ QBO | BankingHome → empty picker |
| **10** | Expense/Bill chrome + Maint forks | Wrong payee/GL; not QBO side panels | **AFTER integrity** (§7.6) |
| **11** | FACT chargebacks without advance links | Cannot drill money | ChargebacksTable |
| **12** | Dispatch Factoring `load` + `book_load=1` | Drawer/Reserve broken | **FIX IN WORKTREE — not prod** |
| **13** | Customers New transaction drops `customer_id` | Deep link dead | **FIX IN WORKTREE — not prod** |
| **14** | Inventory Assignments ≡ Purchases | False ledger surface | Identical pages |
| **15** | Home dual door / Docs dead KPIs / Finance Hub wall / Banking stubs | Ops trust | modules 17/20/23/04 |

## Build order (GUARD — integrity first)

1. 425C petition_date  
2. Fuel bridge + poster (flags OFF)  
3. QBO collapse Step-2  
4. Settlement writer collapse  
5. Fine→deduction seeding  
6. Claim graph (owner-gated)  
7. **THEN** UX/EntityLink/Bank Register/side panels/tab-count rulings  

## Tab-count HOLD (not a bug)

Banking 12-vs-5, Accounting ~12-vs-57 — **owner must rule which is canonical** before any code change. Never delete tabs.
