# B9 — Bank Register + Inline Edit — Design (read/grid + gated write)

**Status:** Design / Docs only. No posting, no migration. The **write/inline-commit is financial /
Tier-1 — OUT OF SCOPE here**, designed as gated. BUILD-AND-HOLD; Jorge merges.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Grounding:** **LIVE-CAPTURED** from QBO (IH 35 Transportation LLC, 2026-06-28) — reached via Chart of
Accounts → row **View register**. Screenshots local-only (real data), not committed.
**Parent:** `QBO_PARITY_UI_SYSTEM.md` §B9; this is the CA-05 account-register target.

---

## 0. What B9 is
The QBO-parity **bank register**: a **running-balance grid** per bank/CC account (NOT a plain list).
Reads existing posting data; supports **inline edit** of register rows and an inline **new-row** add.
The TMS CA-05 account register must mirror this running-balance register.

## 1. Live-captured chrome (2026-06-28)
- **Reached via:** CoA list → bank row **View register** → `/app/register?accountId=<id>`.
- **Columns (live):** Date · Ref No. · Payee · (transaction-type sub-row under payee) · Account ·
  Payment · Deposit · **running BALANCE** · (reconcile-status). Rows show the posted txns newest-first
  (date/reconcile sort).
- **Inline new-row (live "Add check ▾"):** Date · Ref No. · **Payee (+▾, with "+ Add new")** ·
  **Class (▾)** · Payment · Deposit · **Account (▾)** · **Location (▾)** · **Add Attachment** ·
  **Cancel · Save**. The new-row appears at the top of the grid body.
- **Pager (live):** `Go to [page] of 28 · First · Prev · 1-100 of 2790 · Next · Last` (per-page 100).
- **Top controls:** "Add check ▾" (transaction-type picker for the new row) · Filter · gear (columns) ·
  Print · Sort.

## 2. TMS implementation — READ/GRID (in scope, non-posting)
- Render the running-balance register from existing posting read services (the same dataset the posting
  engine uses — per B5 dual-dataset fix, point at the QBO-mirror/canonical accounts, RLS-scoped).
- **Running balance** computed server-side per account in date+sequence order; the grid displays it.
- Shared A1 table grammar: gear column-toggle + density, filter row, pager (per-page configurable,
  default 100 to mirror QBO), print/export.
- Columns mirror §1. "R"/reconcile-status badge shown read-only.
- Empty/honest state when an account has no postings.

## 3. Inline edit + new-row — WRITE (OUT OF SCOPE / Tier-1 GATED)
- The edit/commit path **posts/edits GL** → financial cluster, Tier-1, **gated** behind a flag
  (`BANK_REGISTER_INLINE_EDIT_ENABLED`, default OFF). With OFF: the grid is **read-only** (inline edit
  affordances disabled or preview-only); no writes.
- When designed/built later (separate authorized PR):
  - Editing a row re-points/updates the underlying posting; a **preview** shows the before→after.
  - **Period-lock:** no edit into a closed period (reuse period-close guard; fail-loud).
  - **`audit.row_changes`** written per edited row (who/when/from→to).
  - Editing a **reconciled (R)** row shows the "may affect a completed reconciliation" warning (QBO
    parity) and requires confirmation.
  - New-row add posts a new transaction via the existing posting engine (balanced or fail).
- Per-entity (`operating_company_id`), RLS-enforced; no cross-entity register edits.

## 4. Acceptance
Grid mirrors the live running-balance register (§1); read path uses existing posting reads, RLS-scoped;
inline-edit/new-row write path designed as **gated/Tier-1 OUT-OF-SCOPE** with period-lock +
`audit.row_changes` + reconciled-row warning; per-entity; grounded in the live capture (not memory).

## 5. DO NOT
- DO NOT build the inline-edit/new-row WRITE without Jorge's explicit OK (Tier-1 financial).
- DO NOT edit into a closed period; DO NOT skip `audit.row_changes` on edits.
- DO NOT point the register at the local-only seed dataset — use the canonical/QBO-mirror accounts (B5).
- DO NOT commit the source screenshots (real financial data — local-only, gitignored).
