# CASCADE STANDING DIRECTIVE — LIVE END-TO-END WIRING AUDIT (go-live)

**Owner-directed 2026-08-08. This supersedes Cascade's static class-drain queue until go-live is proven. Do not deviate.**

## Why this exists
Static source-regex scans PREVENT REGRESSIONS of defects already found. They do **not** prove a
module works. Go-live needs the opposite: proof that a real transaction, created in the app, actually
lands in **GL + audit + both-way linkage** on live prod. Cascade runs live prod SQL — that is the
capability this directive uses. **PAUSE** the static class-drains (CLS-JOIN-ENTITY-UNSCOPED, etc.).

## Scope — WHERE the battery runs (keep USMCA pristine for Sunday)
- **Battery + wiring audit run on TRANSP TMS-native** (`91e0bf0a-133f-4ce8-a734-2586cfa66d96`), **QBO write-back OFF**.
  This is the designated parallel/test ledger: the real QuickBooks books are untouched, the TMS GL + audit
  still capture everything, and the wiring is shared entity-isolated code — proving it here proves it for USMCA.
- **USMCA (`5c854333-6ea5-4faa-af31-67cb272fef80`) gets NO test transactions.** Sunday the owner uploads REAL
  trips into a clean USMCA. For USMCA, Cascade runs a **readiness check only** (below), not a transaction battery.
- Cascade authors **live prod-SQL audit assertions** (Cascade lane: live-audit scripts — NOT HTTP boot, NOT fix code).
- Cascade **verifies the transactions CC-3 creates through the app** (on TRANSP TMS-native). Cascade does NOT create them.

## The chain that must be proven per transaction type (record row IDs)
1. **GL** — the correct `accounting.journal_entries` posted, balanced DR=CR, correct accounts, USMCA-scoped.
2. **AUDIT** — an `audit.row_changes` / `audit_events` row exists **with a non-null actor**.
3. **LINKAGE** — both-way link source↔GL↔master-data exists as a **real FK**, not a memo string.

A type missing ANY of the three = **FAIL**. No source-regex proxies — read the actual rows.

## Priority order (Monday money path first)
1. **INVOICE → FACTORING (Faro).** Monday: invoice customers, Faro purchases first invoices. Prove
   invoice-create posts AR GL; factoring submission/purchase posts advance + reserve + factor-fee JEs,
   balanced, USMCA-scoped, audited, linked invoice↔factoring batch↔GL. Highest-stakes wire in the system.
2. **DRIVER SETTLEMENT → GL** (pay, deductions, tarp, fuel) — verify against CC-3's 5753 replica; ties to the cent AND posts.
3. **ACCOUNTING/FINANCE** — bill, expense, payment, bank categorize, void/reversal.
4. **CUSTOMER + VENDOR** — create → master-data linkage → usable on invoice/bill.
5. **SAFETY** — driver incident, fine → GL hop where one exists (civil fine expense), audit.
6. **MAINTENANCE** — work order → parts/AP bill → GL, both-way linked.

## USMCA readiness check (no transactions — config proof only)
Confirm USMCA will behave identically when real data lands Sunday: entity-isolation (RLS) intact; chart of
accounts + account-role bindings present for every account the 6 flows post to; posting flags in the intended
state; no cross-entity leakage from the TRANSP-native battery into USMCA. Report PASS/FAIL with evidence.

## Deliverable (by Saturday)
A per-transaction-type **PASS/FAIL truth-map on USMCA** with the proving row IDs, that **REPLACES** the
`code-verified / live-exercise-pending` rows in `AUDIT-COVERAGE-LIVE.md`. Every `code-verified` row that
cannot be re-proven live → **downgrade to NOT-PASS**.

## For each FAIL
File the exact broken wire (which of GL/audit/linkage is missing + root cause), author the **regression
guard** (Cascade specialty), route the fix to CC-1 (money) / CC-2 (mechanical). A live-proven gap with a
guard — not a source-pattern count.

## Coordination
CC-3 creates through the app; Cascade reads + asserts + guards. No collision. Gaps flow agent→board→agent,
never through the owner.
