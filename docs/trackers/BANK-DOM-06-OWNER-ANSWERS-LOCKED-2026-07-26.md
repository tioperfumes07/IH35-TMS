# BANK-DOM-06 — Owner answers LOCKED (2026-07-26) · CORRECTED entity scope

**Source:** Jorge chat. Prior “TRANSP only” line was **WRONG** — corrected same day.

## Entity / testing law (DO NOT FORGET)

| Company | Role | Posting / testing |
|---|---|---|
| **USMCA** | Brand-new company | **Fully functional.** Everything posts. Begin testing here. Balances start clean. |
| **TRK** | Trucking — leases only | **Use as test** as well. Posting OK. |
| **TRANSP** | Live transportation ops | **Testing OK immediately.** Ops + test. |

**Books law (already locked):** TMS and QuickBooks are **parallel**. We **sync FROM QuickBooks** and **reconcile daily**. We do **NOT write to QuickBooks**. Testing TMS posts does **not** hurt QBO.

## Fuel overage policy (all three companies)

| Topic | Owner answer |
|---|---|
| Gallon cap | **150 gallons** per swipe |
| Dollar limit today | ~**$6/gal** → **$900** per swipe (tracks pump price) |
| Non-fuel / personal | **Yes — recover full amount** |
| Do NOT auto-recover | **Repairs** and **authorized** company spend |
| Approval | **Approve first, then recover if necessary** |
| Companies | **TRANSP + USMCA + TRK** (not TRANSP-only) |

## Neon state after correction

- Schema `202609150000` applied (earlier).
- Policies seeded: **TRANSP, USMCA, TRK** — `$900` · `recover_non_fuel_purchases=true`.
- Per-entity overrides: `FUEL_CARD_OVERAGE_RECOVERY_ENABLED=true` for **all three** (global default remains false).
- Approve-then-recover UI/queue + repair/authorized exception still need code to match lock fully (current path can seed deduction when flag on — owner accepted testing now).

## Forbidden re-ask

Do **not** again say “TRANSP only” or “wait to test until USMCA is ready.” USMCA is the clean test books; TRK is lease/test; TRANSP tests now; no QBO write-back.
