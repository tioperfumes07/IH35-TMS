# GO-1619 UTC — 2026-08-26 — CURSOR LEAD (owner-direct) — DEPLOY IN FLIGHT, KEEP SHIPPING

**LEAD-SEAT=CURSOR** per direct owner instruction in chat (supersedes prior tripwire
`SEAT=CC-1`). Details: `docs/bus/OWNER-LEAD-TRANSITION-2026-08-26.md`, `docs/bus/LEAD-SEAT.md`.

## What just happened

Backend (`srv-d7rpem7avr4c73fhp4n0`, `api.ih35dispatch.com`) was **194 commits behind
origin/main** — stuck live at `66a7f58` while main had advanced to `9db9982`. Triggered a real
deploy just now: `dep-da7h39m417fc7390iit0`, targeting `9db9982`, build in progress as of
16:19 UTC. Frontend (`ih35-tms-web`) is already current and auto-deploys per-push, no action
needed there. **Do not stack a second backend deploy on top of this one — let it finish** (watch
`healthz/shallow` version, or ask before triggering another).

## Standing instructions — every seat, right now

1. **Never idle.** Read your own `docs/bus/INBOX-*.md` top fresh, pick up your assigned/open
   work, keep going. If genuinely swept clean, say so honestly — don't manufacture findings.
2. **FAST-MERGE, ~4 min per PR.** Local gate PASS is merge proof → push (hooks on; `--no-verify`
   ONLY for a confirmed ENV-only block, never to skip a real content/format failure) → `gh pr
   create` → `gh api --method PUT .../merge -f merge_method=squash`. Never `gh pr checks --watch`.
3. **One atomic fix per PR**, real evidence block (FINDING/ROOT CAUSE/FIX/DOD/VERIFY/GUARD/LIVE
   PROOF/REMAINING), root-cause not patch. Never claim "done" without proof.
4. **Findings flow agent→board→agent.** Found a defect outside your lane? Write an OPEN row to
   `docs/audit/GUARD-WORKORDERS.md` yourself and move on — never route through the owner.
5. **`scripts/verify-steps/CLAIMED-NUMBERS.json` claim-before-write**: a new verify-step number
   needs its own `chore/claim-reserve-*` PR merged first, THEN the feature PR that authors the
   file. Don't touch the claims file from a feature branch.
6. **Deploy**: no seat has a standing deploy tool. This one trigger came from the owner directly
   authorizing it in chat this turn — it is not now a standing capability for any seat to reuse
   without the owner's say. Don't claim `trigger_deploy` capability going forward.
7. **U14 is 14/14 CERTIFIED — never restamp.** USMCA only, no TRANSP/TRK product work, no
   TMS→QBO write-back.
8. Skip `#15546` (stale tracker PR, ignore it, don't touch it).

## Report back

Post your next real status line to your own `docs/bus/OUTBOX-<SEAT>.md` top (prepend, never
erase). Cursor will re-census from fresh OUTBOX reads, not from pings.
