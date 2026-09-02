FINDING: MILES-INVERT-01
LANE: NON-FINANCIAL

SOURCE-OF-TRUTH: scripts/ops/seed-lane-mileage.mjs — CSV→column 1:1 mapping at lines 148-186
I QUERIED:       Read ingest script; Jorge/Claude settled stats on 2142 inverted lanes
NOT CHECKED:     Live Neon re-query this session (stats from owner/Claude settlement)

ROOT CAUSE: Ingest maps CSV 1:1 (no column swap). Same short_miles column holds two meanings by row — 2/3 lanes short=practical+empty (historical artifact), 1/3 shortest route. avg(short−practical−empty)=−44.5 confirms deadhead gap. No single transform fixes it.

FIX: Updated canonical doc with settled root cause, INBOX-CC-1 remediation options (a/b/c) for Jorge, OUTBOX-CURSOR fan-out.

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
GUARD: N/A — docs-only bus fan-out. No lane_mileage mass correction.
REMAINING: CC-1 propose remediation (a/b/c) for Jorge pick; wizard flag; Gate 0 purge.
LIVE PROOF: docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md settled root cause section.

## Test plan
- [x] Canonical doc has settled root cause (not swap)
- [x] INBOX-CC-1 has remediation options (a/b/c) for Jorge
- [x] OUTBOX-CURSOR updated
- [x] No lane_mileage mass correction
- [x] No pay math changes
