# BANK-MODULE-DOD — per-surface DoD A–E + VERIFY 1–8 sweep matrix (FROZEN 2026-07-25)

**Block:** BANK-MODULE-DOD · **Lane:** FINANCIAL-HOLD · **Module:** banking  
**Branch:** `hold/bank-module-dod-sweep-matrix-20260725` · **Guard:** `scripts/verify-bank-surface-dod-sweep.mjs` (verify-step **1477**)  
**Machine matrix:** `docs/trackers/BANK-MODULE-DOD-SWEEP-MATRIX-2026-07-25.json`  
**Scoreboard:** `docs/module-completion/banking.json` — banking **6 of 14** (M grew 13→14 via BANK-SURF-06 Rules leaf)

> Freeze rule: every surface row cites manifest IDs; **no FAIL→PASS** without live Neon + browser evidence (Rule 23).  
> UNVERIFIED cells are honest — browser TRANSP+USMCA click-through remains open per cell.

## Surface → manifest binding

| Surface ID | Route(s) | Canonical table | Manifest item(s) |
|---|---|---|---|
| **SURF-Bank-feed** | `/banking/transactions` | `banking.bank_transactions` | BANK-ECON-01, BANK-SURF-02 |
| **SURF-Register** | `/banking/accounts/:id` | `banking.bank_transactions` | BANK-SURF-01 |
| **SURF-Account-detail** | `/banking/accounts/:id` | `banking.bank_accounts` | BANK-SURF-01 |
| **SURF-Rules** | `/banking/categorization-rules` | `banking.bank_transactions` | **BANK-SURF-06** (new leaf) |
| **SURF-Transfers** | `/banking/transfers` | `banking.transfers` | BANK-ECON-03, BANK-SURF-03 |
| **SURF-Reconcile** | `/banking/reconciliation`, `/banking/reconciliation-workspace` | `banking.reconciliation_sessions` | BANK-ECON-04, BANK-SURF-04 |
| **SURF-Bank-accounts-Cash-bind** | `/banking`, `/banking/cash-gl-setup` | `banking.bank_accounts` | BANK-ECON-05, BANK-SURF-01 |
| **SURF-More** | Factoring / Escrow / Relay / Plaid / Statement Import | `banking.bank_accounts` | BANK-SURF-05 |

Cross-cutting linkage: **BANK-LINK-01** (VERIFY-4 / DOD-C on feed, register, transfers, reconcile).

## Layer sweep summary (208 cells = 8 surfaces × 2 entities × 13 layers)

| Status | Count | Notes |
|---|---:|---|
| PASS | 38 | Structural route/API/Neon proofs only where cited |
| FAIL | 8 | Inherited from BANK-ECON-02/03 (density); not flipped |
| HOLD | 4 | BANK-ECON-04 recon RLS — owner Neon-apply |
| UNVERIFIED | 158 | Browser TRANSP+USMCA click-through open |

## Known FAIL / HOLD cells (not flipped)

| Manifest | Surface(s) | Blocker |
|---|---|---|
| BANK-ECON-02 / SURF-02 | Bank feed | matched_je=3/10628 |
| BANK-ECON-03 / SURF-03 | Transfers | transfers=0 |
| BANK-ECON-04 / SURF-04 | Reconcile | RLS bypass; owner Neon-apply |

## Fix blocks spawned (additive)

Each UNVERIFIED browser cell names `BANK-MODULE-DOD-CLICK-<surface>-<entity>` or cites existing manifest fix block (BANK-ECON-*, BANK-LINK-01, BANK-SURF-*).

## NEVER-DELETE (Rule 07)

Sweep adds evidence + M growth only. No routes/tabs deleted.
