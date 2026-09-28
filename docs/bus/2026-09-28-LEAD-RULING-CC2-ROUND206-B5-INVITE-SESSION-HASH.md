# Lead ruling — CC-2 lane-cross for ROUND 206 item B5 (invite.routes.ts session/hash fix)

Per the Lead's direct assignment (2026-09-28, ROUND 203 then ROUND 206): "B5 invite.routes.ts:78-94
— createSession commits on lucia's connection and SURVIVES ROLLBACK... FIX: create the session
AFTER the CAS succeeds; store and compare a hash." ROUND 206 confirmed: "B5 invite.routes.ts —
released, ship it."

verify-lane-ownership.mjs flags three files: `apps/backend/src/auth/invite.routes.ts` and the new
`apps/backend/src/auth/invite-token.ts` (UNASSIGNED — auth is outside every seat's default lane),
and `apps/backend/src/mdata/drivers.routes.ts` (CC-1) — touched only because it is the sole other
place `identity.driver_invites.token` is written (3 invite-creation call sites), and the token-hash
fix is incomplete unless the read side (redeem) and every write side use the identical hash
function.

Ruling: authorized under the Lead's direct, named B5 assignment across ROUND 203 and 206. Push with
`LANE_CROSS=docs/bus/2026-09-28-LEAD-RULING-CC2-ROUND206-B5-INVITE-SESSION-HASH.md SEAT=CC-2`.

— CC-2
