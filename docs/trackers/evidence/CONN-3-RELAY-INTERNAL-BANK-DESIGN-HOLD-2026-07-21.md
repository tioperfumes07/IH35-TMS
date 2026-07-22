# CONN-3 — Relay as internal bank — DESIGN HOLD (owner questions only) — 2026-07-21

**Builder role:** Cursor BUILDER. Docs only — no code, no migration edits, no merge, no Neon-apply.
Base: `origin/main` @ `e2db37a74`. Does **not** touch `#3123` / `#3124` (financial HOLD-FOR-JORGE,
owner-only).

**Pile item:** `CONN-3-relay-internal-bank`, `pile: NEEDS-OWNER`,
`docs/trackers/block-audit-piles-2026-07-21.json` — evidence: "backlog-verify NEEDS-OWNER (owner/CPA
ruling required)".

---

## 1. There is no open *design* question left — this is ACTION-ONLY

`docs/trackers/NEEDS-OWNER-ADJUDICATION-2026-07-21.json` (id `CONN-3-relay-internal-bank`) already
resolved the design question:

> **verdict: ACTION-ONLY** — "No open question — Relay is real and ingest is built; the
> wallet-registration migration is held."
> **ruling_citation:** `docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md` — "Relay fuel (CONN-3): real…
> ingest built (PR #2181) with 24-month backfill."
> **buildable_action:** "Owner runs held `202607470000_relay_wallet_banking_registration.sql` on a
> Neon branch/prod so the Relay Fuel Wallet appears in `/banking`."

This PR's contribution is confirming that reading holds up against the current repo state (below) and
surfacing the **one** parameter the held migration itself flags as still open, so the owner ceremony
can happen in a single pass instead of two.

## 2. What is real vs held today (repo-verified)

| Piece | State |
|---|---|
| Relay fuel-transaction ingest (pull + webhook staging) | **BUILT** — `db/migrations/202607110000_relay_fuel_ingest.sql`, shipped ingest code path `PR #2181` per locked decisions |
| Relay deposit-funding classifier + review queue | **BUILT-AND-HELD** — `db/migrations/202607280000_relay_deposit_classifier.sql` (`HOLD-FOR-JORGE — FINANCIAL`) |
| Relay as its own internal bank, master-data seed (`catalogs.accounts` #1295, `system_purpose='relay_fuel_wallet'`) | **BUILT-AND-HELD** — `db/migrations/202607290000_relay_internal_bank_seed.sql` (`HOLD-FOR-JORGE — FINANCIAL`) |
| Relay Fuel Wallet registered as a `banking.bank_accounts` row (so it appears on `/banking`) | **BUILT-AND-HELD** — `db/migrations/202607470000_relay_wallet_banking_registration.sql` (`HOLD-FOR-JORGE — FINANCIAL`) — depends on the seed migration above running first |
| CSV ingest_source check-constraint fix (`daily_pull\|webhook` → allow `csv_import`) | Additive fix, not marked HOLD — `db/migrations/202607570000_relay_fuel_ingest_source_csv_import.sql` |
| Any of the above applied on prod | **No** — none of the 5 `relay*` migration files appear in `db/migrations/.ledger.json` today. All are unapplied. |

**Apply order** (the 3 HOLD-FOR-JORGE ones are sequence-dependent, confirmed from each file's own
preconditions): `202607110000` (ingest) → `202607280000` (deposit classifier) → `202607290000`
(internal-bank seed, `catalogs.accounts` #1295) → `202607470000` (bank_accounts registration —
this migration's own `DO $$` block `RAISE NOTICE`s and no-ops with 0 rows if #1295 is absent, so it
is safe to run after but not before the seed).

## 3. The one open parameter (flagged inside the migration itself, not invented here)

`202607470000_relay_wallet_banking_registration.sql` inserts the wallet with
`account_type = 'depository'`, `account_class = 'depository'` — i.e., it counts toward Banking's
`total_cash` KPI (`banking.routes.ts` filters `account_class = 'depository'`), mirroring how QBO
models a "Relay-Diesel Bank Account". The migration's own header comment flags this as an owner
decision point, not an assumption:

> "If the wallet must instead be a prepaid asset **separate** from operating cash, a follow-up
> migration extends the CHECK with a `'prepaid'` value + adjusts the cash KPI."

## 4. Owner questions (design-only — answer, don't code, until decided)

1. **Apply now?** Run all 3 HOLD-FOR-JORGE Relay migrations (`202607110000` → `202607280000` →
   `202607290000` → `202607470000`, in that order) on a Neon branch, verify, then prod? (This is the
   `buildable_action` already recorded in `#3115`'s adjudication — repeating it here only as the
   owner-facing checklist.)
2. **`account_class` for the wallet:** confirm `depository` (counts in `total_cash` KPI, matches QBO's
   own "Relay-Diesel Bank Account" treatment) — or require a `'prepaid'` CHECK-constraint value so the
   Relay float is tracked as a *separate* prepaid asset, excluded from the main cash KPI (parallel to
   how Factoring/Escrow virtual banks are already excluded from Form 425C lines 19-23 per the 425C
   invariant)? This is the only undecided design fork in the built-and-held migration set.
3. **Fuel→expense GL posting** — locked decisions note this as "the held follow-up" after CONN-3
   itself. Confirm this stays a separate, later, flag-gated block (not bundled into the CONN-3 Neon
   apply above)?

## 5. What this PR does NOT do

- Does not run any migration (BUILDER role — Neon-apply is owner-only per Rule 10/13).
- Does not modify `202607110000` / `202607280000` / `202607290000` / `202607470000` /
  `202607570000_relay_fuel_ingest_source_csv_import.sql`.
- Does not flip the `NEEDS-OWNER-ADJUDICATION-2026-07-21.json` verdict (`ACTION-ONLY` stands).
- Does not touch `#3123` / `#3124`.

No `package.json` / `.github/workflows/locked-guards.yml` / `ci.yml` edits (Rule 17). No new guards.
Docs-only. Unmerged (BUILDER — no merge, no Neon-apply).
