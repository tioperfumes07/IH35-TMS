---
name: ih35-parity-audit
description: >-
  How to run a parity / quality audit of an IH35-TMS module against best-in-class TMS+accounting standards
  (McLeod, QuickBooks, Alvys) — the two-layer sweep (a LIVE defect audit + a FRESH-research parity layer),
  the per-module verdict format (meets / gap→block / surpasses), and how to turn gaps into dispatch-ready
  blocks. Load this when asked to audit, review parity, "check against McLeod/Alvys", or assess whether a
  module is best-in-class. The bar is not "does it work" — it's "does it meet or surpass the reference."
---

# IH35-TMS — Parity / quality audit

The mandate is **reach or surpass McLeod / QuickBooks / Alvys-grade** quality — trust is the product. An audit
that only checks "does it run" misses the point. Every audit is **two layers**, and its output is **decision-shaping**
(gaps become blocks), not a vibe. Bundled: `resources/verdict-template.md`.

## The two layers (run BOTH — one without the other lies)
1. **LIVE defect audit** — exercise the REAL thing: authed UI in a real browser (attach-to-real-Chrome —
   Google blocks Playwright OAuth), real endpoints (API responses > screenshots), real data. Catch 500s,
   phantom-column errors, silent 400s, masked-empty results, broken flows. Verify, don't assume (see
   `ih35-guard-verification` — the false-empty rule applies hard here).
2. **FRESH-research parity layer** — for the module's domain, establish what best-in-class actually does
   TODAY (don't rely on memory of "how McLeod works" — research it fresh), then compare feature-by-feature.
   This is where "it works" ≠ "it's competitive" gets exposed.

**Neither alone is enough:** the defect audit says the code runs; the parity layer says whether running is
*enough*. A module can be bug-free and still a gap vs Alvys.

## Per-module verdict (the only three outcomes)
For each module/feature, assign exactly one:
- **MEETS** — at parity with the reference. Cite the specific capability that proves it.
- **GAP → BLOCK** — below the reference. Name the missing capability AND write it as a dispatch-ready block
  (phase+task id, scope, files, tier) so the gap is actionable, not a complaint.
- **SURPASSES** — beyond the reference (our TMS-specific edges: exact-cents money, per-field confidence,
  sha256 dup detection, full audit trail, entity-independence). Cite it — surpassing is a feature to protect.

## Grounding rules (so the audit is real, not theater)
- **Anchor to live truth.** Every "MEETS/SURPASSES" cites a real capability you exercised; every "GAP" cites
  what's missing against a researched reference. No verdict from assumption.
- **Respect the locks.** Parity gaps are ADDITIVE (§7 product locks) — never propose deleting/reordering
  existing modules to "match" a reference. Archive, never delete.
- **Financial gaps are design-docs, not solo builds.** A GAP in posting/GL/reconciliation becomes a design
  block for owner, never agent-built posting logic (§1.4).
- **No silent caps.** If the audit sampled (top-N modules, one flow per module), SAY so — a partial sweep
  presented as complete is exactly the false-"covered everything" the mandate forbids.

## Delivery
- One verdict per module (the template), ranked by severity of gap. Gaps → dispatch-ready blocks appended.
- Zip-per-module or a single ranked report, per what the owner asked. Lead with the structural finding
  (the real blocker, the biggest gap), not a tactical list.

---
Cross-refs: [[quality-trust-mandate]], [[ih35-guard-verification]] (verify-before-claiming underpins the defect
layer), [[lead-with-structural-not-dispatch]], [[recommendation-authority]]. The bar: meet or surpass the reference,
proven live — and turn every gap into an actionable block.
