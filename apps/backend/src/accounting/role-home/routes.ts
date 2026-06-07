import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { getAccountingHomeData } from "./accounting-home.service.js";

const accountingHomeRoles = new Set(["Accountant", "Owner", "Administrator", "Manager"]);

export async function registerAccountingRoleHomeRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/role-home", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingHomeRoles.has(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const data = await getAccountingHomeData({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
    });

    return data;
  });
}
