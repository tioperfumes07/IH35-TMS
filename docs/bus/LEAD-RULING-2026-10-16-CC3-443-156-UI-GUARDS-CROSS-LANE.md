# LEAD-RULING-2026-10-16-CC3-443-156-UI-GUARDS-CROSS-LANE

## Lane-cross record for CC-3 touching CC-1's `scripts/verify-*.mjs` / `scripts/verify-steps/*` lane in 443.156

This file records the Lead's own written assignments. It does not add any authority of its own. Every quote is verbatim from `~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md`.

**1. The round moved to CC-3.** LEAD-TO-SEATS line 2679 reads:

> "ROUND 443.167 — CC-1 — SETTLEMENTS 5839–5842 + THE SEED'S PER-LOAD PRE-SETTLEMENTS (money > UI: this goes BEFORE 443.156/160; those move to CC-3)"

**2. The round orders the guards** (ROUND 443.156 box, `~/Downloads/10-16-2026-CC1-Banking-And-Tables-UI-QBO-Parity.md`):

> "Frontend AND backend `npm run -s build` + guard suite; guard RED on pre-fix tree then GREEN."
> "1. B2 MULTI-SELECT EVERYWHERE … Guard: a single-select filter over a set fails the build (allowlist shrink-only)."
> "5. B10 QBO FORMATS APP-WIDE … One formatter module; guard against ad-hoc toLocaleString/date formatting in pages (allowlist shrink-only)."

The verify-step numbers 18485 and 18489 were claimed on main by #26822 and restored by #26823.

**3. Main-red table classification has precedent.** LEAD-TO-SEATS line 2194 reads:

> "## LEAD → CC-3 | 443.126 (18:55 UTC) — classify fuel.fuel_receipt_postings in TABLE_REGISTRY (main red) by 19:30"

`accounting.factoring_misdirected_payment_alerts` came from CC-3's own 443.168 K (#26811). It is unclassified in `scripts/verify-transaction-linkage-law.mjs` TABLE_REGISTRY, which blocks every seat's pre-push gate. This PR classifies it OUT_OF_SCOPE, alongside its sibling `accounting.factoring_repurchase_due_events`.

## Scope of the cross

- **New:** `scripts/verify-steps/18485-verify-banking-tables-ui-qbo-parity.mjs` + `18485-single-select-set-filters.allowlist.json`.
- **New:** `scripts/verify-steps/18489-verify-qbo-formats-one-formatter.mjs` + `18489-adhoc-format-sites.allowlist.json`.
- **Edited:** `scripts/verify-tables-and-tab-bars-follow-the-window.mjs`, two regexes. Item 3 ("no truncated money") changes the rule it pins: text columns are still shares of the table, and money / number columns keep pixel width.
- **Edited:** `scripts/verify-transaction-linkage-law.mjs`, one TABLE_REGISTRY line (the item 3 main red above).
