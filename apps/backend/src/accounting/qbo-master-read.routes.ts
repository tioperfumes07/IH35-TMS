import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { sendZodValidation } from "../lib/zod-http-error.js";

const listQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety"].includes(role);
}

function decodeCursor(raw: string | undefined): { mirrored_at: string; id: string } | null {
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { mirrored_at?: string; id?: string };
    if (!json.mirrored_at || !json.id) return null;
    return { mirrored_at: json.mirrored_at, id: json.id };
  } catch {
    return null;
  }
}

function encodeCursor(row: { mirrored_at: string | Date; id: string }) {
  const payload = JSON.stringify({ mirrored_at: new Date(row.mirrored_at).toISOString(), id: row.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}


export async function registerQboMasterReadRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/customers", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, limit, cursor } = parsed.data;
    const cur = decodeCursor(cursor);

    const rows = await withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const values: unknown[] = [operating_company_id];
      let cursorSql = "";
      if (cur) {
        values.push(cur.mirrored_at, cur.id);
        cursorSql = `AND (c.updated_at, c.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
      }
      values.push(limit + 1);
      const limIdx = values.length;
      const res = await client.query(
        `
          SELECT c.id, c.qbo_customer_id AS qbo_id, c.customer_name AS display_name,
                 (c.deactivated_at IS NULL) AS is_active, c.updated_at AS last_synced_at
          FROM mdata.customers c
          WHERE c.operating_company_id = $1::uuid
            AND c.deactivated_at IS NULL
            ${cursorSql}
          ORDER BY c.updated_at DESC, c.id DESC
          LIMIT $${limIdx}
        `,
        values
      );
      return res.rows as Array<{
        id: string;
        qbo_id: string;
        display_name: string;
        is_active: boolean;
        last_synced_at: string;
      }>;
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        qbo_id: r.qbo_id,
        display_name: r.display_name,
        is_active: r.is_active,
        last_synced_at: r.last_synced_at,
      })),
      next_cursor: hasMore && last ? encodeCursor({ mirrored_at: last.last_synced_at, id: last.id }) : null,
    };
  });

  app.get("/api/v1/accounting/customers/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params ?? {});
    const q = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    if (!q.success) return validationError(reply, q.error);

    const row = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT id, qbo_customer_id AS qbo_id, customer_name AS display_name,
                 (deactivated_at IS NULL) AS is_active, updated_at AS last_synced_at
          FROM mdata.customers
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
          LIMIT 1
        `,
        [params.data.id, q.data.operating_company_id]
      );
      return res.rows[0] as
        | { id: string; qbo_id: string; display_name: string; is_active: boolean; last_synced_at: string }
        | undefined;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return {
      id: row.id,
      qbo_id: row.qbo_id,
      display_name: row.display_name,
      is_active: row.is_active,
      last_synced_at: row.last_synced_at,
    };
  });

  app.get("/api/v1/accounting/vendors", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, limit, cursor } = parsed.data;
    const cur = decodeCursor(cursor);

    const rows = await withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const values: unknown[] = [operating_company_id];
      let cursorSql = "";
      if (cur) {
        values.push(cur.mirrored_at, cur.id);
        cursorSql = `AND (v.updated_at, v.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
      }
      values.push(limit + 1);
      const limIdx = values.length;
      const res = await client.query(
        `
          SELECT v.id, v.qbo_vendor_id AS qbo_id, v.vendor_name AS display_name,
                 (v.deactivated_at IS NULL) AS is_active, v.updated_at AS last_synced_at,
                 v.vendor_category
          FROM mdata.vendors v
          WHERE v.operating_company_id = $1::uuid
            ${cursorSql}
          ORDER BY v.updated_at DESC, v.id DESC
          LIMIT $${limIdx}
        `,
        values
      );
      return res.rows as Array<{
        id: string;
        qbo_id: string;
        display_name: string;
        is_active: boolean;
        last_synced_at: string;
        vendor_category: string | null;
      }>;
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        qbo_id: r.qbo_id,
        display_name: r.display_name,
        is_active: r.is_active,
        last_synced_at: r.last_synced_at,
        vendor_category: r.vendor_category ?? null,
      })),
      next_cursor: hasMore && last ? encodeCursor({ mirrored_at: last.last_synced_at, id: last.id }) : null,
    };
  });

  app.get("/api/v1/accounting/vendors/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params ?? {});
    const q = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    if (!q.success) return validationError(reply, q.error);

    const row = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT v.id, v.qbo_vendor_id AS qbo_id, v.vendor_name AS display_name,
                 (v.deactivated_at IS NULL) AS is_active, v.updated_at AS last_synced_at,
                 v.vendor_category
          FROM mdata.vendors v
          WHERE v.id = $1::uuid AND v.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, q.data.operating_company_id]
      );
      return res.rows[0] as
        | {
            id: string;
            qbo_id: string;
            display_name: string;
            is_active: boolean;
            last_synced_at: string;
            vendor_category: string | null;
          }
        | undefined;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return {
      id: row.id,
      qbo_id: row.qbo_id,
      display_name: row.display_name,
      is_active: row.is_active,
      last_synced_at: row.last_synced_at,
      vendor_category: row.vendor_category ?? null,
    };
  });

  app.get("/api/v1/accounting/items", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, limit, cursor } = parsed.data;
    const cur = decodeCursor(cursor);

    const rows = await withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const values: unknown[] = [operating_company_id];
      let cursorSql = "";
      if (cur) {
        values.push(cur.mirrored_at, cur.id);
        cursorSql = `AND (ci.updated_at, ci.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
      }
      values.push(limit + 1);
      const limIdx = values.length;
      const res = await client.query(
        `
          SELECT ci.id, ci.qbo_item_id AS qbo_id, ci.item_name AS display_name,
                 (ci.deactivated_at IS NULL) AS is_active, ci.updated_at AS last_synced_at
          FROM catalogs.items ci
          WHERE ci.operating_company_id = $1::uuid
            AND ci.deactivated_at IS NULL
            AND (
              lower(trim(coalesce(ci.item_type, ''))) IN ('inventory', 'service')
              OR lower(replace(trim(coalesce(ci.item_type, '')), ' ', '')) = 'noninventory'
            )
            ${cursorSql}
          ORDER BY ci.updated_at DESC, ci.id DESC
          LIMIT $${limIdx}
        `,
        values
      );
      return res.rows as Array<{
        id: string;
        qbo_id: string;
        display_name: string;
        is_active: boolean;
        last_synced_at: string;
      }>;
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        qbo_id: r.qbo_id,
        display_name: r.display_name,
        is_active: r.is_active,
        last_synced_at: r.last_synced_at,
      })),
      next_cursor: hasMore && last ? encodeCursor({ mirrored_at: last.last_synced_at, id: last.id }) : null,
    };
  });

  app.get("/api/v1/accounting/expense-categories", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, limit, cursor } = parsed.data;
    const cur = decodeCursor(cursor);

    const rows = await withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const values: unknown[] = [operating_company_id];
      let cursorSql = "";
      if (cur) {
        values.push(cur.mirrored_at, cur.id);
        cursorSql = `AND (qa.updated_at, qa.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
      }
      values.push(limit + 1);
      const limIdx = values.length;
      // LST-F06: expense-category list reads canonical catalogs.accounts (not mdata.qbo_accounts).
      const res = await client.query(
        `
          SELECT qa.id,
                 qa.qbo_account_id AS qbo_id,
                 qa.account_name AS display_name,
                 (qa.deactivated_at IS NULL) AS is_active,
                 qa.updated_at AS last_synced_at
          FROM catalogs.accounts qa
          WHERE qa.operating_company_id = $1::uuid
            AND qa.deactivated_at IS NULL
            AND qa.is_postable = true
            AND qa.account_type IN ('Expense', 'CostOfGoodsSold', 'OtherExpense')
            ${cursorSql}
          ORDER BY qa.updated_at DESC, qa.id DESC
          LIMIT $${limIdx}
        `,
        values
      );
      return res.rows as Array<{
        id: string;
        qbo_id: string;
        display_name: string;
        is_active: boolean;
        last_synced_at: string;
      }>;
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        qbo_id: r.qbo_id,
        display_name: r.display_name,
        is_active: r.is_active,
        last_synced_at: r.last_synced_at,
      })),
      next_cursor: hasMore && last ? encodeCursor({ mirrored_at: last.last_synced_at, id: last.id }) : null,
    };
  });
}


export default fp(async (app) => {
  await registerQboMasterReadRoutes(app);
}, { name: "accounting.registerQboMasterReadRoutes" });
