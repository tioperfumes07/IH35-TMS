import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { sendZodValidation } from "../lib/zod-http-error.js";
import { enqueueQboMasterEntityPush } from "../qbo/push.service.js";

const companyScoped = z.object({
  operating_company_id: z.string().uuid(),
});

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety"].includes(role);
}

async function assertCompanyAccess(
  client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> },
  userId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM org.user_company_access uca
        WHERE uca.user_id = $1::uuid
          AND uca.company_id = $2::uuid
          AND uca.deactivated_at IS NULL
      ) AS ok
    `,
    [userId, operatingCompanyId]
  );
  return Boolean(res.rows[0]?.ok);
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

const vendorCreateSchema = companyScoped.extend({
  display_name: z.string().trim().min(1).max(200),
  company_name: z.string().trim().max(200).optional(),
  primary_email: z.string().trim().max(320).optional(),
  primary_phone: z.string().trim().max(80).optional(),
});

const vendorUpdateSchema = vendorCreateSchema.partial().extend({
  operating_company_id: z.string().uuid(),
  active: z.boolean().optional(),
});

const customerCreateSchema = companyScoped.extend({
  display_name: z.string().trim().min(1).max(200),
  company_name: z.string().trim().max(200).optional(),
  primary_email: z.string().trim().max(320).optional(),
  primary_phone: z.string().trim().max(80).optional(),
  mc_number: z.string().trim().max(64).optional(),
});

const customerUpdateSchema = customerCreateSchema.partial().extend({
  operating_company_id: z.string().uuid(),
  active: z.boolean().optional(),
});

const itemCreateSchema = companyScoped.extend({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(120).optional(),
  unit_price_cents: z.number().int().min(0).optional(),
  income_account_qbo_id: z.string().trim().min(1).max(64),
});

const itemUpdateSchema = companyScoped.extend({
  name: z.string().trim().min(1).max(200).optional(),
  sku: z.string().trim().max(120).optional(),
  unit_price_cents: z.number().int().min(0).optional(),
  income_account_qbo_id: z.string().trim().min(1).max(64).optional(),
  active: z.boolean().optional(),
});

const accountCreateSchema = companyScoped.extend({
  name: z.string().trim().min(1).max(200),
  account_type: z.string().trim().min(1).max(64),
  account_sub_type: z.string().trim().max(64).optional(),
  full_qualified_name: z.string().trim().max(512).optional(),
});

const accountUpdateSchema = accountCreateSchema.partial().extend({
  operating_company_id: z.string().uuid(),
  active: z.boolean().optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function registerQboMasterWriteRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/qbo/vendors", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = vendorCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);
    const body = parsed.data;

    const row = await withCurrentUser(String(user.uuid), async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.operating_company_id]);
      const allowed = await assertCompanyAccess(client, String(user.uuid), body.operating_company_id);
      if (!allowed) return null;

      await client.query("BEGIN");
      try {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.qbo_vendors (
              operating_company_id,
              qbo_id,
              display_name,
              company_name,
              primary_email,
              primary_phone,
              active,
              created_in_tms,
              payload_json
            ) VALUES ($1, NULL, $2, $3, $4, $5, true, true, '{}'::jsonb)
            RETURNING id
          `,
          [
            body.operating_company_id,
            body.display_name,
            body.company_name ?? null,
            body.primary_email ?? null,
            body.primary_phone ?? null,
          ]
        );
        const mirrorId = String(inserted.rows[0]?.id ?? "");
        await enqueueQboMasterEntityPush(client, {
          operating_company_id: body.operating_company_id,
          mirror_row_id: mirrorId,
          entity: "vendor",
          operation: "create",
        });
        await appendCrudAudit(client, String(user.uuid), "mdata.qbo.vendor.created_tms", { mirror_row_id: mirrorId }, "info", "P6-T11182");
        await client.query("COMMIT");
        return { id: mirrorId };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });

    if (!row) return reply.code(403).send({ error: "forbidden" });
    return reply.code(201).send({ vendor: row });
  });

  app.put("/api/v1/mdata/qbo/vendors/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const parsed = vendorUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);
    const body = parsed.data;

    const updated = await withCurrentUser(String(user.uuid), async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.operating_company_id]);
      const allowed = await assertCompanyAccess(client, String(user.uuid), body.operating_company_id);
      if (!allowed) return null;

      await client.query("BEGIN");
      try {
        const res = await client.query(
          `
            UPDATE mdata.qbo_vendors
            SET
              display_name = COALESCE($3, display_name),
              company_name = COALESCE($4, company_name),
              primary_email = COALESCE($5, primary_email),
              primary_phone = COALESCE($6, primary_phone),
              active = COALESCE($7, active),
              mirrored_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            RETURNING id
          `,
          [
            params.data.id,
            body.operating_company_id,
            body.display_name ?? null,
            body.company_name ?? null,
            body.primary_email ?? null,
            body.primary_phone ?? null,
            body.active ?? null,
          ]
        );
        if (res.rowCount === 0) {
          await client.query("ROLLBACK");
          return { kind: "missing" as const };
        }
        await enqueueQboMasterEntityPush(client, {
          operating_company_id: body.operating_company_id,
          mirror_row_id: params.data.id,
          entity: "vendor",
          operation: "update",
        });
        await appendCrudAudit(client, String(user.uuid), "mdata.qbo.vendor.updated_tms", { mirror_row_id: params.data.id }, "info", "P6-T11182");
        await client.query("COMMIT");
        return { kind: "ok" as const };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });

    if (!updated) return reply.code(403).send({ error: "forbidden" });
    if (updated.kind === "missing") return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/api/v1/mdata/qbo/customers", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = customerCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);
    const body = parsed.data;

    const row = await withCurrentUser(String(user.uuid), async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.operating_company_id]);
      const allowed = await assertCompanyAccess(client, String(user.uuid), body.operating_company_id);
      if (!allowed) return null;

      await client.query("BEGIN");
      try {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.qbo_customers (
              operating_company_id,
              qbo_id,
              display_name,
              company_name,
              primary_email,
              primary_phone,
              mc_number,
              active,
              created_in_tms,
              payload_json
            ) VALUES ($1, NULL, $2, $3, $4, $5, $6, true, true, '{}'::jsonb)
            RETURNING id
          `,
          [
            body.operating_company_id,
            body.display_name,
            body.company_name ?? null,
            body.primary_email ?? null,
            body.primary_phone ?? null,
            body.mc_number ?? null,
          ]
        );
        const mirrorId = String(inserted.rows[0]?.id ?? "");
        await enqueueQboMasterEntityPush(client, {
          operating_company_id: body.operating_company_id,
          mirror_row_id: mirrorId,
          entity: "customer",
          operation: "create",
        });
        await appendCrudAudit(client, String(user.uuid), "mdata.qbo.customer.created_tms", { mirror_row_id: mirrorId }, "info", "P6-T11182");
        await client.query("COMMIT");
        return { id: mirrorId };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });

    if (!row) return reply.code(403).send({ error: "forbidden" });
    return reply.code(201).send({ customer: row });
  });

  app.put("/api/v1/mdata/qbo/customers/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const parsed = customerUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);
    const body = parsed.data;

    const updated = await withCurrentUser(String(user.uuid), async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.operating_company_id]);
      const allowed = await assertCompanyAccess(client, String(user.uuid), body.operating_company_id);
      if (!allowed) return null;

      await client.query("BEGIN");
      try {
        const res = await client.query(
          `
            UPDATE mdata.qbo_customers
            SET
              display_name = COALESCE($3, display_name),
              company_name = COALESCE($4, company_name),
              primary_email = COALESCE($5, primary_email),
              primary_phone = COALESCE($6, primary_phone),
              mc_number = COALESCE($7, mc_number),
              active = COALESCE($8, active),
              mirrored_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            RETURNING id
          `,
          [
            params.data.id,
            body.operating_company_id,
            body.display_name ?? null,
            body.company_name ?? null,
            body.primary_email ?? null,
            body.primary_phone ?? null,
            body.mc_number ?? null,
            body.active ?? null,
          ]
        );
        if (res.rowCount === 0) {
          await client.query("ROLLBACK");
          return { kind: "missing" as const };
        }
        await enqueueQboMasterEntityPush(client, {
          operating_company_id: body.operating_company_id,
          mirror_row_id: params.data.id,
          entity: "customer",
          operation: "update",
        });
        await appendCrudAudit(client, String(user.uuid), "mdata.qbo.customer.updated_tms", { mirror_row_id: params.data.id }, "info", "P6-T11182");
        await client.query("COMMIT");
        return { kind: "ok" as const };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });

    if (!updated) return reply.code(403).send({ error: "forbidden" });
    if (updated.kind === "missing") return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/api/v1/mdata/qbo/items", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = itemCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);
    const body = parsed.data;

    const row = await withCurrentUser(String(user.uuid), async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.operating_company_id]);
      const allowed = await assertCompanyAccess(client, String(user.uuid), body.operating_company_id);
      if (!allowed) return null;

      await client.query("BEGIN");
      try {
        const payloadJson = JSON.stringify({ income_account_qbo_id: body.income_account_qbo_id });
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.qbo_items (
              operating_company_id,
              qbo_id,
              name,
              sku,
              unit_price_cents,
              active,
              created_in_tms,
              payload_json
            ) VALUES ($1, NULL, $2, $3, $4, true, true, $5::jsonb)
            RETURNING id
          `,
          [body.operating_company_id, body.name, body.sku ?? null, body.unit_price_cents ?? null, payloadJson]
        );
        const mirrorId = String(inserted.rows[0]?.id ?? "");
        await enqueueQboMasterEntityPush(client, {
          operating_company_id: body.operating_company_id,
          mirror_row_id: mirrorId,
          entity: "item",
          operation: "create",
        });
        await appendCrudAudit(client, String(user.uuid), "mdata.qbo.item.created_tms", { mirror_row_id: mirrorId }, "info", "P6-T11182");
        await client.query("COMMIT");
        return { id: mirrorId };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });

    if (!row) return reply.code(403).send({ error: "forbidden" });
    return reply.code(201).send({ item: row });
  });

  app.put("/api/v1/mdata/qbo/items/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const parsed = itemUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);
    const body = parsed.data;

    const updated = await withCurrentUser(String(user.uuid), async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.operating_company_id]);
      const allowed = await assertCompanyAccess(client, String(user.uuid), body.operating_company_id);
      if (!allowed) return null;

      await client.query("BEGIN");
      try {
        const existing = await client.query<{ payload_json: unknown }>(
          `SELECT payload_json FROM mdata.qbo_items WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
          [params.data.id, body.operating_company_id]
        );
        const priorPayload =
          existing.rows[0]?.payload_json && typeof existing.rows[0].payload_json === "object" && !Array.isArray(existing.rows[0].payload_json)
            ? (existing.rows[0].payload_json as Record<string, unknown>)
            : {};
        const nextPayload = {
          ...priorPayload,
          ...(body.income_account_qbo_id ? { income_account_qbo_id: body.income_account_qbo_id } : {}),
        };

        const res = await client.query(
          `
            UPDATE mdata.qbo_items
            SET
              name = COALESCE($3, name),
              sku = COALESCE($4, sku),
              unit_price_cents = COALESCE($5, unit_price_cents),
              active = COALESCE($6, active),
              payload_json = $7::jsonb,
              mirrored_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            RETURNING id
          `,
          [
            params.data.id,
            body.operating_company_id,
            body.name ?? null,
            body.sku ?? null,
            body.unit_price_cents ?? null,
            body.active ?? null,
            JSON.stringify(nextPayload),
          ]
        );
        if (res.rowCount === 0) {
          await client.query("ROLLBACK");
          return { kind: "missing" as const };
        }
        await enqueueQboMasterEntityPush(client, {
          operating_company_id: body.operating_company_id,
          mirror_row_id: params.data.id,
          entity: "item",
          operation: "update",
        });
        await appendCrudAudit(client, String(user.uuid), "mdata.qbo.item.updated_tms", { mirror_row_id: params.data.id }, "info", "P6-T11182");
        await client.query("COMMIT");
        return { kind: "ok" as const };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });

    if (!updated) return reply.code(403).send({ error: "forbidden" });
    if (updated.kind === "missing") return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/api/v1/mdata/qbo/accounts", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = accountCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);
    const body = parsed.data;

    const row = await withCurrentUser(String(user.uuid), async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.operating_company_id]);
      const allowed = await assertCompanyAccess(client, String(user.uuid), body.operating_company_id);
      if (!allowed) return null;

      await client.query("BEGIN");
      try {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.qbo_accounts (
              operating_company_id,
              qbo_id,
              name,
              full_qualified_name,
              account_type,
              account_sub_type,
              active,
              created_in_tms,
              payload_json
            ) VALUES ($1, NULL, $2, $3, $4, $5, true, true, '{}'::jsonb)
            RETURNING id
          `,
          [
            body.operating_company_id,
            body.name,
            body.full_qualified_name ?? null,
            body.account_type,
            body.account_sub_type ?? null,
          ]
        );
        const mirrorId = String(inserted.rows[0]?.id ?? "");
        await enqueueQboMasterEntityPush(client, {
          operating_company_id: body.operating_company_id,
          mirror_row_id: mirrorId,
          entity: "account",
          operation: "create",
        });
        await appendCrudAudit(client, String(user.uuid), "mdata.qbo.account.created_tms", { mirror_row_id: mirrorId }, "info", "P6-T11182");
        await client.query("COMMIT");
        return { id: mirrorId };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });

    if (!row) return reply.code(403).send({ error: "forbidden" });
    return reply.code(201).send({ account: row });
  });

  app.put("/api/v1/mdata/qbo/accounts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const parsed = accountUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);
    const body = parsed.data;

    const updated = await withCurrentUser(String(user.uuid), async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.operating_company_id]);
      const allowed = await assertCompanyAccess(client, String(user.uuid), body.operating_company_id);
      if (!allowed) return null;

      await client.query("BEGIN");
      try {
        const res = await client.query(
          `
            UPDATE mdata.qbo_accounts
            SET
              name = COALESCE($3, name),
              full_qualified_name = COALESCE($4, full_qualified_name),
              account_type = COALESCE($5, account_type),
              account_sub_type = COALESCE($6, account_sub_type),
              active = COALESCE($7, active),
              mirrored_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            RETURNING id
          `,
          [
            params.data.id,
            body.operating_company_id,
            body.name ?? null,
            body.full_qualified_name ?? null,
            body.account_type ?? null,
            body.account_sub_type ?? null,
            body.active ?? null,
          ]
        );
        if (res.rowCount === 0) {
          await client.query("ROLLBACK");
          return { kind: "missing" as const };
        }
        await enqueueQboMasterEntityPush(client, {
          operating_company_id: body.operating_company_id,
          mirror_row_id: params.data.id,
          entity: "account",
          operation: "update",
        });
        await appendCrudAudit(client, String(user.uuid), "mdata.qbo.account.updated_tms", { mirror_row_id: params.data.id }, "info", "P6-T11182");
        await client.query("COMMIT");
        return { kind: "ok" as const };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });

    if (!updated) return reply.code(403).send({ error: "forbidden" });
    if (updated.kind === "missing") return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });
}
