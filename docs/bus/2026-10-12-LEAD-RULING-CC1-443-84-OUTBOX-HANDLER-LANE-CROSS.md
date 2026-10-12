# Lead Ruling — CC-1 lane cross: dispatch-relearn-load-miles.handler.ts (443.84)

**Date:** 2026-10-12  
**Issued by:** Lead (direct order, 443.84 session)  
**Branch:** cc-1/443-84-v3  

## Ruling

CC-1 is authorized to edit `apps/backend/src/outbox/handlers/dispatch-relearn-load-miles.handler.ts`
to change `eventType = DISPATCH_RELEARN_LOAD_MILES_EVENT` (constant) to
`eventType = "dispatch.relearn_load_miles" as const` (string literal) so that
`verify:outbox-handler-parity` can detect the handler via its regex.

**Lead order (verbatim):** "fix the two guards that fail on every PR: verify:outbox-handler-parity
(build-typecheck-heavy) and verify-dispatch-load-patch-money-evidence-guard
('linkage override allowlist must explicitly exclude revenue/pay', locked-guards-heavy).
Root cause file:line, fix, PR, and MERGE IT YOURSELF the moment its own checks pass"

The file is UNASSIGNED in LANES.md. This ruling grants CC-1 one-time write access for this change.
