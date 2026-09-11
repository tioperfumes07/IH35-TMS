import { registerGate, type GateFn } from "./gate-registry.service.js";

/**
 * DRIVER-COMPLIANCE-01 (owner/Claude Lead 2026-09-11): a driver with a NULL cdl_number,
 * cdl_expires_at, or dot_medical_expires_at was passing dispatch's WF-038 active-driver gate
 * silently — WF-038 only checks status='Active', never whether the credential fields that make a
 * driver legally dispatchable are actually populated. Measured live: all 3 drivers on the 3
 * currently-active loads had NO dot_medical_expires_at; 1 also had no cdl_expires_at, 1 no
 * cdl_number. Every one of them passed the gate with blanks.
 *
 * This gate names the SPECIFIC missing field(s) on the load/driver instead of a generic failure,
 * and blocks at the SAME service boundary WF-038/WF-044/WF-050 already enforce (the
 * auth-gates/routes.ts preHandler on POST .../loads/book, POST .../quick-assign, PATCH
 * .../assignment) — not only a React-side warning that a determined dispatcher could bypass.
 *
 * dot_medical_expires_at has no source document for the 15 Mexican-license drivers seeded this
 * pass (Licencia Federal de Conductor does not carry a US DOT medical exam) — this gate does NOT
 * invent a date; it blocks honestly until a real medical-exam document populates the field.
 */
const driverComplianceGate: GateFn = async (ctx, client) => {
  if (!ctx.driver_uuid) return [];
  const res = await client.query<{ cdl_number: string | null; cdl_expires_at: string | null; dot_medical_expires_at: string | null }>(
    `SELECT d.cdl_number, d.cdl_expires_at::text, d.dot_medical_expires_at::text
     FROM mdata.drivers d
     WHERE d.id = $1::uuid
       AND (d.operating_company_id = $2::uuid OR EXISTS (
         SELECT 1 FROM mdata.driver_company_authorizations dca01_dca
         WHERE dca01_dca.driver_id = d.id
           AND dca01_dca.company_id = $2::uuid
           AND dca01_dca.is_authorized = true
           AND dca01_dca.deactivated_at IS NULL
       ))
     LIMIT 1`,
    [ctx.driver_uuid, ctx.operating_company_id]
  );
  const row = res.rows[0];
  // WF-038 already blocks "driver not found" — stay silent here to avoid a duplicate blocker.
  if (!row) return [];

  const missing: string[] = [];
  if (!row.cdl_number) missing.push("CDL number");
  if (!row.cdl_expires_at) missing.push("CDL expiration date");
  if (!row.dot_medical_expires_at) missing.push("DOT medical certificate expiration date");
  if (missing.length === 0) return [];

  return [
    {
      workflow: "DRIVER-COMPLIANCE-01",
      kind: "blocker" as const,
      message: `Driver is missing required credential(s): ${missing.join(", ")} — dispatch blocked`,
      evidence: { driver_id: ctx.driver_uuid, missing },
    },
  ];
};

registerGate("book_load", driverComplianceGate);
registerGate("assign_driver", driverComplianceGate);
registerGate("quick_assign", driverComplianceGate);
