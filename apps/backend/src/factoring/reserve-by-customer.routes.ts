// Lead ROUND 296 §3 — per-customer Faro reserve (a table, a row per customer) and its per-invoice drill. Read-only,
// company-scoped; both come from the one SQL in reserve-by-customer.service.ts, which also reports whether the column
// total ties to the GL balance of 1230 + 1235.
//   GET /api/v1/factoring/reserves/by-customer?operating_company_id=&as_of=
//   GET /api/v1/factoring/reserves/by-invoice?operating_company_id=&as_of=&customer_id=
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { reserveByCustomer, reserveByInvoice } from "./reserve-by-customer.service.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const q = z.object({ operating_company_id: z.string().uuid(), as_of: isoDate.optional(), customer_id: z.string().uuid().optional() });

export async function registerReserveByCustomerRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/reserves/by-customer", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = q.safeParse(req.query ?? {});
    if (!p.success) return validationError(reply, p.error);
    const asOf = p.data.as_of ?? companyBusinessDate();
    return withCompanyScope(user.uuid, p.data.operating_company_id, (client) => reserveByCustomer(client, p.data.operating_company_id, asOf));
  });

  app.get("/api/v1/factoring/reserves/by-invoice", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = q.safeParse(req.query ?? {});
    if (!p.success) return validationError(reply, p.error);
    const asOf = p.data.as_of ?? companyBusinessDate();
    const rows = await withCompanyScope(user.uuid, p.data.operating_company_id, (client) =>
      reserveByInvoice(client, p.data.operating_company_id, asOf, p.data.customer_id ?? null)
    );
    return { as_of: asOf, rows };
  });
}
