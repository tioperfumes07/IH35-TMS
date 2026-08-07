# LOAD-LINKAGE — OWNER SCOPE RULING (canonical, overrides code-reads)
**Date: 2026-08-04 · Owner-ruled · GUARD-verified live on prod (br-fancy-credit-akjnd07a) this date.**
**Effect: STOP all work that tries to backfill, infer, or "repair" load↔expense/fuel linkage on historical data. It is not a defect. Do not spend coder time on it.**

---

## The ruling (read this first)
There is **no load↔expense/fuel linkage today because the TMS is not yet dispatching loads.** The historical
transactions in the system are **QuickBooks-imported bookkeeping data that we are *categorizing*** — they were never
dispatched through this TMS, so there is **no TMS load to link them to.** A load FK on these rows would have to be
**invented**, and inventing financial linkage is a direct violation of the hardline rule (never guess, never fabricate).

Load linkage is a **going-forward capability.** It begins producing links the moment we dispatch loads *inside the TMS*
and categorize new fuel/expenses against them. The resolver and the FK plumbing are **already built and correct** —
they simply have nothing to resolve yet. An empty result here is the **honest, expected state**, not a broken wire.

**This is the McLeod/Alvys reality, stated honestly:** cost-per-mile, load margin, and per-load driver accountability
**cannot be computed until loads exist in dispatch.** That is a *sequencing* fact about where the company is in
standing up the TMS — not a code gap to fix. We will meet that bar the normal way: dispatch loads in the TMS → new
costs attach to them → the metrics light up. We do **not** manufacture it retroactively on imported books.

---

## Evidence (verified live on prod, 2026-08-04 — facts win)
- **Every canonical load / attribution table is empty** (wiring present, zero rows):
  `dispatch.load_eta_predictions`, `dispatch.load_templates`, `dispatch.load_assignment_history`,
  `dispatch.load_cancellations`, `dispatch.load_abandonments`, `expense_attribution.expense_load_links` (0),
  `expense_attribution.expense_seq_per_load` (0), `accounting.line_category_load_required` (0),
  `accounting.load_revenue_recognition_postings` (0).
- **`fuel.fuel_transactions`:** 1,548 rows — **all 1,548 have `load_id = NULL`** — `purchased_at` spans
  **2026-03-03 → 2026-08-03 (5 months).** These are the imported/categorization rows.
- The fuel schema already carries **`load_required` (bool)** and **`load_exemption_reason` (text)** — the product was
  designed to *record* a legitimate no-load state. We will use that mechanism instead of leaving phantom nulls.
- **Claude Coder was right** to refuse to populate the FKs ("nothing in the data says which load a purchase belongs
  to, so any value would be invented"). The resolver logic it read is **sound**. Confirmed.

*(Note on counts: an earlier report cited "mdata.loads = 4 rows." `mdata.loads` is a **RETIRE table** under Linkage
Law §10 — it is not the canonical source and its contents are not authoritative. The canonical `dispatch.*` /
`expense_attribution.*` tables are the ones that are empty. Either way the conclusion is identical: no dispatched
loads exist yet.)*

---

## What this means for the wave queue — reclassify, don't "fix"

### → CASCADE (auditor — reclassify the card, do not leave it as an OPEN FAIL)
`CLS-LINKAGE-ONEWAY` (and any card that flags "1,548 fuel rows have no load" / "expenses have zero load linkage")
is **RECLASSIFIED**: it is **NOT a broken-wiring FAIL.** Split it exactly like `CLS-ECON-EMPTY` was split:
- **(a) wiring-exists / correctly-empty** → the FK columns, the resolver, the `expense_load_links` link table, and the
  `load_required`/`load_exemption_reason` fields all exist and are correct. **Mark this half N/A-PRE-OPERATIONAL**
  (empty because zero loads are dispatched — expected, not a defect). Cite this ruling as the evidence line.
- **(b) going-forward guard** → the only actionable work is a guard that proves **new TMS-native loads link
  correctly** (see Claude Coder below). Scope it to TMS-native records; it must **never** flag historical
  QBO-origin rows as offenders.
Do **not** count this against any module's completion, and do **not** hold the 8-module push on it.

### → CLAUDE CODER (money lane — the only real, small piece of work here)
Two honest, additive, reversible tasks — **no FK invention, ever:**
1. **Record the legitimate no-load state on the historical cohort** so the books say the truth instead of leaving
   1,548 phantom nulls that a naive guard reads as "1,548 broken links forever." Additive/idempotent/entity-scoped
   backfill on the imported cohort (`load_id IS NULL` **and** the row predates TMS dispatch / is QBO-import origin):
   set **`load_required = false`** and **`load_exemption_reason = 'PRE_TMS_DISPATCH_IMPORT'`**. This is traceable,
   reversible, and matches the "no silent nulls / traceable numbers" bar. **Owner picks the exact reason label and the
   cutoff predicate** — default proposed above; apply unless the owner says otherwise.
2. **Going-forward linkage guard:** prove that when a load IS dispatched in the TMS and a fuel/expense is categorized
   against it, `load_id` (and `expense_load_links`) populate correctly, entity-scoped, both ways. Guard scoped to
   **TMS-native** records only — historical exempt rows are out of scope by construction.
**Do NOT** run the old idea of "resolve the 1,548." There is nothing to resolve. Move on to the next money card.

### → CURSOR (frontend)
No load-linkage work. When a fuel/expense row is exempt (`load_required = false`), the UI shows the honest state
(e.g. "No load — pre-dispatch import") rather than an empty/error "missing load" affordance. Cosmetic, low priority,
after your current waves.

---

## The one-line law (paste into the always-read set)
> **Historical/QBO-imported fuel & expenses are legitimately load-null because the TMS has not dispatched loads yet.
> Load linkage is going-forward only. NEVER invent a load FK. Mark the historical cohort exempt
> (`load_required=false`, `load_exemption_reason`), guard that *new* TMS-native loads link — nothing more.**
