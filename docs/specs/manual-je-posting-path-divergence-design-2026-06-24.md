# Manual Journal Entry — Posting-Path Divergence · DESIGN PROPOSAL (Tier-1)

**Date:** 2026-06-24 · **Status:** `[HOLD-FOR-JORGE — TIER 1]` (financial / posting) · **DESIGN-ONLY — NO code, NO migration, NO route change built until Jorge reviews + approves and GUARD verifies on a Neon branch. Never self-merge (§1.4/§2).**
Confirmed independently from source (route → service → table + CI guards + contract doc) — not relayed from a recon summary. Scope: **ONLY** the manual-JE banking-path divergence.

---

## 1. The finding — two manual-JE paths, only one moves the books

| | **A — Accounting path** | **B — Banking path (THE DEFECT)** |
|---|---|---|
| Endpoint | `POST /api/v1/accounting/journal-entries` | `POST /api/v1/banking/manual-je` |
| Service | `accounting/journal-entries.service.ts` `createJournalEntry()` | `banking/manual-je.routes.ts` (inline) |
| Writes | `accounting.journal_entries` + **`accounting.journal_entry_postings`** (`journal-entries.service.ts:113`) | `accounting.journal_entries` + **`accounting.journal_entry_lines`** (`manual-je.routes.ts:80`) + an `outbox.outbox_queue` event (`:107`) |
| Balance check | balanced + posting_batch / posted status (canonical) | **float dollars**: `Math.abs(totalDr - totalCr) > 0.0001` (`manual-je.routes.ts:60`); `dr_amount`/`cr_amount` stored as **dollars** (`:17-18`), **no balance trigger** |
| Read by TB / BS / P&L? | **YES** — statements read `journal_entry_postings` | **NO** — nothing reads `journal_entry_lines` for the GL |
| Net effect | **Moves the books ✓** | **Does NOT move the books ✗** |

A user who books a correcting journal entry through the Banking surface gets a success response, but the entry lands in a table the general ledger never reads. **The books are silently unchanged.**

### Evidence (from source)
- **CI guards forbid `accounting.journal_entry_lines`:** `scripts/verify-accounting-backbone-schema.mjs` and `scripts/verify-double-entry-balance-trigger.mjs` both fail on creating that table — "canonical lines table is `accounting.journal_entry_postings`." (They forbid CREATEing it; they do **not** yet catch a route that INSERTs into it — see §4.)
- **Contract decision:** `docs/accounting/JE_LINE_CONTRACT_DECISION.md` — `journal_entry_lines` is "NOT FOUND IN REPO"; a parallel lines table would cause "dual-write / dual-read drift."
- **The banking route writes it anyway:** `apps/backend/src/banking/manual-je.routes.ts:80` `INSERT INTO accounting.journal_entry_lines (...)`.

**Severity: HIGH** money-integrity — same class as the cash/fuel-advance loss. For a Ch.11 DIP entity, a correcting JE that silently doesn't post is an audit-grade hole.

---

## 2. The one open question — settle it LIVE on Neon (read-only), don't assume

Path B also emits an `outbox.outbox_queue` event (`manual-je.routes.ts:107`). **If** a posting consumer reads that event and materializes `journal_entry_postings`, the books move asynchronously and the severity drops. A source search found **no such consumer**, and the table being both forbidden and unread argues strongly against one — but this must be settled with a live read, not an assumption.

**Read-only Neon proof plan (GUARD runs/verifies):**
1. On a Neon **branch** (never prod), `POST /api/v1/banking/manual-je` a small balanced test JE.
2. Query: does it appear in `accounting.journal_entry_postings` **and** the trial balance? Or only in `accounting.journal_entry_lines`?
3. Also drain/inspect the outbox: is the emitted event consumed by any handler that writes `journal_entry_postings`?
- **If only in `journal_entry_lines`** → DEFECT CONFIRMED LIVE (orphan write; books not moved). Proceed with §3.
- **If it shows in `journal_entry_postings`** → a consumer exists → **downgrade** to "non-canonical write path, reconcile naming," not "books not moved." Re-scope accordingly.

---

## 3. Proposed fix (Jorge decides — build nothing yet)

**RECOMMENDED: re-route `POST /api/v1/banking/manual-je` through the SAME `createJournalEntry()` service the accounting path uses** — so every manual JE, regardless of entry surface, posts to `accounting.journal_entry_postings`, balance-checked, with posting_batch status. This is the QuickBooks/NetSuite standard: one canonical posting path, single source of truth.

Why this shape:
- Removes the forbidden `journal_entry_lines` write (satisfies the existing CI guards).
- One canonical ledger path — no dual-write/dual-read drift.
- Reuses existing balance enforcement + cents handling — **no new GL math**.
- Behavior-correctness fix, not a new module. Additive: re-point the write target; do not delete the route.

**Open sub-questions for Jorge (the doc lays them out; nothing built until answered):**
- **(a) Field parity.** Does the Banking manual-JE UI send any field `createJournalEntry()` doesn't already accept (e.g. a banking memo, a source-account tag)? If yes — **extend the one service's input**, do not fork a second writer. (Needs a field-by-field diff of the banking route body vs the accounting service input.)
- **(b) Backfill.** Are there existing rows already written to `accounting.journal_entry_lines` that need a one-time backfill into `journal_entry_postings` (so historical manual JEs actually hit the GL)? This is migration-class + financial → gated; the doc scopes it, nothing runs without Jorge + GUARD. (Live count of `journal_entry_lines` rows needed first.)
- **(c) Outbox event.** Keep the emitted event (if other consumers depend on it) or retire it? **Trace consumers first** — do not delete it blind.

---

## 4. Recurrence guard (every fix ships a CI guard)

Today the forbidden-table guards only fail on **CREATEing** `accounting.journal_entry_lines` (a migration scan). The banking route **INSERTs into** it and is **not caught**. Extend the guard to also scan **route/service `.ts` files** and **FAIL on any `INSERT INTO accounting.journal_entry_lines`** (or any non-canonical JE-lines table) outside an allowlisted migration.

**Red→green proof:**
- **RED:** run the extended guard against the current `banking/manual-je.routes.ts:80` → it fails on the `INSERT INTO accounting.journal_entry_lines`.
- **GREEN:** after the re-route (the route calls `createJournalEntry()`, no lines-table write) → the guard passes.
This locks the single-canonical-path invariant so a second writer can't reappear.

---

## 5. Tier-1 ceremony (mandatory, no deviation)
DESIGN DOC (this) → **Jorge reviews + answers 3(a–c)** → coder produces the re-route + the guard as a **SHOW-FIRST** reviewable diff (full code/SQL shown) → runs on a **Neon branch** → **Jorge STOPS**; GUARD independently verifies on Neon (a JE via `/api/v1/banking/manual-je` now lands in `journal_entry_postings` + the trial balance, balanced; the new guard bites) → Jorge gives explicit **"OK to merge"** → merge → GUARD prod-verify. **Never self-merge.** Label `[HOLD-FOR-JORGE]`; only `JORGE-APPROVED` unlocks.

---

## 6. Scope guard
Covers **only** the manual-JE banking-path divergence. Do not bundle other findings. **Additive-only:** re-point the write target; do **not** delete the banking route or the outbox event without tracing consumers; archive nothing silently.

---

### Appendix — file references (for the Neon trace)
- B path: `apps/backend/src/banking/manual-je.routes.ts` — float balance `:60`, `INSERT INTO accounting.journal_entry_lines :80`, outbox `:107`
- A path: `apps/backend/src/accounting/journal-entries.service.ts` — `INSERT INTO accounting.journal_entry_postings :113`
- Guards: `scripts/verify-accounting-backbone-schema.mjs`, `scripts/verify-double-entry-balance-trigger.mjs`
- Contract: `docs/accounting/JE_LINE_CONTRACT_DECISION.md`
