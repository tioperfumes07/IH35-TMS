import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

const SOURCE_TAG = "C3-CUSTOMER-CONTRACT-UPLOAD";

const ALLOWED_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"]);

function guardAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user!;
  if (!ALLOWED_ROLES.has(user.role ?? "")) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  file_id: z.string().uuid().optional(),
  contract_type: z.enum(["rate_agreement", "master_service", "broker_carrier", "other"]).default("rate_agreement"),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const supersedeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  file_id: z.string().uuid().optional(),
  contract_type: z.enum(["rate_agreement", "master_service", "broker_carrier", "other"]).optional(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  include_superseded: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export async function registerCustomerContractRoutes(app: FastifyInstance) {
  app.post("/api/v1/customer-contracts", async (req, reply) => {
    const user = guardAuth(req, reply);
    if (!user) return;
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);

      const custCheck = await client.query<{ id: string }>(
        `SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [body.data.customer_id, body.data.operating_company_id]
      );
      if (!custCheck.rows[0]) return reply.code(404).send({ error: "customer_not_found" });

      if (body.data.file_id) {
        const fileCheck = await client.query<{ id: string }>(
          `SELECT id FROM docs.files WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
          [body.data.file_id]
        );
        if (!fileCheck.rows[0]) return reply.code(404).send({ error: "file_not_found" });
      }

      const res = await client.query<{ id: string }>(
        `INSERT INTO customer.contract (
           operating_company_id, customer_id, file_id, contract_type,
           effective_date, expiration_date, notes, uploaded_by_user_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          body.data.operating_company_id,
          body.data.customer_id,
          body.data.file_id ?? null,
          body.data.contract_type,
          body.data.effective_date ?? null,
          body.data.expiration_date ?? null,
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const contractId = res.rows[0].id;

      await appendCrudAudit(
        client,
        user.uuid,
        "customer.contract.uploaded",
        {
          resource_type: "customer.contract",
          resource_id: contractId,
          operating_company_id: body.data.operating_company_id,
          customer_id: body.data.customer_id,
          contract_type: body.data.contract_type,
        },
        "info",
        SOURCE_TAG
      );

      return reply.code(201).send({ id: contractId });
    });
  });

  app.get("/api/v1/customer-contracts", async (req, reply) => {
    const user = guardAuth(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);

      const rows = await client.query(
        `SELECT
           c.id, c.customer_id, c.file_id, c.contract_type,
           c.effective_date, c.expiration_date, c.notes,
           c.supersedes_id, c.uploaded_by_user_id,
           c.is_active, c.created_at, c.updated_at,
           f.original_filename AS file_name,
           f.size_bytes AS file_size_bytes,
           f.mime_type AS file_mime_type
         FROM customer.contract c
         LEFT JOIN docs.files f ON f.id = c.file_id AND f.deleted_at IS NULL
         WHERE c.customer_id = $1
           AND c.operating_company_id = $2
           ${query.data.include_superseded ? "" : "AND c.is_active = true AND c.supersedes_id IS NULL"}
         ORDER BY c.created_at DESC`,
        [query.data.customer_id, query.data.operating_company_id]
      );
      return { contracts: rows.rows };
    });
  });

  app.get("/api/v1/customer-contracts/:id", async (req, reply) => {
    const user = guardAuth(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const qs = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!qs.success) return reply.code(400).send({ error: "validation_error" });

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [qs.data.operating_company_id]);

      const res = await client.query(
        `SELECT
           c.id, c.customer_id, c.file_id, c.contract_type,
           c.effective_date, c.expiration_date, c.notes,
           c.supersedes_id, c.uploaded_by_user_id,
           c.is_active, c.created_at, c.updated_at,
           f.original_filename AS file_name,
           f.size_bytes AS file_size_bytes,
           f.mime_type AS file_mime_type
         FROM customer.contract c
         LEFT JOIN docs.files f ON f.id = c.file_id AND f.deleted_at IS NULL
         WHERE c.id = $1
           AND c.operating_company_id = $2
         LIMIT 1`,
        [params.data.id, qs.data.operating_company_id]
      );
      if (!res.rows[0]) return reply.code(404).send({ error: "not_found" });
      return res.rows[0];
    });
  });

  app.post("/api/v1/customer-contracts/:id/supersede", async (req, reply) => {
    const user = guardAuth(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = supersedeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);

      const existing = await client.query<{
        id: string;
        customer_id: string;
        contract_type: string;
        effective_date: string | null;
        expiration_date: string | null;
      }>(
        `SELECT id, customer_id, contract_type, effective_date, expiration_date
         FROM customer.contract
         WHERE id = $1 AND operating_company_id = $2 AND is_active = true
         LIMIT 1`,
        [params.data.id, body.data.operating_company_id]
      );
      if (!existing.rows[0]) return reply.code(404).send({ error: "contract_not_found" });
      const prev = existing.rows[0];

      await client.query(
        `UPDATE customer.contract SET is_active = false WHERE id = $1`,
        [params.data.id]
      );

      const res = await client.query<{ id: string }>(
        `INSERT INTO customer.contract (
           operating_company_id, customer_id, file_id, contract_type,
           effective_date, expiration_date, notes,
           supersedes_id, uploaded_by_user_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          body.data.operating_company_id,
          prev.customer_id,
          body.data.file_id ?? null,
          body.data.contract_type ?? prev.contract_type,
          body.data.effective_date ?? prev.effective_date,
          body.data.expiration_date ?? prev.expiration_date,
          body.data.notes ?? null,
          params.data.id,
          user.uuid,
        ]
      );
      const newId = res.rows[0].id;

      await appendCrudAudit(
        client,
        user.uuid,
        "customer.contract.superseded",
        {
          resource_type: "customer.contract",
          resource_id: newId,
          operating_company_id: body.data.operating_company_id,
          superseded_id: params.data.id,
        },
        "info",
        SOURCE_TAG
      );

      return reply.code(201).send({ id: newId, superseded_id: params.data.id });
    });
  });
}
