## ROUND 7 — CC-2 verify results (2026-11-02, deadline 2026-11-03T02:00Z)

### BANK-TIEOUT-01 — tieout structural fix + live measurement

Scripts/tieout/bank-ledger-closing.mjs had stale EXPECTED: count=5 (actual 9 active USMCA accounts), include_faro_1296=true (1296 never existed in live). Script exited early on Faro structural check before reaching variance analysis.
