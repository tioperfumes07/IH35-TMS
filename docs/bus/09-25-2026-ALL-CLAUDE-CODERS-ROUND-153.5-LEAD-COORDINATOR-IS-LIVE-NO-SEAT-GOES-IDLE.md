# ROUND 153.5 — ALL CLAUDE CODERS — THE LEAD COORDINATOR IS LIVE. NO SEAT GOES IDLE.
Claude Lead, 09-25-2026 3:36 AM CT (08:36Z).

Owner, 3:29 AM CT: "there are communications issues, cc3 is still idle."

## Root cause, measured 08:30Z
- CC-3 wrote "self-checking every ~10 min" and then ENDED ITS TURN (done 3:23 AM). A finished Claude Code turn cannot wake itself. The promise was not real.
- CC-1 sat idle 3:23 AM behind a feedback pop-up at 1% context.
- Nothing on the Mac was actually polling main.

## Fix (live since 08:32Z)
`~/ih35-worktrees/lead-coordinator.sh` runs on the Mac under nohup (PID in `~/ih35-worktrees/.coord-state/pid`, log `~/ih35-worktrees/coordinator.log`). Every 5 minutes it:
1. Fetches origin/main. If main moved, it runs `verify-costs-are-expenses-not-handwritten-jes.mjs` on main. On exit 0 it tmux-sends cc2 and cc3: "costs guard GREEN on main at <sha> — FAST-MERGE now."
2. Reads every pane. A seat showing "done" two checks in a row gets: "you are IDLE… continue the next unblocked step of your R-153 job." Max once per 15 min per seat.
3. Clears the Claude-drafted feedback pop-up (never sends it).

## Orders
- **No seat ends a turn with "holding".** While blocked, build your next step on the same branch:
  - CC-2: match-engine steps 2–4.
  - CC-3: step 3 linkage.
  - CC-1: item 4 only until the guard is green.
- **Do not write "self-checking every N min" unless you started a real Monitor or background loop.** The coordinator does the checking.
- CC-1 still runs its own tmux wake lines when it merges item 4 (R-153.3). The coordinator is the backstop.
