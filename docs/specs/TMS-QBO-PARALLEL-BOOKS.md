# IH35-TMS — TMS ↔ QuickBooks Parallel Books (CANONICAL)

**Status:** CANONICAL · **Authority:** Owner + CPA locked decisions · updated 2026-07-19 (three-layer SoR model)
**Controls over:** any earlier framing that **retires** the historical 12/31/2025 authority boundary, or that
treats QBO as the **indefinite sole** system of truth in a way that erases TMS ledger authority from
2026-01-01. Does **not** erase the historical SoR dates, the Ch.11 operating/GL line, or the dual-run
validation mode — all three layers remain locked.

This is the single, canonically-named entry point for how the TMS books relate to QuickBooks. It states
the locked shape in one place. The deeper mechanics live in the references at the bottom; where an older
doc’s wording disagrees with the **three-layer model** below, **the three-layer model wins**.

## The three-layer model (LOCKED — do not collapse)

| Layer | Locked meaning | Dates / controls |
|------|----------------|------------------|
| **1. Historical transaction authority** | QBO is authoritative for the transaction record through **12/31/2025**. **TMS ledger authority begins 2026-01-01.** | Primary agent-loaded SoR control |
| **2. Ch.11 operating / GL cutover** | Opening balances as-of **03/31/2026**; live operating line from **04/01/2026** | **ASC 470-60 debt restructuring — NOT ASC 852 fresh-start accounting** |
| **3. Ongoing validation mode** | QBO remains **actively maintained** as the comparison / filing book; TMS runs **independently**; **reconcile-only**; **never** TMS→QBO write-back | **IMPORT-P0** / **IMPORT-P0b** → `QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED` **default OFF** |

These layers are additive and concurrent. Layer 3 (dual-run validation) does **not** retire Layer 1’s
historical authority dates. Layer 2 is the internal operating/GL line and does **not** authorize write-back.

## The one-paragraph version

TMS and QuickBooks Online run as **two independent sets of books in parallel** under the three-layer model
above. TMS was seeded by a **one-time clone** of QBO (master data, AR, AP, and GL). Thereafter the QBO
connection exists **only to reconcile and compare** — never to write back. During ongoing validation, QBO
remains **actively maintained** as the comparison/filing book while TMS registers activity independently.
A **twice-daily reconciliation** flags every transaction whose existence, amounts, dates, application, or
categorization differs between the two books. That reconciliation is the **continuous trust mechanism**.

## The locked rules

1. **Three-layer authority — historical SoR dates are NOT retired.** **QBO is system-of-record through
   12/31/2025.** **TMS ledger authority begins 2026-01-01.** Any wording that says this 12/31/2025 boundary
   is “retired,” or that QBO is the **indefinite sole** system of truth in a way that erases TMS’s 2026-01-01
   ledger authority, is a **defect**. Ongoing dual-run validation (Layer 3) continues after those dates; it
   does not collapse Layer 1.

2. **Ongoing validation mode — QBO as comparison/filing book, not sole indefinite SoT.** During dual-run
   validation, QBO remains **actively maintained** as the parallel comparison / filing book. TMS is an
   independent ledger under Layer 1’s TMS authority start. QBO is **not** “the sole source of truth forever”;
   it is the maintained comparison/filing book while reconcile-only trust is earned. See Layers 1–3 above.

3. **Clone-once, then reconcile-only.** One-time full backfill of QBO customers, vendors, invoices,
   payments, bills, bill-payments, and the GL into TMS (store-once, exact integer cents, upsert-by-QBO-id,
   void-never-delete). After that, both systems keep running independently and are only **compared.**

4. **No write-back to QBO.** Nothing flows TMS → QBO. The JE push path and all six entity push handlers
   (customer / vendor / account / invoice / bill / item) sit behind **default-OFF, per-entity** kill-switch
   flags (**IMPORT-P0** / **IMPORT-P0b** → `QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED`) plus
   clone-origin refusal. No two-way sync.

5. **Twice-daily reconciliation is the trust mechanism.** A correctness test — row-level, not just
   count+sum — that proves TMS booked every financial event the same way QBO did, and surfaces any
   drift. Trust is established and maintained continuously by this pass.

6. **All money-posting flags default OFF.** Every GL-posting path / money or GL feature flag ships OFF and
   per-entity. The coder/agent NEVER flips one on its own initiative (skill §1.4); flags stay OFF until the
   owner flips them.

7. **Enabling money-posting is the OWNER's SOLE decision.** Turning on any GL-posting path, flipping any
   money/GL flag, or declaring the system trustworthy is **decided by the owner alone — no external, CPA, or
   accountant sign-off is required, ever.** GUARD (and any verification agent) supplies technical-correctness
   proof (Neon-branch tie-out, 0-orphan FK checks, balanced-JE proof, migration VALIDATE) to **inform** the
   decision; that proof **never gates** it. See `docs/OWNER-RULING-flag-flips-sole-owner-decision-2026-07-11.md`.

8. **Ch.11 operating / GL cutover (Layer 2).** Opening balances as-of **03/31/2026**; TMS live operating
   line from **04/01/2026** under **ASC 470-60 debt restructuring — NOT ASC 852 fresh-start accounting**.
   This layer does not erase Layer 1 and does not authorize TMS→QBO write-back.

## Drift note (reconciliation of docs)

Older PARALLEL-BOOKS wording (2026-07-11) that declared the 12/31/2025 SoR framing **retired** and named
QBO the indefinite sole source of truth is **superseded by this three-layer model** (owner/CPA release
correction 2026-07-19). `docs/specs/ACCOUNTING-ARCHITECTURE.md` and
`.claude/skills/ih35-accounting-decisions/` must state the same three layers. Ceremony language for
**QBO-PUSH** flips (event-gated, to-the-cent tieout) remains valid for kill-switch flips — it does **not**
retire Layer 1’s historical transaction authority dates. Clone-once, reconcile-only, no write-back,
flags-OFF, factoring = secured borrowing, and escrow = liability remain locked.

## CPA Answers Integration — Phase 1 (owner/CPA verified, 2026-07-18)

Governance-only lock (no executable posting/migration in this phase). Full narrative:
`docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` (2026-07-18 CPA Answers section) and
`.claude/skills/ih35-accounting-decisions/`.

0. **Three-layer SoR model (same as above):** (1) historical transaction authority — QBO through
   **12/31/2025**, TMS ledger authority from **2026-01-01**; (2) Ch.11 operating/GL cutover — OB
   **03/31/2026**, live line **04/01/2026**, ASC 470-60 not ASC 852; (3) ongoing validation — QBO actively
   maintained as comparison/filing book, TMS independent, reconcile-only, never TMS→QBO write-back,
   **IMPORT-P0** / **IMPORT-P0b** default OFF.

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
- `docs/OWNER-RULING-flag-flips-sole-owner-decision-2026-07-11.md` — owner ruling on flag-flips as the
  owner's sole decision (money/GL flips); does not retire Layer 1 historical SoR dates.
- `docs/lockdown/00_LOCKED_DECISIONS.md` §8 — the registered locked decision.
- `.claude/skills/ih35-accounting-decisions/SKILL.md` — locked CPA decision skill + reference card.
