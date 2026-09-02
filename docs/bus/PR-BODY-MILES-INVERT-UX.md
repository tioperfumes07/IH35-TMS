FINDING: MILES-INVERT-01
LANE: NON-FINANCIAL

SOURCE-OF-TRUTH: Jorge owner UX ruling 2026-09-02 — Book Load wizard autofill + flag + OK popup
I QUERIED:       MILES-INVERT-01 canonical doc + INBOX-CC-1/CC-2/CC-3 + OUTBOX-CURSOR
NOT CHECKED:     Live Neon re-query (stats unchanged from prior settlement)

ROOT CAUSE: Unchanged — ingest 1:1, dual semantics on short_miles column. Two distinct meanings now documented: (1) column inversion short>practical on same lane, (2) direction-pair mismatch A→B vs B→A.

FIX: Locked Owner UX for Book Load wizard — still autofill practical/short/empty; inline flag; OK-only popup (cannot dismiss without OK); continue after OK. CC-2 owns Book Load chrome popup. CC-1 may compare direction pairs later. Driver pay law unchanged (short always).

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
GUARD: N/A — docs-only. No lane_mileage mass correction. No FE in this PR.
REMAINING: CC-2 Book Load popup FE; CC-1 remediation (a/b/c) + pair compare; Gate 0 purge.
LIVE PROOF: docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md Owner UX section + INBOX-CC-2 exact UX bullets.

## Test plan
- [x] Two meanings documented (column inversion vs direction pair)
- [x] Owner UX: autofill + flag + OK-only popup + continue after OK
- [x] CC-2 assigned Book Load chrome popup
- [x] CC-3 reference only (shell sizing, not popup owner)
- [x] Driver pay law unchanged (short always)
- [x] No lane_mileage mass correction
- [x] No FE code changes
