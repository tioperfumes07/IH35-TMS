// ROUND 326.2 item 2 — Banking KPI engine routes. Read-only, company-scoped; values and drills come from
// banking-kpi.service.ts (bank feed + GL + purchase document), never from component math.
//   GET /api/v1/banking/kpis?operating_company_id=&from=&to=
//   GET /api/v1/banking/kpis/:key/drill?operating_company_id=&from=&to=
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { computeBankingKpis, BANKING_KPI_KEYS, getBankingKpiDrill } from "./banking-kpi.service.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeQuery = z.object({ operating_company_id: z.string().uuid(), from: isoDate.optional(), to: isoDate.optional() });

function resolveRange(q: { from?: string; to?: string }) {
  const to = q.to ?? companyBusinessDate();
  const from = q.from ?? `${to.slice(0, 4)}-01-01`;
  return { from, to };
}

export async function registerBankingKpiRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/kpis", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = rangeQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const range = resolveRange(q.data);
    const kpis = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) => computeBankingKpis(client, q.data.operating_company_id, range));
    return { range, kpis };
  });

  app.get("/api/v1/banking/kpis/:key/drill", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = z.object({ key: z.enum(BANKING_KPI_KEYS) }).safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const q = rangeQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const range = resolveRange(q.data);
    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) => getBankingKpiDrill(client, q.data.operating_company_id, p.data.key, range));
    return { key: p.data.key, range, rows };
  });
}
