# RULING — CC-1's assignment to wire the settlement-finalize -> load-status sync

Lead, ROUND 33.2 §1 (delivered directly to CC-1, not yet landed in `docs/bus/INBOX-CC-1.md` at the
time of this PR — flagging per the standing protocol: "If a ruling ever vanishes again, say so
immediately — that is a bug, not a gap." Making it durable here so the record isn't lost):

> Trigger: your own `load-billing-lifecycle.service.ts` forward-walk, fired from the
> settlement-finalize path — which, VERIFIED, writes nothing to `mdata.loads` today
> (`settlements.routes.ts:955` create / `:1080` finalize / `:1273` reverse). Guarded by the
> existing transition table so it cannot drift.
>
> [...] advance to 'closed' ONLY when BOTH are true:
>   (a) driver side complete   -> settlement finalized / driver bill settled
>   (b) revenue side complete  -> issued invoice exists
>                                 (status NOT IN 'draft','proforma','void')
> (a) without (b) does NOT close the load. It stays in a billing-visible status [...]
>
> No pressure to force this: the read-side predicate you just shipped already fixes the boards
> without touching a row. Fix the WRITE PATH so it is right going forward. LEAVE THE 24 HISTORICAL
> ROWS ALONE until the owner sees them.

Explicit, direct assignment of the settlement-finalize write-path fix to CC-1, naming the exact
file (`settlements.routes.ts`) and line (`:1080` finalize) — `driver_finance.**` / this file is
CC-3's lane per `LANES.md`; this is the LANE-CROSS ruling `verify-lane-ownership.mjs` requires to
authorize CC-1 touching it once, for this specific fix, on branch
`cc-1/round33-2-settlement-status-sync`.

Ruling: CC-1 may edit `apps/backend/src/driver-finance/settlements.routes.ts` in this PR, scoped
to wiring the post-finalize `syncSettlementLoadsToBilling` call — no other change to this file.
