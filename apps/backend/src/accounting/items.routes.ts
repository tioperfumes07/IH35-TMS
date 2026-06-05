import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const categoriesQuerySchema = companyQuerySchema.extend({
  type: z.enum(["expense", "all"]).default("expense"),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const itemsQuerySchema = companyQuerySchema.extend({
  kind: z.enum(["service", "inventory", "labor", "all"]).default("service"),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety", "Mechanic"].includes(role);
}

const EXPENSE_ACCOUNT_TYPES = ["Expense", "Cost of Goods Sold", "Other Expense"];

export async function registerAccountingCatalogLookupRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/categories", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = categoriesQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id: oc, type, search, limit } = parsed.data;

    const rows = await withCompanyScope(user.uuid, oc, async (client) => {
      const values: unknown[] = [oc];
      const filters = ["operating_company_id = $1::uuid", "active = true"];
      if (type === "expense") {
        values.push(EXPENSE_ACCOUNT_TYPES);
        filters.push(`coalesce(account_type, '') = ANY($${values.length}::text[])`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(name ILIKE $${idx} OR coalesce(full_qualified_name, '') ILIKE $${idx})`);
      }
      values.push(limit);
      const res = await client.query(
        `
          SELECT
            id,
            qbo_id,
            name,
            account_type,
            full_qualified_name AS account_number
          FROM mdata.qbo_accounts
          WHERE ${filters.join(" AND ")}
          ORDER BY name ASC
          LIMIT $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { categories: rows };
  });

  app.get("/api/v1/accounting/items-for-wo", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = itemsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id: oc, kind, search, limit } = parsed.data;

    const rows = await withCompanyScope(user.uuid, oc, async (client) => {
      const values: unknown[] = [oc];
      const filters = ["operating_company_id = $1::uuid", "active = true"];
      if (kind === "service") {
        filters.push(`lower(trim(coalesce(item_type, ''))) IN ('service', 'noninventory')`);
      } else if (kind === "inventory") {
        filters.push(`lower(trim(coalesce(item_type, ''))) = 'inventory'`);
      } else if (kind === "labor") {
        filters.push(`lower(trim(coalesce(name, ''))) LIKE '%labor%'`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(name ILIKE $${idx} OR coalesce(sku, '') ILIKE $${idx})`);
      }
      values.push(limit);
      const res = await client.query(
        `
          SELECT id, qbo_id, name, item_type, unit_price_cents
          FROM mdata.qbo_items
          WHERE ${filters.join(" AND ")}
          ORDER BY name ASC
          LIMIT $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { items: rows };
  });
}
