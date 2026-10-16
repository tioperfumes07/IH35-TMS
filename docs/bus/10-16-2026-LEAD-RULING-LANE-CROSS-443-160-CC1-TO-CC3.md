# LEAD ruling — lane cross: 443.160 / 443.156 moved from CC-1 to CC-3 (2026-10-16)

Source (Lead channel, LEAD-TO-SEATS, ROUND 443.167, 10-16-2026):

> ROUND 443.167 — CC-1 — SETTLEMENTS 5839–5842 + THE SEED'S PER-LOAD PRE-SETTLEMENTS (money > UI: this goes BEFORE
> 443.156/160; those move to CC-3)

and the Lead queue line to CC-3 (same day): "LEAD QUEUE: take over 443.160 and 443.156 from CC-1".

Scope of the cross (443.160 "one function, one component, one catalog source"): the CC-1-owned picker / catalog guards
and the new 443.160 verify-steps —

- scripts/verify-steps/18477-verify-one-picker-per-catalog.mjs + 18477-catalog-sources.baseline.json
- scripts/verify-steps/18481-verify-one-writer-per-document.mjs + 18481-document-writers.baseline.json
- scripts/verify-class-picker-limit-respects-backend-cap.mjs (repointed to the one class source)
- scripts/verify-coa-roles-accounts-picker-entity-scoped.mjs (repointed to the one chart-of-accounts source)
- scripts/verify-transaction-linkage-law.mjs (TABLE_REGISTRY row for accounting.factoring_misdirected_payment_alerts — the
  main red from #26811, CC-3's own 443.168 K table)

No CC-1 money writer is changed by the cross; document writers are only pinned (shrink-only), not rewritten.
