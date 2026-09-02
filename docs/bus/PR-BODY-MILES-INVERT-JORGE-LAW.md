FINDING: MILES-INVERT-01
LANE: NON-FINANCIAL

SOURCE-OF-TRUTH: Jorge owner ruling 2026-09-02 — supersedes interim "pay practical+empty" advice
I QUERIED:       Prior MILES-INVERT-01 doc + all INBOX fan-out files
NOT CHECKED:     Live Neon re-query (stats unchanged from prior settlement)

ROOT CAUSE: Unchanged — ingest 1:1, dual semantics on short_miles column. Jorge law now locks pay basis = short miles always; STOP catalog short auto-fill until data remediated.

FIX: Patched canonical doc + INBOX-CC-1/CC-2/CURSOR/CODEX + GO-27 + OUTBOX with Jorge law. Struck "until resolved pay practical+empty". Remediation options now restore short = shortest (PC*MILER / re-key / quarantine).

DOD-A: N/A
DOD-B: N/A
DOD-C: N/A
DOD-D: N/A
DOD-E: N/A
VERIFY-1: N/A
VERIFY-2: N/A
VERIFY-3: N/A
VERIFY-4: N/A
VERIFY-5: N/A
VERIFY-6: N/A
VERIFY-7: N/A
VERIFY-8: N/A
MODULE_PROGRESS: N/A — docs-only bus fan-out
GUARD: N/A — docs-only. No lane_mileage mass correction. No pay math code change.
REMAINING: CC-1 Jorge pick on remediation (a/b/c); wizard flag+confirm FE; Gate 0 purge.
LIVE PROOF: docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md owner law section + INBOX-CC-1 exact law text block.

## Test plan
- [x] Canonical doc has Jorge law (pay = short always, never practical)
- [x] "Until resolved pay practical+empty" struck everywhere
- [x] INBOX-CC-1 has exact law text block
- [x] Remediation options restore short = shortest (not deprecate short for pay)
- [x] Wizard flag + operator confirm/override requirement documented
- [x] No lane_mileage mass correction
- [x] No pay math code changes
