FINDING: tip verify-purge-window-exemption + verify-purge-window-state FAIL after 443.292-F2 (17→18)

LANE: NON-FINANCIAL

ROOT CAUSE: 443.292-F2 restored verify-no-empty-zero-settlement live purge helpers but left PURGE_WINDOW_GUARDS / exemption / state at 17 arms. Tip money-pr-local-gate then also failed verify-no-stale-literals because STALE-LITERAL-OK sat three lines above the `!== 18` assert.

FIX: Re-allowlist verify-no-empty-zero-settlement (17→18) in purge-window.mjs + verify-purge-window-exemption.mjs + verify-purge-window-state.mjs LIVE_ARMS; place STALE-LITERAL-OK on the line immediately above the count assert.

NOTE: REG-98 FactoringHomeBoard fmtMoneyDollars string coerce + True-cost factor_fee_total fallback already on origin/main (706a33a4b6). Dirty #27419 is CONFLICTING leftover — close after this tip ship.

GUARD: verify-purge-window-exemption.mjs; verify-purge-window-state.mjs; verify-no-stale-literals-in-guards.mjs

LIVE PROOF: CODE-COMPLETE — three guards exit 0 locally (no Chrome per ROUND 443.297).

REMAINING: close #27419; CODE 443.293-A statement 8-section

Files Modified: scripts/lib/purge-window.mjs, scripts/verify-purge-window-exemption.mjs, scripts/verify-purge-window-state.mjs, docs/bus/_pr-bodies/443297-reg98-factoring-kpi.md
