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

## CPA Answers Integration — Phase 1 (owner/CPA verified, 2026-07-18)

Governance-only lock (no executable posting/migration in this phase). Full narrative:
`docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` (2026-07-18 CPA Answers section) and
`.claude/skills/ih35-cpa-accounting-decisions/`.

1. **Revenue recognition (TMS ACCRUAL)** = **canonical load delivery**, defined operationally as **final
   active delivery stop completion / actual departure** (source evidence). A load-level `delivered_at` may
   be used only when the implementation proves it is derived from that same event. POD approval and invoice
   creation are **billing/factoring readiness** only — they do **not** move recognition. Stale invoice-create
   recognition wording in canonical decision docs is a defect (guarded).

2. **Dual-basis crosswalk:** QBO **cash-basis** reporting/mirroring remains unchanged during the QBO-SoR
   window; delivery recognition does **not** redefine cash recognition.

3. **Ch.11 operating cutover line (ASC 470-60 debt restructuring — NOT ASC 852 fresh-start accounting):**
   opening balances as-of **03/31/2026**; TMS live parallel posting from **04/01/2026** (per entity after
   opening tie-out). Dates preserved; ASC 852 fresh-start accounting is rejected.

4. **Factoring (Faro)** = secured borrowing / recourse (substance-over-form — not a sale of receivables).
   Sanitized commercial terms: revolving limit **$1,000,000**; Tier 1 fee **1.5% of Net at funding**; Tier 2
   fee **2% of Net at funding**; reserve **1.5%**; **Purchase Price = Net − Fee − Reserve**; **proceeds =
   Purchase Price − transaction/wire fees**; term **30 days** + grace **5 days**; repurchase deadline
   **95 days**; default interest **0.067% per day, compounded daily, beginning after day 35**. **A/R remains
   on IH35 books as pledged collateral**; funding credits **Factoring Advance** — **no A/R derecognition**.
   Actual factor statements remain authoritative. Decision docs must not include names, signatures,
   addresses, emails, personal-guaranty text, or executed-agreement text.

5. **CoA structure (additive only — never delete/rename existing accounts):**
   - **Sales of Service** children: Line Haul; Fuel Surcharge; Accessorial Revenue (Detention, Layover,
     Lumper, TONU, Other).
   - **Interest & Financing Expense** children: Factoring Fees; Factoring Default Interest; Factoring
     Transaction/Wire Fees.
   - Add **Driver Damage Loss**.

6. **Entity books:** each legal entity keeps **separate entity books** with **reciprocal intercompany
   monitoring**. Existing **read-only consolidated reporting** is retained **additively** for future
   reporting needs — not as a substitute for entity books.

7. **Verified CoA export facts** (owner-local verification snapshot for governance): **1,368** rows
   (TRANSP **387**, TRK **947**, USMCA **34**); **1,294** QBO-connected; **1,198** active; no duplicate
   entity/account-number pairs; **zero** opening balances in the export.

## Deeper references

- `docs/specs/ACCOUNTING-ARCHITECTURE.md` — detailed accounting source of truth (clone/reconcile rules,
  entities/realms, both accounting bases, integrity invariants, driver-pay/escrow engine).
- `docs/specs/TMS-QBO-RECONCILIATION.md` — the twice-daily reconciliation program (schedule, bank/AR/AP
  passes, row-level matching, exception handling).
- `docs/OWNER-RULING-flag-flips-sole-owner-decision-2026-07-11.md` — the controlling owner ruling on
  parallel-indefinitely + flag-flips as the owner's sole decision.
- `docs/lockdown/00_LOCKED_DECISIONS.md` §8 — the registered locked decision.
- `.claude/skills/ih35-cpa-accounting-decisions/SKILL.md` — locked CPA decision skill + reference card.
