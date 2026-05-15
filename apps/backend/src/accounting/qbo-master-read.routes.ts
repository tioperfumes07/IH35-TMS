import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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

async function columnExists(
  client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: Array<{ ok: boolean }> }> },
  schema: string,
  table: string,
  column: string
): Promise<boolean> {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

export async function registerQboMasterReadRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/customers", async (req: FastifyRequest, reply: FastifyReply) => {
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
        cursorSql = `AND (qc.mirrored_at, qc.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
      }
      values.push(limit + 1);
      const limIdx = values.length;
      const res = await client.query(
        `
          SELECT qc.id, qc.qbo_id, qc.display_name, qc.active AS is_active, qc.mirrored_at AS last_synced_at
          FROM mdata.qbo_customers qc
          WHERE qc.operating_company_id = $1::uuid
            AND qc.active = true
            ${cursorSql}
          ORDER BY qc.mirrored_at DESC, qc.id DESC
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

  app.get("/api/v1/accounting/customers/:id", async (req: FastifyRequest, reply: FastifyReply) => {
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
          SELECT id, qbo_id, display_name, active AS is_active, mirrored_at AS last_synced_at
          FROM mdata.qbo_customers
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND active = true
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

  app.get("/api/v1/accounting/vendors", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, limit, cursor } = parsed.data;
    const cur = decodeCursor(cursor);

    const rows = await withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const hasQboVendorCol = await columnExists(client, "mdata", "vendors", "qbo_vendor_id");
      const values: unknown[] = [operating_company_id];
      let cursorSql = "";
      if (cur) {
        values.push(cur.mirrored_at, cur.id);
        cursorSql = `AND (qv.mirrored_at, qv.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
      }
      values.push(limit + 1);
      const limIdx = values.length;
      const vendorCategorySelect = hasQboVendorCol
        ? `v.vendor_category AS vendor_category`
        : `NULL::text AS vendor_category`;
      const joinSql = hasQboVendorCol
        ? `LEFT JOIN mdata.vendors v
             ON v.operating_company_id = qv.operating_company_id
            AND v.qbo_vendor_id IS NOT NULL
            AND trim(v.qbo_vendor_id) = trim(qv.qbo_id)`
        : ``;
      const res = await client.query(
        `
          SELECT qv.id, qv.qbo_id, qv.display_name, qv.active AS is_active, qv.mirrored_at AS last_synced_at,
                 ${vendorCategorySelect}
          FROM mdata.qbo_vendors qv
          ${joinSql}
          WHERE qv.operating_company_id = $1::uuid
            ${cursorSql}
          ORDER BY qv.mirrored_at DESC, qv.id DESC
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

  app.get("/api/v1/accounting/vendors/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params ?? {});
    const q = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    if (!q.success) return validationError(reply, q.error);

    const row = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const hasQboVendorCol = await columnExists(client, "mdata", "vendors", "qbo_vendor_id");
      const vendorCategorySelect = hasQboVendorCol ? `v.vendor_category AS vendor_category` : `NULL::text AS vendor_category`;
      const joinSql = hasQboVendorCol
        ? `LEFT JOIN mdata.vendors v
             ON v.operating_company_id = qv.operating_company_id
            AND v.qbo_vendor_id IS NOT NULL
            AND trim(v.qbo_vendor_id) = trim(qv.qbo_id)`
        : ``;
      const res = await client.query(
        `
          SELECT qv.id, qv.qbo_id, qv.display_name, qv.active AS is_active, qv.mirrored_at AS last_synced_at,
                 ${vendorCategorySelect}
          FROM mdata.qbo_vendors qv
          ${joinSql}
          WHERE qv.id = $1::uuid AND qv.operating_company_id = $2::uuid
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

  app.get("/api/v1/accounting/items", async (req: FastifyRequest, reply: FastifyReply) => {
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
        cursorSql = `AND (qi.mirrored_at, qi.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
      }
      values.push(limit + 1);
      const limIdx = values.length;
      const res = await client.query(
        `
          SELECT qi.id, qi.qbo_id, qi.name AS display_name, qi.active AS is_active, qi.mirrored_at AS last_synced_at
          FROM mdata.qbo_items qi
          WHERE qi.operating_company_id = $1::uuid
            AND qi.active = true
            AND (
              lower(trim(coalesce(qi.item_type, ''))) IN ('inventory', 'service')
              OR lower(replace(trim(coalesce(qi.item_type, '')), ' ', '')) = 'noninventory'
            )
            ${cursorSql}
          ORDER BY qi.mirrored_at DESC, qi.id DESC
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

  app.get("/api/v1/accounting/expense-categories", async (req: FastifyRequest, reply: FastifyReply) => {
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
        cursorSql = `AND (qa.mirrored_at, qa.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
      }
      values.push(limit + 1);
      const limIdx = values.length;
      const res = await client.query(
        `
          SELECT qa.id, qa.qbo_id, qa.name AS display_name, qa.active AS is_active, qa.mirrored_at AS last_synced_at
          FROM mdata.qbo_accounts qa
          WHERE qa.operating_company_id = $1::uuid
            AND qa.active = true
            AND coalesce(qa.account_type, '') IN ('Expense', 'Cost of Goods Sold', 'Other Expense')
            ${cursorSql}
          ORDER BY qa.mirrored_at DESC, qa.id DESC
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
