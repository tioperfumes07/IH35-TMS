# IH35-TMS — TMS ↔ QuickBooks Parallel Books (CANONICAL)

**Status:** CANONICAL · **Authority:** Owner ruling (Jorge, in writing) · 2026-07-11
**Controls over:** any earlier "system-of-record through 12/31/2025" or "cutover ceremony" framing.

This is the single, canonically-named entry point for how the TMS books relate to QuickBooks. It states
the locked shape in one place. The deeper mechanics live in the two references at the bottom; where an
older doc's wording disagrees with the owner ruling below, **the owner ruling wins** (see Drift note).

## The one-paragraph version

TMS and QuickBooks Online run as **two independent sets of books in parallel — indefinitely.** There is
**no fixed cutover date.** **QuickBooks is the source of truth.** TMS was seeded by a **one-time clone** of
QBO (master data, AR, AP, and GL) and thereafter the QBO connection exists **only to reconcile and
compare** — never to write back. Each system independently registers the same day-to-day activity (bank
feeds, expenses, bills, payments), and a **twice-daily reconciliation** flags every transaction whose
existence, amounts, dates, application, or categorization differs between the two books. That
reconciliation is the **continuous trust mechanism** — not a one-time event.

## The locked rules

1. **Parallel indefinitely — no cutover.** TMS + QBO run side by side with no scheduled date on which TMS
   "takes over." The earlier 12/31/2025 system-of-record / cutover-ceremony framing is **retired.**

2. **QuickBooks is the source of truth.** TMS is a parallel validation set of books, not a mirror and not
   an upstream. QBO remains authoritative for the financial record.

3. **Clone-once, then reconcile-only.** One-time full backfill of QBO customers, vendors, invoices,
   payments, bills, bill-payments, and the GL into TMS (store-once, exact integer cents, upsert-by-QBO-id,
   void-never-delete). After that, both systems keep running independently and are only **compared.**

4. **No write-back to QBO.** Nothing flows TMS → QBO. The JE push path and all six entity push handlers
   (customer / vendor / account / invoice / bill / item) sit behind **default-OFF, per-entity** kill-switch
   flags (`QBO_JE_PUSH_ENABLED`, `QBO_ENTITY_PUSH_ENABLED`) plus clone-origin refusal. No two-way sync.

5. **Twice-daily reconciliation is the trust mechanism.** A correctness test — row-level, not just
   count+sum — that proves TMS booked every financial event the same way QBO did, and surfaces any
   drift. Trust is established and maintained continuously by this pass, not by a cutover.

6. **All money-posting flags default OFF.** Every GL-posting path / money or GL feature flag ships OFF and
   per-entity. The coder/agent NEVER flips one on its own initiative (skill §1.4); flags stay OFF until the
   owner flips them.

7. **Enabling money-posting is the OWNER's SOLE decision.** Turning on any GL-posting path, flipping any
   money/GL flag, or declaring the system trustworthy is **decided by the owner alone — no external, CPA, or
   accountant sign-off is required, ever.** GUARD (and any verification agent) supplies technical-correctness
   proof (Neon-branch tie-out, 0-orphan FK checks, balanced-JE proof, migration VALIDATE) to **inform** the
   decision; that proof **never gates** it. See `docs/OWNER-RULING-flag-flips-sole-owner-decision-2026-07-11.md`.

## Drift note (reconciliation of docs)

`docs/specs/ACCOUNTING-ARCHITECTURE.md` still contains the earlier "QBO is system-of-record through
12/31/2025" + "cutover ceremony" language. Per the owner ruling of 2026-07-11 (an owner decision, which is
supreme over docs), that framing is **retired**: the model is parallel-indefinitely with no cutover. The
rest of `ACCOUNTING-ARCHITECTURE.md` (clone-once, reconcile-only, no write-back, flags-OFF, factoring =
secured borrowing, escrow = liability, integrity invariants) remains the detailed source of truth and is
consistent with this doc.

## Deeper references

- `docs/specs/ACCOUNTING-ARCHITECTURE.md` — detailed accounting source of truth (clone/reconcile rules,
  entities/realms, both accounting bases, integrity invariants, driver-pay/escrow engine).
- `docs/specs/TMS-QBO-RECONCILIATION.md` — the twice-daily reconciliation program (schedule, bank/AR/AP
  passes, row-level matching, exception handling).
- `docs/OWNER-RULING-flag-flips-sole-owner-decision-2026-07-11.md` — the controlling owner ruling on
  parallel-indefinitely + flag-flips as the owner's sole decision.
- `docs/lockdown/00_LOCKED_DECISIONS.md` §8 — the registered locked decision.
