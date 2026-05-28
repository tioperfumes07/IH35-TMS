import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { syncPseMirror } from "./pse-mirror.service.js";

const listPsItemsQuerySchema = companyQuerySchema.extend({
  category: z.string().trim().min(1).optional(),
});

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant"].includes(role);
}

function adminRole(role: string) {
  return role === "Owner" || role === "Administrator";
}

export async function registerPseMirrorRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/pse-mirror/sync-now", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!adminRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    return { ok: true };
  });

  app.get("/api/v1/ps-categories", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    const rows = await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT qbo_id, name, coa_account_id, active
          FROM accounting.ps_category
          WHERE tenant_id = $1::uuid
          ORDER BY name ASC
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return { items: rows };
  });

  app.get("/api/v1/ps-items", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = listPsItemsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    const rows = await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      let where = "tenant_id = $1::uuid";
      if (query.data.category) {
        values.push(query.data.category.toLowerCase());
        where += ` AND category_qbo_id = $${values.length}`;
      }
      const res = await client.query(
        `
          SELECT qbo_id, name, category_qbo_id, coa_account_id, active
          FROM accounting.ps_item
          WHERE ${where}
          ORDER BY name ASC
        `,
        values
      );
      return res.rows;
    });

    return { items: rows };
  });

  app.get("/api/v1/coa-accounts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await syncPseMirror(String(user.uuid), query.data.operating_company_id);
    const rows = await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT qbo_id, number, name, type, detail_type, active
          FROM accounting.coa_account
          WHERE tenant_id = $1::uuid
          ORDER BY name ASC
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return { items: rows };
  });
}

export default fp(async (app) => {
  await registerPseMirrorRoutes(app);
}, { name: "accounting.registerPseMirrorRoutes" });
