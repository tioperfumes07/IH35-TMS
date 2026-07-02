# IH35-TMS — Accounting Architecture (CANONICAL, locked 2026-07-02)

> **Single source of truth for how accounting works. If any older doc (esp. the master blueprint
> §3.12 "QBO AUTO-SYNC + REPLAY") disagrees, THIS wins.** Aligned with
> `docs/lockdown/00_LOCKED_DECISIONS.md` §8. Purpose: stop agents from rebuilding a two-way QBO sync.

## The one-paragraph version
TMS and QuickBooks Online run as **two independent systems in parallel (double books)**. **QBO is the
system of record through 12/31/2025; TMS runs in parallel and is reconciled against it — TMS is NOT a
mirror of QBO.** We **clone QBO once** — all master data, AR, AP, and GL — into the TMS database, and after
that the QBO connection exists **only to reconcile and compare** (twice daily — the two Jorge-locked
scheduled passes in `TMS-QBO-RECONCILIATION.md` §2): flag anything added, voided, or changed in either
system. **There is NO write-back from TMS to QBO and NO two-way sync.** After the 12/31/2025 book-lock, TMS
becomes authoritative.

## Why (the decision)
Owner + CPA locked this to avoid the fragility and double-entry risk of a bidirectional sync. Running the
two books in parallel and reconciling is how a clean QBO→new-system conversion is actually done. It also
lets QuickBooks stay the CPA's system of record while the reconciliation is being proven, and it makes the
cutover a deliberate event, not a silent drift.

## The rules (enforcement status noted per rule — do not assume "enforced" without the citation)

1. **Clone-once, then reconcile-only.**
   - One-time full backfill: QBO **customers, vendors, invoices, payments, bills, bill-payments, and the
     GL** → TMS tables (store-once, exact integer cents, upsert-by-QBO-id, void-never-delete).
   - Ongoing: a **twice-daily reconciliation** compares cloned vs live QBO and flags divergences
     (present-in-one-only = added/deleted; field diffs = amount/date/status). That is the ONLY thing the
     live connection does after backfill.
   - Specs: `QBO-CLONE-PROGRAM.md` (master data + AR/AP, blocks MD-1…MD-RECON),
     `TMS-QBO-RECONCILIATION.md`, and the QBO-IMPORT GL program (IMPORT-0…4v2).

2. **No write-back to QBO** (the target state; enforcement is partial today — stated honestly below).
   - **JE path — ENFORCED (merged).** `QBO_JE_PUSH_ENABLED` (default OFF, **per-entity-only**) + a
     structural refusal of any journal entry whose `source_system != 'tms'`, on **both** push paths
     (immediate best-effort AND the every-minute queue-drain cron) via one shared gate
     (`apps/backend/src/accounting/qbo-je-push-gate.ts`; CI guard `verify-qbo-push-gates.mjs`). — IMPORT-P0
     (PR #1797, merged).
   - **Entity paths — NOT YET IN FORCE.** The six `T11.20.6.2` write-back handlers (customer / vendor /
     account / invoice / bill / item `tms.*.push_requested` → `push.service.ts`) are **default-ON via env
     var with NO origin guard today** (latent, not live — zero `tms.*.push_requested` rows exist yet).
     **IMPORT-P0b** closes this: flag `QBO_ENTITY_PUSH_ENABLED` (default OFF, per-entity-only) +
     clone-origin refusal on all six, mirroring IMPORT-P0. **Until IMPORT-P0b merges, this bullet is the
     intended state, not the current state** — do not cite it as enforced.
   - All **money-posting flags default OFF and are per-entity-only** (`POSTING_FLAG_KEYS`).

3. **Both accounting bases.**
   - Canonical imported ledger = **accrual** detail.
   - **Cash-basis is copied verbatim from QBO's own cash reports** — QBO computes it, TMS never re-derives
     cash during the QBO-SoR window. A native cash-conversion engine is a **post-cutover** block.

4. **Conversion + entities.**
   - Convert **01/01/2024** for **TRANSP** + **TRK**; opening position = **Balance Sheet as of
     12/31/2023 → Opening Balance Equity** (OBE is a temporary clearing account, expected ≈ 0; a
     permanent OBE balance is a defect → plan OBE→Retained-Earnings reclass).
   - **USMCA has no QuickBooks** → **TMS-authoritative from day one** (2026); never cloned/reconciled.
   - QBO realms: TRANSP `123145885549599`, TRK `1432746210`. Assert realm↔operating-company on the
     **unrevoked** connection only; never cross realms; per-entity RLS on every table.

5. **Factoring = secured borrowing (recourse), not a sale.** Faro today → RTS planned. Driver damage-claim
   escrow is a **liability** (held-in-trust). See `cpa-locked-decisions-2026-07-01`.

6. **Integrity invariants (every engine).** Exact cents (BigInt, never `parseFloat`); void-not-delete +
   audit; idempotent upsert by QBO id; unmatched account = abort (no guessed mapping); unbalanced = abort;
   tie out to the cent or fail loud; everything behind `QBO_HISTORICAL_IMPORT_ENABLED` (OFF),
   owner-triggered, build-and-hold, prove on a Neon branch with real pulls before any merge.

## What is RETIRED
The master blueprint §3.12 "QBO AUTO-SYNC + OFFLINE QUEUE / REPLAY" (WF-031 auto-sync on writes,
local-write-first-then-push, lockstep, replay-on-reconnect) is **superseded** and kept only for history.
Do not rebuild a two-way sync.

## Cutover
After 12/31/2025 book-lock: TMS becomes authoritative; period-lock + a final court/CPA-grade tieout
snapshot. Nothing locks/closes during the reconciliation window.

## Open owner decisions (not yet resolved — do not assume)
1. **`factoring_advance` JE push.** The `factoring_advance` outbound entity composes a QBO JournalEntry
   from `accounting.factoring_advances` (not `accounting.journal_entries`, so IMPORT-P0 does not gate it,
   and it is not an import-echo risk). Whether TMS→QBO factoring-advance JE sync should also be turned
   OFF under this no-write-back architecture is an **owner decision, still open**.
2. **Per-entity override policy during the import/parallel window.** The push flags are per-entity-only
   (`POSTING_FLAG_KEYS`); the standing recommendation is to keep every entity's outbound push **OFF** for
   the entire parallel window and only ever enable per-entity by explicit owner action. Formal policy not
   yet ratified.

---
*Cross-refs: `docs/lockdown/00_LOCKED_DECISIONS.md` §8 · `docs/specs/TMS-QBO-RECONCILIATION.md` ·
`docs/specs/QBO-CLONE-PROGRAM.md` · QBO-IMPORT program blocks · auto-memory
`qbo-import-design-corrections`, `cpa-locked-decisions-2026-07-01`, `driver-escrow-is-liability`.*
