import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";

// DOC-REQ-2 (owner decision #6) — read + per-carrier config API for compliance.required_document_types.
// Read-only list is available to any authed user in the company; writes are Owner/Administrator only, which
// MATCHES the table's write RLS policy (required_document_types_entity_write → Owner/Administrator) so a
// permitted caller never hits an RLS refusal. Void-not-delete: deactivate via PATCH is_active=false (the
// table grants no DELETE). The "Missing required: N" presence chip is a separate block (DOC-REQ-2b) whose
// per-code→document-storage mapping needs owner review — NOT included here.

const ENTITY_KINDS = ["driver", "unit", "customer", "vendor"] as const;

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
  entity_kind: z.enum(ENTITY_KINDS).optional(),
});

const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_kind: z.enum(ENTITY_KINDS),
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "code must be lower_snake_case"),
  label: z.string().trim().min(1).max(160),
  authority: z.string().trim().max(160).optional(),
  enforcement: z.enum(["warn", "hard_block"]).default("warn"),
  has_expiry: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10000).default(0),
});

const patchSchema = z.object({
  operating_company_id: z.string().uuid(),
  label: z.string().trim().min(1).max(160).optional(),
  authority: z.string().trim().max(160).optional(),
  enforcement: z.enum(["warn", "hard_block"]).optional(),
  has_expiry: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
  is_active: z.boolean().optional(),
});

const idParams = z.object({ id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

// Must match the table's write RLS policy (Owner/Administrator) — see migration 202607021400.
function canManage(role: string) {
  return ["Owner", "Administrator"].includes(role);
}

export async function registerRequiredDocumentTypesRoutes(app: FastifyInstance) {
  // List the active required-document types for a company (optionally filtered by entity kind).
  app.get(
    "/api/v1/compliance/required-document-types",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      const res = await client.query(
        `
          SELECT id::text, entity_kind, code, label, authority, enforcement, has_expiry, is_seed,
                 sort_order, created_at, updated_at
          FROM compliance.required_document_types
          WHERE operating_company_id = $1::uuid
            AND is_active = true
            AND ($2::text IS NULL OR entity_kind = $2::text)
          ORDER BY entity_kind, sort_order, label
        `,
        [query.data.operating_company_id, query.data.entity_kind ?? null]
      );
      return res.rows;
    });
    return reply.send({ required_document_types: rows });
  });

  // Add a carrier-specific required-document type (is_seed=false).
  app.post(
    "/api/v1/compliance/required-document-types",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authUser(req, reply);
    if (!user || !canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const row = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, body.data.operating_company_id);
      const res = await client.query(
        `
          INSERT INTO compliance.required_document_types (
            operating_company_id, entity_kind, code, label, authority, enforcement, has_expiry, sort_order, is_seed
          ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, false)
          ON CONFLICT (operating_company_id, entity_kind, code) DO NOTHING
          RETURNING id::text, entity_kind, code, label, authority, enforcement, has_expiry, is_seed, sort_order
        `,
        [
          body.data.operating_company_id,
          body.data.entity_kind,
          body.data.code,
          body.data.label,
          body.data.authority ?? null,
          body.data.enforcement,
          body.data.has_expiry,
          body.data.sort_order,
        ]
      );
      const inserted = res.rows[0];
      if (inserted) {
        await appendCrudAudit(
          client as Parameters<typeof appendCrudAudit>[0],
          user.uuid,
          "compliance.required_document_type.created",
          { entityId: inserted.id, operatingCompanyId: body.data.operating_company_id }
        );
      }
      return inserted;
    });
    // ON CONFLICT DO NOTHING → row already exists for this (company, entity_kind, code).
    if (!row) return reply.code(409).send({ error: "already_exists" });
    return reply.code(201).send({ required_document_type: row });
  });

  // Update a required-document type: enforcement (warn⇄hard_block), label/authority/expiry/order, or
  // deactivate (is_active=false — void-not-delete). entity_kind/code are immutable (the natural key).
  app.patch(
    "/api/v1/compliance/required-document-types/:id",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authUser(req, reply);
    if (!user || !canManage(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParams.safeParse(req.params ?? {});
    const body = patchSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const row = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, body.data.operating_company_id);
      const res = await client.query(
        `
          UPDATE compliance.required_document_types
          SET label = COALESCE($3, label),
              authority = COALESCE($4, authority),
              enforcement = COALESCE($5, enforcement),
              has_expiry = COALESCE($6, has_expiry),
              sort_order = COALESCE($7, sort_order),
              is_active = COALESCE($8, is_active),
              updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          RETURNING id::text, entity_kind, code, label, enforcement, has_expiry, is_active, sort_order
        `,
        [
          params.data.id,
          body.data.operating_company_id,
          body.data.label ?? null,
          body.data.authority ?? null,
          body.data.enforcement ?? null,
          body.data.has_expiry ?? null,
          body.data.sort_order ?? null,
          body.data.is_active ?? null,
        ]
      );
      const updated = res.rows[0];
      if (updated) {
        await appendCrudAudit(
          client as Parameters<typeof appendCrudAudit>[0],
          user.uuid,
          "compliance.required_document_type.updated",
          { entityId: updated.id, operatingCompanyId: body.data.operating_company_id }
        );
      }
      return updated;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send({ required_document_type: row });
  });
}
