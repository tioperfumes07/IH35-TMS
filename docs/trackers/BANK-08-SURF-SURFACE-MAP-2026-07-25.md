# BANK-08 — SURF-01 / SURF-05 → surface map (FROZEN 2026-07-25)

**Packet:** Cotulla-08 / BANK-08 · **Lane:** NON-FINANCIAL structural · **Module:** Banking  
**Scoreboard:** `docs/module-completion/banking.json` — banking **6 of 13** (no SURF FAIL→PASS without Neon lucia + browser click-through).  
**Desktop ranked findings:** `~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md` — **BANK-F04** (SURF-01), **BANK-F06** (SURF-05).  
**Structural companions:** verify-step **1465** (`verify-bank-surf-01-dod`) · verify-step **1466** (`verify-bank-surf-05-dod`).

> Freeze rule: each SURF PR cites exactly one row below. Do not invent a second surface mapping.  
> Rule 23/24: structural guards ≠ live DoD PASS. No flag flips. No Neon-apply in SURF structural PRs.

| ID | Surface (canonical) | Primary route(s) | Page / component | Manifest status |
|---|---|---|---|---|
| **BANK-SURF-01** | **Banking Home + account detail** (Accounts tiles incl. Factoring/Escrow virtual banks — NEVER-DELETE) | `/banking` · `/banking/accounts/:id` | `BankingHomePage` · `BankAccountDetailPage` · `AccountTilesRow` · `BankingTransactionsDesignView` | UNVERIFIED |
| **BANK-SURF-05** | **Factoring / Escrow / Relay / Plaid / Statement Import** entry tabs (never-delete TMS-only modules) | `/banking/factoring` · `/banking/driver-escrow` · `/banking/relay` · `/banking/plaid-connections` · `/banking/statement-import` | `BankingHomePage` per-tab content · `DriverEscrowTabContent` · `StatementUpload` · `BankingPlaidConnectionsPanel` | UNVERIFIED |

## NEVER-DELETE (Rule 07 / §F.24)

Factoring virtual-bank tile, Driver Escrow tile, Relay entry, Plaid Connections, and Statement Import **stay mounted**. No ComingSoon twin on the live route. Additive guards only.
