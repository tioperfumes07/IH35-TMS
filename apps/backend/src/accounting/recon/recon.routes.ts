// RECON-01 — read-only route surface for the reconciliation module. GET-only; every handler surfaces
// accounting.recon_runs / recon_exceptions and NEVER runs a pass or resolves anything (resolution is a
// separate authenticated action, RECON-02). Behind OFF env flag TMS_QBO_RECON_ENABLED — when OFF every
// endpoint 404s (surface unreachable, app unchanged), mirroring the FIN-23 qbo-reconcile pattern. Per-entity
// via withCompanyScope → RLS on operating_company_id. Role-gated to finance roles.
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const RECON_ENABLED = process.env.TMS_QBO_RECON_ENABLED === "true";

function canAccess(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

/** When the flag is OFF the surface is unreachable: 404, app unchanged. */
function flagGate(reply: FastifyReply): boolean {
  if (!RECON_ENABLED) {
    reply.code(404).send({ error: "not_found" });
    return false;
  }
  return true;
}

const runsQuery = companyQuerySchema.extend({
  status: z.enum(["running", "complete", "open", "late"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const exceptionsQuery = companyQuerySchema.extend({
  run_id: z.string().uuid().optional(),
  status: z.enum(["open", "explained", "resolved"]).optional(),
  exception_class: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerReconRoutes(app: FastifyInstance) {
  // List reconciliation runs (newest first).
  app.get("/api/v1/accounting/recon/runs", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!flagGate(reply)) return;
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const q = runsQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    try { await assertCompanyMembership(user.uuid, q.data.operating_company_id); }
    catch { return reply.code(403).send({ error: "forbidden_company_membership" }); }
    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT id::text, run_type, window_start::text, window_end::text, started_at::text, finished_at::text,
                preparer::text, reviewer::text, signed_off_at::text, totals, status
           FROM accounting.recon_runs
          WHERE operating_company_id = $1::uuid AND is_active = true AND voided_at IS NULL
            AND ($2::text IS NULL OR status = $2)
          ORDER BY started_at DESC LIMIT $3 OFFSET $4`,
        [q.data.operating_company_id, q.data.status ?? null, q.data.limit, q.data.offset],
      );
      return res.rows;
    });
    return reply.send({ runs: rows });
  });

  // List exceptions (optionally filtered to a run / status / class).
  app.get("/api/v1/accounting/recon/exceptions", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!flagGate(reply)) return;
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const q = exceptionsQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    try { await assertCompanyMembership(user.uuid, q.data.operating_company_id); }
    catch { return reply.code(403).send({ error: "forbidden_company_membership" }); }
    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT id::text, run_id::text, exception_class, source_ref, qbo_ref, field, tms_value, qbo_value,
                severity, status, resolved_by::text, resolution_note, resolved_at::text, created_at::text
           FROM accounting.recon_exceptions
          WHERE operating_company_id = $1::uuid AND is_active = true AND voided_at IS NULL
            AND ($2::uuid IS NULL OR run_id = $2::uuid)
            AND ($3::text IS NULL OR status = $3)
            AND ($4::text IS NULL OR exception_class = $4)
          ORDER BY created_at DESC LIMIT $5 OFFSET $6`,
        [q.data.operating_company_id, q.data.run_id ?? null, q.data.status ?? null, q.data.exception_class ?? null, q.data.limit, q.data.offset],
      );
      return res.rows;
    });
    return reply.send({ exceptions: rows });
  });
}
