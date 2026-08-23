import { registerGate, type GateFn } from "./gate-registry.service.js";

const wf038Gate: GateFn = async (ctx, client) => {
  if (!ctx.driver_uuid) return [];
  // CLS-SCHEMA-DRIFT / PHANTOM COLUMN — verified against the PROD branch (br-fancy-credit-akjnd07a)
  // 2026-08-07: `is_dispatch_blocked` exists on mdata.units and views.units_with_dispatch_status ONLY.
  // mdata.drivers has no such column, and running the old statement on prod returns
  // `column "is_dispatch_blocked" does not exist` (42703).
  //
  // It is a UNIT dispatch-block, never a driver one, so this gate was asking the wrong table a question
  // that table cannot answer. checkGates does not catch — the throw propagates out of the preHandler in
  // auth-gates/routes.ts, which matches POST /api/v1/dispatch/loads/:id/quick-assign,
  // PATCH …/assignment and POST …/loads/book. Every dispatch mutation carrying a driver_uuid 500'd
  // before it reached its handler: no driver could be attached to a load at all.
  //
  // The unit-side block keeps its enforcement — quick-assign.service.ts:72/92, book-load.service.ts:697,
  // quicksave.service.ts:48 and pre-dispatch-validator.service.ts:348 each read it from the unit view
  // and hard-block — so removing it here loses no coverage; it removes a duplicate asked of the wrong row.
  //
  // mdata.drivers.status is enum `driver_status` = Active | Probation | Inactive | Terminated | OnLeave
  // (prod-verified), so the "Active" comparison below is capitalised correctly.
  const res = await client.query<{ status: string }>(
    `SELECT d.status::text
     FROM mdata.drivers d
     WHERE d.id = $1::uuid
       AND (d.operating_company_id = $2::uuid OR EXISTS (
         SELECT 1 FROM mdata.driver_company_authorizations wf038_driver_dca
         WHERE wf038_driver_dca.driver_id = d.id
           AND wf038_driver_dca.company_id = $2::uuid
           AND wf038_driver_dca.is_authorized = true
           AND wf038_driver_dca.deactivated_at IS NULL
       ))
     LIMIT 1`,
    [ctx.driver_uuid, ctx.operating_company_id]
  );
  const row = res.rows[0];
  if (!row) return [{ workflow: "WF-038", kind: "blocker", message: "Driver not found" }];
  if (row.status !== "Active") {
    return [{ workflow: "WF-038", kind: "blocker", message: `Driver is not active (status=${row.status})`, evidence: { status: row.status } }];
  }
  return [];
};

registerGate("book_load", wf038Gate);
registerGate("assign_driver", wf038Gate);
registerGate("quick_assign", wf038Gate);
