---
name: ih35-code-review
description: >-
  How to adversarially code-review a PR or a batch of merged PRs in IH35-TMS — the layer that catches what a
  builder's own self-verification and the ~250 CI guards MISS: fake/cosmetic-only "fixes" that don't fix the
  defect, regressions, mis-scoped queries, cross-entity leaks, phantom schema, product-lock violations, and
  guards weakened to pass. Load this whenever asked to review code, "check this PR", gate a builder's PR before
  merge, or audit what merged. The bar is not "CI is green" — green is the floor; the review asks "does this
  actually fix the defect, and did it break anything?" Read-only: a reviewer reports findings, never edits.
---

# IH35-TMS — Adversarial code review

The single most expensive failure mode here is a change that **looks** done — a builder graded its own work,
CI went green — but the fix is cosmetic, the wiring points at a dead endpoint, or a query quietly broke the
non-buggy case. Static guards and a builder's self-report cannot catch these; a skeptical human-grade read of
the diff can. This skill is that read. **Trust is the product** — a review that only confirms "it runs" is
theater. Bundled cross-refs at the bottom.

## The one rule
**Assume every "fix" is fake until the diff proves otherwise.** Your job is to REFUTE the claim that the PR
fixes its stated defect without breaking anything — not to rubber-stamp it. Default to skeptical. When you
cannot confirm a concern is real from the actual code, mark it **UNVERIFIED — needs live check**, never assert
it (that is the §0 verify-everything law applied to review). Equally: if a PR is genuinely clean, **say so
plainly** — never manufacture findings to look productive. A false finding wastes the owner's trust as surely
as a missed bug.

## What a review is FOR (catch what CI + self-verify miss)
CI proves: it compiles, the guards pass, tests pass. A builder's self-report proves: it *believes* it read the
spec and fixed the defect. Neither proves the change is correct. The review targets the gap:

1. **Fake / cosmetic fix.** The highest-frequency defect. A palette/vocab/emoji change is real and verifiable.
   But a "wired the tab" whose endpoint still returns empty, a click-through with the WRONG route param, a
   "fixed the filter" that the component ignores, an added button that calls nothing — these pass CI and read as
   done. **Verify every wiring fix against the ACTUAL endpoint:** read the backend route, confirm the frontend
   calls it with correct params, confirm the response actually feeds the visible UI (not a second self-fetch
   that ignores the props). The dispatch/eld "date pickers never filtered the timeline" class of bug lives here.
2. **Regression on the non-buggy path.** Did removing a wrapper/border drop a needed prop or break layout? Did a
   changed query change results for inputs that were already correct? Did a backend scope change (e.g.
   `owner_company_id` → `owner_company_id OR currently_leased_to_company_id`) *over*-broaden and now leak, or
   break an index assumption? Read the BEFORE, not just the after.
3. **Phantom schema (§4).** Any new/changed identifier absent from `db/migrations/` 500s at runtime. Hot spots:
   `mdata.units` has **NO `operating_company_id`** (uses `owner_company_id`/`currently_leased_to_company_id`);
   `mdata.loads` has **NO `trailer_id`**; driver hazmat = `mdata.drivers.endorsement_h`; canonical is
   `maintenance.*` not `maint.*`, `mdata.vendors` not `mdata.qbo_vendors` for writes, `driver_finance.*` not
   `payroll.*`, `banking.*` not `bank.*`. Diff identifiers against migrations OR **prod** (prod wins, §0) — not
   memory. But don't cry wolf on a guarded `to_regclass`/`tableExists` fallback — that's defensive, not a bug.
4. **Product-lock violations (§7).** Any DELETE/reorder of an existing module/tab/column/route (additive-only —
   archive never delete); off-palette color (only `--green-pill` for the Class pill, only `--red #dc2626` for
   delete/Accident); `+ New`/`+ Add` vocab (must be `+ Create`/`+ Book`); emoji in headers/sidebar/tables; a
   second sidebar; middle-dot subtitle lists. These are locked; a violation is a finding even if it "looks fine".
5. **Entity scope / RLS leak.** A read of `accounting.*`/`catalogs.*`/`mdata.*` without `operating_company_id`
   scoping blends TRANSP/TRK/USMCA — masked today, breaks at USMCA launch. Flag any new cross-entity-capable
   query that isn't scoped.
6. **Financial boundary breach.** A PR labelled/treated "non-financial" that actually touches `accounting.*`
   write, posting/GL math, `catalogs.accounts`, a migration, or a money-control flag — that PR is financial
   (§1.4) and must NOT have self-merged. Flag it loudly; it should have been owner-gated.
7. **Guard integrity.** The subtle one: a guard whose baseline was **RAISED** (weakened to absorb a new
   violation) instead of lowered, or a guard edited to *pass* rather than to *enforce*, or a "fix" that deleted
   the failing assertion. A weakened guard is worse than the original bug — it hides all future regressions.
   Every ratchet must move the correct direction (tighter), and every bug fix must ADD or keep a guard, never
   remove one.

## Method (so the review is real, not a skim)
- **Sync first, then read the actual diff.** `git fetch origin && git checkout main && git pull --ff-only`
  (clean the tree if the post-merge hook dirtied `docs/schema-parity-baseline.json` first —
  `git checkout -- docs/schema-parity-baseline.json` — or the checkout aborts). Get each PR's diff via
  `gh pr diff <n>` or `git show <squash-sha>`; map PR→sha with `gh pr list --state merged --json number,mergeCommit`.
- **Read the surrounding code, not just the +/− lines.** A wiring fix is only correct relative to the endpoint
  it calls and the component that consumes it — open all three.
- **Re-run any 0/empty grep before it's a verdict** (RLS masks accounting/catalogs/mdata to 0; a masked error
  reads as "clean"). Never conclude "not present" from one empty search.
- **Prefer the endpoint/response over the screenshot.** API/JSON truth beats "it renders."
- **No silent scope caps.** If you reviewed 8 of 12 PRs or one flow per PR, SAY so — a partial review presented
  as complete is the exact false-"covered everything" the quality mandate forbids.

## When to GATE vs post-hoc review
- **Pre-merge gate (preferred for builder output):** review the builder's PR diff BEFORE it auto-merges. A
  CONFIRMED correctness/lock/leak finding blocks the merge until fixed. This is the cheap place to catch a fake
  fix — before it's live.
- **Post-hoc audit:** review a batch already on `main` (e.g. a session's merged PRs). CONFIRMED findings become
  immediate follow-up fix PRs. Use when work merged faster than it could be gated.
- Either way, financial/migration findings are **owner-gated** — a reviewer never builds the fix for posting/GL;
  it surfaces the finding for owner + the financial-migration flow.

## Output (decision-shaping, ranked, honest)
- A single ranked list, **most severe first.** Each finding: **PR#**, `file:line`, the defect in one sentence, a
  **concrete failure scenario** (specific inputs → wrong output/500/leak), and a verdict — **CONFIRMED** (proved
  from the code) or **PLAUSIBLE** (needs a live check to be certain). Category tag helps (fake-fix / regression /
  phantom-schema / lock / entity-leak / financial-boundary / guard-integrity).
- **Lead with the single most important structural finding** (the real blocker), not a tactical list of nits.
- If a PR is clean, list it as clean. **If NOTHING real is found across the whole scope, say that plainly.**
- When the host asks for the `ReportFindings` tool, use it (verified findings, ranked, empty array if none);
  otherwise a plain ranked list. Do not both call the tool and reprint the list as prose.

---
Cross-refs: [[quality-trust-mandate]], [[ih35-guard-verification]] (verify-before-claiming underpins every
finding), [[ih35-parity-audit]] (the "is it competitive" layer; this skill is the "is it correct" layer),
[[law-of-the-land-total-connectivity]] (a missing forward/reverse link is a finding), [[cross-entity-leak-audit-usmca]],
[[schema-write-integrity-audit]], [[paritytable-conversion-trips-static-guards]] (guards get UPDATED not weakened).
The bar: green CI is the floor, not the verdict — a change is correct only when the diff proves it fixes the
defect and breaks nothing. Prove it or mark it UNVERIFIED; never rubber-stamp, never manufacture.
