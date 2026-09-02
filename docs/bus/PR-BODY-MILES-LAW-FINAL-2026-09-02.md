FINDING: MILES-LAW-FINAL-2026-09-02
LANE: NON-FINANCIAL

SOURCE-OF-TRUTH: Jorge owner ruling 2026-09-02 — supersedes #19740
I QUERIED:       Prior MILES-INVERT-01 doc + all INBOX fan-out files on origin/main
NOT CHECKED:     Live Chrome Book Load popup (CC-2 lane); catalog remediation (CC-1 lane)

ROOT CAUSE: #19740 bus said pay from practical+empty and forbade short miles. Owner overruled — STRUCK. Stale INBOX text lacked FINAL pay law, >100mi reverse-lane trigger, GO-22 urgency.

FIX: New canonical docs/bus/MILES-LAW-FINAL-2026-09-02.md + identical MILES LAW FINAL + FAST-MERGE blocks on all seat INBOXes + FEED/NOW-CURSOR + OUTBOX-CURSOR. MILES-INVERT-01 superseded redirect stub. FAST-MERGE-REMINDER-2026-09-02.md. Docs-only — no FE this PR (#19752/#19756 FE deferred).

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
MODULE_PROGRESS: N/A
ITEMS_TOUCHED: MILES-LAW-FINAL bus fan-out
MIGRATE: N/A

GUARD: N/A — docs-only bus fan-out; no new CI guard this PR
LIVE PROOF: docs/bus/MILES-LAW-FINAL-2026-09-02.md + every INBOX opens with MILES LAW FINAL block citing supersede of #19740
PROVES-IT-WORKS: grep MILES LAW FINAL docs/bus/INBOX-*.md returns 7 seat INBOX hits
KEEPS-IT-TRUE: bus docs on origin/main; seats read INBOX top block each session
REMAINING: CC-1 catalog remediation (no mass-swap); CC-2 Book Load OK popup chrome-prove 13508; GO-22 settlement short-mile guard wiring; Live=BLOCKED this PR (docs only)
