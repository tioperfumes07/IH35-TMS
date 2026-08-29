import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";

// ORPH-003 — mdata/vendor_payment_methods.routes.ts (migration 202613110000, verify-step 4449).
//
// Replaces apps/frontend/src/pages/Vendors.tsx's buildAchDisplay() notes-text "ach" heuristic with
// structured payment-method records, per docs/specs/CURSOR-AUDIT-2026-07-15/modules/15-CUSTOMERS-VENDORS.md
// §5 item 5. See the migration file header for the CANONICAL-CHECK rationale (distinct from
// driver_finance.driver_payment_methods -- opposite money-flow direction, opposite party type) and the
// account_mask security posture (masked last-4 only, DB-enforced -- never a full account/routing number).
//
// Write access mirrors the migration's RLS write policy exactly: Owner/Administrator only (narrower than
// the Manager/Accountant write band used elsewhere in mdata, because this table records how money leaves
// the company).

const PAYMENT_METHOD_SELECT_COLUMNS = `
  id,
  operating_company_id,
  vendor_id,
  method_type,
  bank_name,
  account_mask,
  is_primary,
  notes,
  created_by_user_id,
  created_at,
  updated_at,
  deactivated_at,
  void_reason,
  voided_by_user_id
`;

const idParamSchema = z.object({ id: z.string().uuid() });
const methodParamSchema = z.object({ id: z.string().uuid(), methodId: z.string().uuid() });
const detailQuerySchema = z.object({ operating_company_id: z.string().uuid() });

const createPaymentMethodBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  method_type: z.enum(["ach", "check", "wire", "other"]),
  bank_name: z.string().trim().max(200).optional(),
  // Last 4 digits (or any short masked reference) only -- mirrors the DB CHECK constraint
  // (length <= 4, not a 5+ digit number). Reject earlier here so the caller gets a field error
  // instead of a raw 23514 constraint-violation.
  account_mask: z
    .string()
    .trim()
    .max(4)
    .regex(/^(?!\d{5,}$).*$/, "must be a masked reference (last 4 digits), never a full account number")
    .optional(),
  is_primary: z.boolean().optional().default(false),
  notes: z.string().trim().max(2000).optional(),
});

const updatePaymentMethodBodySchema = z
  .object({
    method_type: z.enum(["ach", "check", "wire", "other"]).optional(),
    bank_name: z.string().trim().max(200).nullable().optional(),
    account_mask: z
      .string()
      .trim()
      .max(4)
      .regex(/^(?!\d{5,}$).*$/, "must be a masked reference (last 4 digits), never a full account number")
      .nullable()
      .optional(),
    is_primary: z.boolean().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const voidPaymentMethodBodySchema = z.object({
  void_reason: z.string().trim().min(1).max(500),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

// Narrower than mdata's usual Manager/Accountant write band -- matches the migration's RLS write
// policy exactly (identity.current_user_role() = ANY(['Owner','Administrator'])). A broader app-layer
// role here would let a Manager pass validation only to hit a raw RLS-denied 0-row UPDATE at the DB.
function isPaymentMethodWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

async function assertVendorInCompany(
  authUserId: string,
  operatingCompanyId: string,
  vendorId: string
): Promise<boolean> {
  return withCurrentUser(authUserId, async (client) => {
    await setScopedCompanyContext(client, authUserId, operatingCompanyId);
    const res = await client.query(
      `SELECT id FROM mdata.vendors WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [vendorId, operatingCompanyId]
    );
    return res.rows.length > 0;
  });
}

export async function registerVendorPaymentMethodRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/mdata/vendors/:id/payment-methods",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
      const parsedQuery = detailQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

      try {
        const rows = await withCurrentUser(authUser.uuid, async (client) => {
          await setScopedCompanyContext(client, authUser.uuid, parsedQuery.data.operating_company_id);
          const res = await client.query(
            `
              SELECT ${PAYMENT_METHOD_SELECT_COLUMNS}
              FROM mdata.vendor_payment_methods
              WHERE vendor_id = $1
                AND operating_company_id = $2::uuid
                AND deactivated_at IS NULL
              ORDER BY is_primary DESC, created_at DESC
            `,
            [parsedParams.data.id, parsedQuery.data.operating_company_id]
          );
          return res.rows;
        });
        return { payment_methods: rows };
      } catch (err) {
        if ((err as Error).message === "forbidden_company_membership") {
          return reply.code(403).send({ error: "forbidden_company_membership" });
        }
        throw err;
      }
    }
  );

  app.post(
    "/api/v1/mdata/vendors/:id/payment-methods",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!isPaymentMethodWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
      const parsedBody = createPaymentMethodBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
      const b = parsedBody.data;

      if (!(await assertVendorInCompany(authUser.uuid, b.operating_company_id, parsedParams.data.id))) {
        return reply.code(404).send({ error: "mdata_vendor_not_found" });
      }

      try {
        const created = await withCurrentUser(authUser.uuid, async (client) => {
          await setScopedCompanyContext(client, authUser.uuid, b.operating_company_id);
          const res = await client.query(
            `
              INSERT INTO mdata.vendor_payment_methods
                (operating_company_id, vendor_id, method_type, bank_name, account_mask, is_primary, notes, created_by_user_id)
              VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
              RETURNING ${PAYMENT_METHOD_SELECT_COLUMNS}
            `,
            [
              b.operating_company_id,
              parsedParams.data.id,
              b.method_type,
              b.bank_name ?? null,
              b.account_mask ?? null,
              b.is_primary,
              b.notes ?? null,
              authUser.uuid,
            ]
          );
          const row = res.rows[0];
          await appendCrudAudit(client, authUser.uuid, "mdata.vendor_payment_methods.created", {
            resource_id: row.id,
            resource_type: "mdata.vendor_payment_methods",
            vendor_id: row.vendor_id,
            method_type: row.method_type,
            is_primary: row.is_primary,
          });
          return row;
        });
        return reply.code(201).send(created);
      } catch (err) {
        if ((err as Error).message === "forbidden_company_membership") {
          return reply.code(403).send({ error: "forbidden_company_membership" });
        }
        // 23514 = the DB CHECK constraint's own last-line defense against a full account/routing number.
        if ((err as { code?: string }).code === "23514") {
          return reply.code(422).send({
            error: "mdata_vendor_payment_method_mask_rejected",
            message: "account_mask must be a masked reference (last 4 digits), never a full account number",
          });
        }
        // 23505 = the one-primary-per-vendor partial unique index.
        if ((err as { code?: string }).code === "23505") {
          return reply.code(409).send({ error: "mdata_vendor_payment_method_primary_conflict" });
        }
        throw err;
      }
    }
  );

  app.patch(
    "/api/v1/mdata/vendors/:id/payment-methods/:methodId",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!isPaymentMethodWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = methodParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
      const parsedQuery = detailQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
      const parsedBody = updatePaymentMethodBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
      const b = parsedBody.data;

      const setParts: string[] = [];
      const values: unknown[] = [];
      const add = (col: string, val: unknown) => {
        values.push(val);
        setParts.push(`${col} = $${values.length}`);
      };
      if ("method_type" in b) add("method_type", b.method_type);
      if ("bank_name" in b) add("bank_name", b.bank_name ?? null);
      if ("account_mask" in b) add("account_mask", b.account_mask ?? null);
      if ("is_primary" in b) add("is_primary", b.is_primary);
      if ("notes" in b) add("notes", b.notes ?? null);
      add("updated_at", new Date().toISOString());

      values.push(parsedParams.data.methodId, parsedParams.data.id, parsedQuery.data.operating_company_id);
      const methodIdIdx = values.length - 2;
      const vendorIdIdx = values.length - 1;
      const opcoIdx = values.length;

      try {
        const updated = await withCurrentUser(authUser.uuid, async (client) => {
          await setScopedCompanyContext(client, authUser.uuid, parsedQuery.data.operating_company_id);
          const res = await client.query(
            `
              UPDATE mdata.vendor_payment_methods
              SET ${setParts.join(", ")}
              WHERE id = $${methodIdIdx}
                AND vendor_id = $${vendorIdIdx}
                AND operating_company_id = $${opcoIdx}::uuid
                AND deactivated_at IS NULL
              RETURNING ${PAYMENT_METHOD_SELECT_COLUMNS}
            `,
            values
          );
          const row = res.rows[0] ?? null;
          if (!row) return null;
          await appendCrudAudit(client, authUser.uuid, "mdata.vendor_payment_methods.updated", {
            resource_id: row.id,
            resource_type: "mdata.vendor_payment_methods",
            vendor_id: row.vendor_id,
          });
          return row;
        });
        if (!updated) return reply.code(404).send({ error: "mdata_vendor_payment_method_not_found" });
        return updated;
      } catch (err) {
        if ((err as Error).message === "forbidden_company_membership") {
          return reply.code(403).send({ error: "forbidden_company_membership" });
        }
        if ((err as { code?: string }).code === "23514") {
          return reply.code(422).send({
            error: "mdata_vendor_payment_method_mask_rejected",
            message: "account_mask must be a masked reference (last 4 digits), never a full account number",
          });
        }
        if ((err as { code?: string }).code === "23505") {
          return reply.code(409).send({ error: "mdata_vendor_payment_method_primary_conflict" });
        }
        throw err;
      }
    }
  );

  // void-not-delete: no DELETE route exists (grants revoke DELETE at the DB layer too).
  app.post(
    "/api/v1/mdata/vendors/:id/payment-methods/:methodId/void",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!isPaymentMethodWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = methodParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
      const parsedQuery = detailQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
      const parsedBody = voidPaymentMethodBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

      try {
        const voided = await withCurrentUser(authUser.uuid, async (client) => {
          await setScopedCompanyContext(client, authUser.uuid, parsedQuery.data.operating_company_id);
          const res = await client.query(
            `
              UPDATE mdata.vendor_payment_methods
              SET deactivated_at = now(),
                  void_reason = $4,
                  voided_by_user_id = $5,
                  is_primary = false
              WHERE id = $1
                AND vendor_id = $2
                AND operating_company_id = $3::uuid
                AND deactivated_at IS NULL
              RETURNING ${PAYMENT_METHOD_SELECT_COLUMNS}
            `,
            [
              parsedParams.data.methodId,
              parsedParams.data.id,
              parsedQuery.data.operating_company_id,
              parsedBody.data.void_reason,
              authUser.uuid,
            ]
          );
          const row = res.rows[0] ?? null;
          if (!row) return null;
          await appendCrudAudit(client, authUser.uuid, "mdata.vendor_payment_methods.voided", {
            resource_id: row.id,
            resource_type: "mdata.vendor_payment_methods",
            vendor_id: row.vendor_id,
            void_reason: row.void_reason,
          });
          return row;
        });
        if (!voided) return reply.code(404).send({ error: "mdata_vendor_payment_method_not_found" });
        return voided;
      } catch (err) {
        if ((err as Error).message === "forbidden_company_membership") {
          return reply.code(403).send({ error: "forbidden_company_membership" });
        }
        throw err;
      }
    }
  );
}
