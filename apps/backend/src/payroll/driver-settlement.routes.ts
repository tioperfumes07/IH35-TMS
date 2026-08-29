import type { FastifyInstance, FastifyReply } from "fastify";

// =====================================================================================================
// RETIRED (settlement engine collapse Step 2, 2026-07-15). The payroll settlement engine
// (computeSettlement / postSettlement -> payroll.driver_settlements / driver_settlement_line_items) is a
// duplicate ledger, superseded by the canonical driver-finance settlements subledger + posting services
// (parity verified 2026-07-15 — see driver-settlement.service.deprecated.ts for the full map). These two
// endpoints had ZERO frontend callers; they now permanently 308-redirect to the canonical engine.
// Single-subledger rule (QBO/NetSuite/McLeod/Alvys): never resurrect the payroll settlement ledger.
// MUST NOT write payroll.* — guarded by scripts/verify-no-payroll-settlement-writes.mjs (G4).
// =====================================================================================================

const CANONICAL = "/api/v1/driver-finance/settlements";

function gone(reply: FastifyReply, canonical: string) {
  reply.header("location", canonical);
  return reply.code(308).send({
    error: "gone",
    message: "The payroll settlement engine is retired. Use the canonical driver-finance settlements subledger.",
    canonical_endpoint: canonical,
  });
}

export async function registerPayrollDriverSettlementRoutes(app: FastifyInstance) {
  // POST /api/v1/payroll/driver-settlements/compute — RETIRED -> canonical create.
  app.post("/api/v1/payroll/driver-settlements/compute", async (_req, reply) => gone(reply, CANONICAL));

  // POST /api/v1/payroll/driver-settlements/:settlement_id/post — RETIRED -> canonical subledger detail.
  app.post("/api/v1/payroll/driver-settlements/:settlement_id/post", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = (req.params as { settlement_id?: string })?.settlement_id;
    return gone(reply, id ? `${CANONICAL}/${id}` : CANONICAL);
  });
}
