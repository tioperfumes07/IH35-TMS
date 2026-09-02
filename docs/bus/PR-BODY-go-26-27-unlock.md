FINDING: GO-26/27-UNLOCK
LANE: NON-FINANCIAL

SOURCE-OF-TRUTH: docs/bus/INBOX-*.md — owner unlock fan-out from Downloads/IH35-SEAT-INSTRUCTIONS-2026-09-02/
I QUERIED:       Read GO-26-SEAT-BLOCKS + GO-27 path; patched all seat INBOX tops + OUTBOX-CURSOR
NOT CHECKED:     Neon purge (CC-1 lane); Chrome live (CC-2 lane)

ROOT CAUSE: Seat INBOXes stale — seed still 13509, no GO-27 doc in repo, no kill-LD/keep-LOAD ruling, Jorge HOLD lifted but bus not fan-out.

FIX: Copy GO-26/27 docs to docs/bus/; fan-out whole seat blocks to INBOX-CC-1/2/3, CODEX, CASCADE, CURSOR; seed locked 13557 (last_trace_no=13556); OUTBOX-CURSOR GO unlocked one-liner.

DOD-A: PASS
DOD-B: N/A
DOD-C: PASS
DOD-D: N/A
DOD-E: PASS
VERIFY-1: PASS
VERIFY-2: N/A
VERIFY-3: PASS
VERIFY-4: PASS
VERIFY-5: N/A
VERIFY-6: N/A
VERIFY-7: PASS
VERIFY-8: PASS
MODULE_PROGRESS: dispatch 0 of N (bus only)
ITEMS_TOUCHED: GO-26, GO-27
MIGRATE: N/A

GUARD: N/A — docs-only bus fan-out
LIVE PROOF: docs/bus/INBOX-CC-1.md lines 54-60 seed 13557 kill LD keep LOAD; docs/bus/OUTBOX-CURSOR.md GO unlocked one-liner
PROVES-IT-WORKS: grep seed 13557 docs/bus/INBOX-CC-1.md returns kill LD keep LOAD + last_trace_no=13556
KEEPS-IT-TRUE: seat INBOX tops are canonical queue; GO-23 strict order
REMAINING: CC-1 Gate 0 purge first schema PR + done-gate query; CC-2 Combobox guard; CC-3 Gate 1 wizard; Cursor Gate 1.5 GO-06 after bus green
