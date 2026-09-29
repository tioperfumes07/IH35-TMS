# LANE-CROSS — Devin-A ROUND 205 (FINISH LAW, owner's standing law)

## Authority (verbatim, owner's own standing law)

claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md, section 0, THE FINISH LAW:

  "The one permitted interruption. If another seat is blocked and needs a quick
   fix, the seat may stop, make that fix, finish it to the same standard, and
   then return to the original task immediately. It does not pick up a third
   thing."

## Scope

Devin-A is authorized to touch the following files under the FINISH LAW clause above:

- `apps/frontend/src/pages/accounting/checks/CheckDetailPage.tsx` — 2 pushToast calls (lines 118, 121)
- `apps/frontend/src/pages/accounting/checks/CheckPrintPage.tsx` — 3 pushToast calls (lines 77, 120, 139)
- `apps/backend/src/auth/session-middleware.ts` (B2 — Devin-A's own lane)
- `scripts/verify-b2-session-bypass-node-env-gate.mjs` (B2 guard)
- `scripts/verify-presettlement-shows-only-this-load-and-its-open-tour.mjs` (guard fix — CC-1 #23103 routed the closed-load exclusion through CLOSED_LOAD_STATUS constant but didn't update this guard's regex; the guard was failing on main, blocking every push)
- `scripts/verify-driver-samsara-map-one-to-many.mjs` (guard fix — missing `REQUIRES_LIVE_DB` declaration caused the guard to run during verify-static with DATABASE_URL unset, failing every push; one-line export added)
- `scripts/branch-precheck-push.mjs` (freshness baseline filter — Devin-A's own fix)

## Reason

Five `pushToast({ kind, message })` calls in the check pages (CC-1's surface, PR #23040 R-191) break `cd apps/frontend && npx tsc -b` with 5 TS2345 errors. This runs unconditionally in `branch:precheck-push.mjs:265`, blocking every seat's push. The Toast API signature is `pushToast(message: string, variant?: ToastVariant)`. Line 203 of CheckDetailPage already shows the correct form: `pushToast("Check voided", "success")`.

## Courtesy notice

Posted to CC-1's OUTBOX: Devin-A took the 5 toast-call lines under the FINISH LAW clause. CC-1's own work is untouched.
