import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const routeParamsSchema = z.object({
  group: z.string().min(1),
  tab: z.string().min(1),
});

const CANONICAL_SAFETY_TABS = [
  ["driver-files", "driver-files"],
  ["driver-files", "drug-alcohol"],
  ["driver-files", "safety-meetings"],
  ["hours-fatigue", "hos"],
  ["hours-fatigue", "hos-violations"],
  ["inspections-fmcsa", "idvr"],
  ["inspections-fmcsa", "dot-inspections"],
  ["inspections-fmcsa", "driver-scoring"],
  ["inspections-fmcsa", "csa-score"],
  ["inspections-fmcsa", "dot-compliance"],
  ["incidents-claims", "safety-events"],
  ["incidents-claims", "accidents"],
  ["incidents-claims", "damage-reports"],
  ["incidents-claims", "trailer-interchanges"],
  ["incidents-claims", "cargo-claims"],
  ["fines-discipline", "internal-fines"],
  ["fines-discipline", "external-fines"],
  ["fines-discipline", "complaints"],
  ["driver-financial", "escrow-record"],
  ["compliance-monitoring", "geofence-alerts"],
  ["compliance-monitoring", "insurance"],
  ["compliance-monitoring", "permits"],
  ["compliance-monitoring", "integrity-reports"],
  ["compliance-monitoring", "position-history"],
  ["workforce-planning", "driver-scheduler"],
  ["workforce-planning", "leave-requests"],
  ["workforce-planning", "leave-balances"],
  ["settings", "settings"],
] as const;

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

const canonicalSet = new Set(CANONICAL_SAFETY_TABS.map(([group, tab]) => `${group}/${tab}`));

async function buildKpis(client: any, companyId: string) {
  const openAccidents =
    (
      await client
        .query(`SELECT COUNT(*)::int AS count FROM safety.accident_reports WHERE operating_company_id = $1 AND status NOT ILIKE 'closed%'`, [companyId])
        .catch(() => ({ rows: [{ count: 0 }] }))
    ).rows[0]?.count ?? 0;
  const dotInspections =
    (
      await client
        .query(`SELECT COUNT(*)::int AS count FROM compliance.dot_inspection_events WHERE operating_company_id = $1`, [companyId])
        .catch(() => ({ rows: [{ count: 0 }] }))
    ).rows[0]?.count ?? 0;
  const hosViolations =
    (
      await client
        .query(`SELECT COUNT(*)::int AS count FROM safety.hos_violations WHERE operating_company_id = $1`, [companyId])
        .catch(() => ({ rows: [{ count: 0 }] }))
    ).rows[0]?.count ?? 0;

  return [
    { label: "Open Items", value: Number(openAccidents) },
    { label: "DOT Inspections", value: Number(dotInspections) },
    { label: "HOS Violations", value: Number(hosViolations) },
  ];
}

export async function registerSafetyFoundationKpiRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/:group/:tab/kpis", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = routeParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const key = `${params.data.group}/${params.data.tab}`;
    if (!canonicalSet.has(key)) return reply.code(404).send({ error: "safety_tab_not_found" });

    const cards = await withCompany(user.uuid, query.data.operating_company_id, async (client) =>
      buildKpis(client, query.data.operating_company_id)
    );
    return { cards };
  });
}
