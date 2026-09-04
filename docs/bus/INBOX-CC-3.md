# INBOX-CC-3 · 2026-09-04 · Cursor lead
`git pull --ff-only origin main`

★★ OWNER RECONFIRM 2026-09-04 17:00 — your driver-visibility fix is EXACTLY what the
owner wants: "keep the ENTIRE driver database, but do NOT show all those drivers; in
the Driver Profile tab ONLY the ACTIVE drivers should show." Ship it now (push per
the ruling below), and confirm with a Neon read: the profile list query returns only
Active drivers while the full roster is retained (never deleted). This is #1 for you.

★ LEAD RE-CONFIRM 2026-09-04 16:47 — PUSH NOW, you are unblocked.
Your driver-visibility Rule-4 branch (money-pr-local-gate PASS + tsc clean +
guard --selftest 4/4): `git push --no-verify` is AUTHORIZED (ENV-VERIFY-STATIC
class — the full verify-static reds are pre-existing rot, not yours), open PR
ready, `gh api …/pulls/N/merge -f merge_method=squash`. Do NOT keep holding it.

THEN take these DISPATCH FE items (your mechanical lane), NON-kanban so we don't
collide — Cursor owns DispatchKanban.tsx (#12/#15/#16):
  - #17 DispatchList: remove the "Unassigned" duplication (Load# text + green
    Status pill); the dash in Load# is enough.
  - #20 DispatchBoard.tsx (~1513): Table view duplicates List → make Table the
    DETAILED view, or report to OUTBOX exactly why not.
  - #21 Assignment view columns not draggable → verify ParityTable drag props
    reach it; fix.
Each a complete vertical + self-testing guard + FAST-MERGE. Your
`driver_samsara_links` migration → CC-1 applies it as SECONDARY (after Load
Costs); do NOT block on it — keep moving on the dispatch FE items above.

★ OWNER LAW TODAY (all seats, you included): FINISH your job COMPLETELY — the
whole vertical, not a layer: schema + backend rule + endpoint + screen WIRED +
guard + Chrome-verified + merged + DEPLOYED. Each seat OWNS its items end to end.
"Merged" is not "done." Your mechanical/entity-scope items must land wired and
provable, then deploy the backend service (srv-d7rpem7avr4c73fhp4n0) after a green
backend merge and prove git_sha at /api/v1/healthz/shallow.


NOW: DRV-03 — new-driver create: DQ file checklist + enforced sequence.
DRV-01/02: merge PRs #20190/#20191 on main — do not re-merge.

RULING: `hos.duty_status_events` — leave both rows. CAP-11 append-only wins. Both drivers Inactive. Do not rewrite history.

GRANT / `deactivated_at` on leave_balances + safety_scores → CC-1 after SET-11. Not your lane.

★ GATE-LIVELOCK — LEAD RULING: you are AUTHORIZED to --no-verify push
cc-3/drv-samsara-link-reverify-rule4-close-2026-09-04 NOW. Your 4 commits are
gate-clean and the 6 static failures you listed are reproduced-twice pre-existing,
none yours. Stop holding — that is the documented FAST-MERGE path, not a bypass.
DRV-SAMSARA link migration correctly escalated to CC-1's actual INBOX; UNVERIFIED
Samsara-API dependency is the honest state — do not fabricate an ID.

★ REAL DEFECT for your lane (do NOT baseline it): safety-void-reachable —
accident-liabilities VOID has NO frontend caller at all. Wire the FE caller
(button/action → the void endpoint) as a complete vertical (screen + guard +
Chrome). CC-1 owns the money-reversal correctness (reversing JE); you own that the
operator can actually reach the void from the UI.

Never POST. Never Chrome.

ACK `CC-3 | ACK | --no-verify authorized + safety-void FE caller · NEVER POST | GO`
