# READ FIRST — CURSOR upload (current rules + reconcile) · 2026-07-26

This folder is the CURRENT, final block set for your lane: **Accounting, Banking, Maintenance, Factoring, Settlements.**
Build to TODAY'S state and rules below — several findings in these blocks were already fixed on prod this session.
Commit these into `docs/blocks/` and reconcile into `docs/trackers/BLOCK-RECONCILIATION`. Dedupe vs what's already
committed (Accounting-DOM, Banking-DOM, C1–C11 are already in the repo).

## The rules every block obeys (updated this session)
- **No outside accountant sign-off — the OWNER decides every accounting/tax/policy question.** Any accountant-authority wording in a block = read as "owner".
- **Testing posture (owner-locked):** GL posting is ON in ALL 3 entities (TRANSP/TRK/USMCA); QBO write-back stays OFF
  (TMS never writes to QuickBooks). Money-posting is being exercised for testing — do NOT re-disable posting flags.
- **Standard:** 8-Layer Connected-Closure + DoD A–E + VERIFY 1–8 + Law of the Land + LINKAGE LAW. Guard-first (verify-step
  RED→GREEN + selftest on real source). Canonical tables only, never write a RETIRE table. Reuse the poster, no new GL math.
- **Owner decisions are locked in `OWNER-DECISIONS-FINAL.md` (included).** Build to them.

## ALREADY FIXED ON PROD this session — mark DONE, do NOT rebuild (you owe only the matching repo migration + guard)
- **SET-02** (net-pay clearing role mis-bound) → FIXED: `catalogs.accounts` 2170 "Driver Net-Pay Clearing" (Liability)
  created for TRANSP + `chart_of_accounts_roles.driver_payroll_clearing` rebound off QBO-149. You owe the idempotent
  migration + `verify-netpay-clearing-is-liability.mjs`.
- **Intercompany accounts (A2 / BANK-DOM-05 foundation)** → SEEDED on prod: 8000-block "Inter-company – <Counterparty>"
  accounts, all 3 pairs (TRANSP 8001/8002, TRK 8000/8002, USMCA 8000/8001). You owe the matching seed migration.
- **Revenue-recognition posting** → ENABLED for TRANSP + USMCA (Unbilled Revenue accounts 1240/1150 already exist; TRK excluded).
- **Fuel-overage recovery flag** → ON for all 3; BANK-DOM-06 tables on prod (PR #3602).

## SUPERSEDED / CHANGED by owner decisions — build to the NEW value
- **FACT-01** ("factoring flag violates its contract, turn off") → SUPERSEDED by the testing posture (posting ON everywhere).
  Not a defect. Do not act on FACT-01's "delete overrides" step.
- **SET-01** (deprecated FIN-18 poster mounted, mis-routes escrow/advance) → work-order already issued; retire the route → 308 canonical. STILL valid, urgent.
- **C5 chargeback** → the COMPANY absorbs factoring chargebacks, NOT the driver (company drivers, not owner-operators). Remove any driver-charge path.
- **Escrow cap = $2,500** (code caps $2,000 today → change to $2,500).
- **Capitalize-vs-expense threshold = $7,000**; capitalized repairs → "Fixed Asset – Trucks"; big expensed repairs → new "Heavy Repair Expense".
- **Fixed-asset + auto-depreciation register: BUILD NOW** (owner: never defer) — FLT-01/FLT-08 class.
- **Invoicing pipeline (build, fully wired):** auto Pro Forma Invoice at booking → apply broker advance (liability) → at POD auto-convert to Official Invoice (A/R) → auto-send to factoring.

## Files in this folder
00-FINAL-VERIFIED-STATUS-CURSOR.txt (authoritative per-block verdicts) · BLOCKS-ACCOUNTING/BANKING/MAINTENANCE.txt ·
00-BUILD-ORDER-MODULES-11-12.txt · BLOCKS-FACTORING.txt · BLOCKS-SETTLEMENTS.txt · OWNER-DECISIONS-FINAL.md.
