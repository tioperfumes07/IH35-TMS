═══════════════════════════════════════════════════════════════
BLOCK A2 — AUDIT-EMIT-COVERAGE-DISPATCH
Relates to: Universal Audit Linkage, Layer 1 (WRITE). After A1.
═══════════════════════════════════════════════════════════════

GOAL
Every meaningful Dispatch action emits a linked spine event. Today dispatch mutates
loads/assignments without consistently writing to the audit spine.

TO THE CODER — off current main (A1 merged first):
  git checkout main && git pull origin main && npm install
  git checkout -b feat/a2-audit-emit-dispatch

NO MIGRATION (unless a dispatch table lacks audit columns — if so, add is_active +
audit columns in a db/migrations/ file per the active/inactive rule).

EMIT COVERAGE — in the dispatch routes/services, call events.log_event() for EACH:
  - load.created / load.updated / load.cancelled
  - load.assigned_to_driver / load.unassigned / load.reassigned
  - load.assigned_to_unit / unit.changed
  - load.status_changed (each transition: booked→dispatched→in_transit→delivered)
  - load.rate_changed / load.reserved / load.reserve_released
  Each call MUST pass:
    actor_user_id        = the authenticated user
    entity_type='load', entity_id = load uuid
    action               = one of the above
    source_table         = 'dispatch.loads' (or the real table)
    source_reference_id  = the load uuid
    correlation_id       = a per-request uuid so multi-step actions group
    before/after payload = the changed fields (JSON), no secrets
  Use the SAME auth pattern as geofence/driveralert/safetydoc routes
  (requireAuth guard + operating_company_id from request body/context).

RULE: emit AFTER the mutation succeeds, in the same transaction where possible, so a
failed mutation does not log a phantom event. If the mutation rolls back, the event
must roll back too.

verify-a2-audit-emit-dispatch.mjs guard: scan dispatch route handlers; assert each
mutating handler contains a log_event( call. Fail if a mutating endpoint has none.
PRE-PUSH Postgres validate if a migration was added. Push BLOCK_ID=A2-AUDIT-EMIT-DISPATCH,
ls-remote, open PR. Report PR# + SHA.
═══════════════════════════════════════════════════════════════
