# >>> CURRENT BOX, ALL SEATS: docs/bus/00-CURRENT-BOX-ALL-SEATS-ROUND-105.md <<<
# ROUND 105 - 2026-09-23 10:20 AM CT (15:20 UTC) - Claude Lead. Read it before anything else.
#
# R-105.1  The owner's ROUND 114 E10 loop reversed 417 JEs in the 14:00 UTC hour and stamped
#          ZERO document headers, and is NOT running now. 764 live JEs remain, target 0.
#          Cause proven: every Cursor worktree's scripts/ops/e10-void-runner-01-usmca.ts has
#          `grep -c stampDocumentVoided` = 0. The runner runs via `npx tsx` from a working
#          copy, so the CHECKOUT gates the stamp, not the deploy.
# CURSOR   Before any restart: git checkout 7e85eab553 -- scripts/ops/e10-void-runner-01-usmca.ts
#          then `grep -c stampDocumentVoided` on that file. REQUIRED VALUE: non-zero.
#          Both owner stop conditions measured clean - zero_line_jes = 0, banking.* untouched
#          across all twelve tables since 14:00 UTC. DO NOT STOP THE LOOP. GL 1000/1090
#          reversal lines are not "banking moves."
# R-105.2  THE GATE IS RED FOR EVERY SEAT. verify-void-is-whole: FAIL - 52 NEW violations
#          beyond a 333 baseline, 385 total, against a genuine before-picture of 92. The 333
#          was written 14:48:42Z - 45 min INTO the loop - and its _comment calls itself
#          "measured BEFORE E10 ran anywhere". That is false. ~293 of the 385 are silent
#          voids this morning's loop created. NOT ONE OF THEM MAY BE BASELINED. They leave
#          the guard by being STAMPED. The unblock is the checkout above, not a rewrite.
# R-105.3  RETRACTED - ROUND 104's claimed inbox fix wrote to four 00-INBOX-*-READ-FIRST.md
#          files that DO NOT EXIST. CC-1's and CURSOR's ROUND 103/104 clocks are VOID.
#          No transfers. Nothing filed against any seat.
# R-105.4  The thirteen GL controls moved and ALL THIRTEEN RECONCILE TO THE CENT against the
#          loop's own reversal effect. No variance, no restatement. 0 cross-entity lines.
# Per-seat boxes and deadlines for CC-1, CC-2, CC-3 and CURSOR: section 6 of the box.
#
# A box that exists only in ~/Downloads is not delivered. From ROUND 105 a box is not issued
# until it is on main.
# ---------------------------------------------------------------------------------------

# CODER INSTRUCTIONS — NOW · GO-20 · 2026-09-02

**Read `docs/bus/INBOX-<SEAT>.md` TOP (FORCE block).** Canonical paste: `docs/bus/PASTE-ALL-SEATS-GO-20-2026-09-02.md`

**STOP:** `docs/bus/PASTE-ALL-SEATS-STOP-NO-SEAT-LOADS-2026-09-01.md`

**Live:** `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` — record `version` SHA

NEVER create loads in prod. NEVER sample/demo. NEVER POST Book Load. Jorge owns first typed Load #.

**GO-20:** seven unique seat FORCE rows — see `docs/bus/NOW-ONE-SOURCE.md`. Cutover **closed**. $7000 capitalize threshold — **never $7500**.

FAST-MERGE ~4 min. Never `gh pr checks --watch`. CC never `trigger_deploy`.

USMCA only. U14 CERTIFIED — never recertify. Ignore `docs/bus/archive/` unless forensic.
