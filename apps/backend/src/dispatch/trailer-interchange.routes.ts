// GO-21 dispatch defect register, section A1 (owner direct instruction 2026-09-02).
// "Backend service + endpoints: attach an interchange trailer to a load, record receipt, record
// return, upload the signed agreement." Data + backend only — CC-3 owns the wizard UI.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  TrailerInterchangeError,
  attachInterchangeAgreement,
  attachInterchangeTrailerToLoad,
  createNonOwnedTrailer,
  recordInterchangeReceipt,
  recordInterchangeReturn,
  voidTrailerInterchange,
  type DbClient,
} from "./trailer-interchange.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const createTrailerBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  trailer_number: z.string().trim().min(1),
  trailer_type: z.string().trim().max(80).optional().nullable(),
  plate_number: z.string().trim().max(20).optional().nullable(),
  plate_state: z.string().trim().max(4).optional().nullable(),
  vin: z.string().trim().max(32).optional().nullable(),
  counterparty_type: z.enum(["customer", "vendor"]),
  counterparty_id: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const attachBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid(),
  non_owned_trailer_id: z.string().uuid(),
});

const receiptBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  received_from: z.string().trim().min(1),
  received_at: z.string().datetime().optional(),
  condition_in: z.string().trim().max(2000).optional().nullable(),
});

const returnBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  returned_at: z.string().datetime().optional(),
  condition_out: z.string().trim().max(2000).optional().nullable(),
});

const agreementBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  agreement_document_id: z.string().uuid(),
});

const voidBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(1),
});

const listQuerySchema = companyQuerySchema.extend({
  load_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function mapTrailerInterchangeHttpError(error: unknown) {
  if (error instanceof TrailerInterchangeError) {
    if (error.code.endsWith("_not_found")) return { statusCode: 404 as const, body: { error: error.code } };
    return { statusCode: 409 as const, body: { error: error.code, message: error.message } };
  }
  return null;
}

export async function registerTrailerInterchangeRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/dispatch/non-owned-trailers",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        client.query(
          `
            SELECT t.*,
                   CASE WHEN t.counterparty_type = 'customer' THEN c.customer_name ELSE v.vendor_name END AS counterparty_name
              FROM dispatch.non_owned_trailers t
              LEFT JOIN mdata.customers c ON c.id = t.counterparty_id AND t.counterparty_type = 'customer'
              LEFT JOIN mdata.vendors v ON v.id = t.counterparty_id AND t.counterparty_type = 'vendor'
             WHERE t.operating_company_id = $1::uuid AND t.voided_at IS NULL
             ORDER BY t.created_at DESC
          `,
          [query.data.operating_company_id]
        )
      );
      return { rows: rows.rows };
    }
  );

  app.post(
    "/api/v1/dispatch/non-owned-trailers",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const body = createTrailerBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          createNonOwnedTrailer(client, { ...body.data, created_by_user_id: user.uuid })
        );
        return result;
      } catch (error) {
        const mapped = mapTrailerInterchangeHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );

  app.get(
    "/api/v1/dispatch/trailer-interchanges",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const query = listQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) => {
        const filters = ["ti.operating_company_id = $1::uuid", "ti.voided_at IS NULL"];
        const values: unknown[] = [query.data.operating_company_id];
        if (query.data.load_id) {
          values.push(query.data.load_id);
          filters.push(`ti.load_id = $${values.length}::uuid`);
        }
        values.push(query.data.limit, query.data.offset);
        const limitParam = values.length - 1;
        const offsetParam = values.length;
        return client.query(
          `
            SELECT ti.*, l.load_number, nt.trailer_number, nt.trailer_type, nt.counterparty_type, nt.counterparty_id
              FROM dispatch.trailer_interchanges ti
              JOIN mdata.loads l ON l.id = ti.load_id
              JOIN dispatch.non_owned_trailers nt ON nt.id = ti.non_owned_trailer_id
             WHERE ${filters.join(" AND ")}
             ORDER BY ti.created_at DESC
             LIMIT $${limitParam} OFFSET $${offsetParam}
          `,
          values
        );
      });
      return { rows: rows.rows };
    }
  );

  app.post(
    "/api/v1/dispatch/trailer-interchanges",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const body = attachBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          attachInterchangeTrailerToLoad(client, { ...body.data, created_by_user_id: user.uuid })
        );
        return result;
      } catch (error) {
        const mapped = mapTrailerInterchangeHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );

  app.post(
    "/api/v1/dispatch/trailer-interchanges/:id/receive",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = receiptBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          recordInterchangeReceipt(client, {
            operating_company_id: body.data.operating_company_id,
            interchange_id: params.data.id,
            received_from: body.data.received_from,
            received_at: body.data.received_at,
            condition_in: body.data.condition_in,
            actor_user_id: user.uuid,
          })
        );
        return result;
      } catch (error) {
        const mapped = mapTrailerInterchangeHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );

  app.post(
    "/api/v1/dispatch/trailer-interchanges/:id/return",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = returnBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          recordInterchangeReturn(client, {
            operating_company_id: body.data.operating_company_id,
            interchange_id: params.data.id,
            returned_at: body.data.returned_at,
            condition_out: body.data.condition_out,
            actor_user_id: user.uuid,
          })
        );
        return result;
      } catch (error) {
        const mapped = mapTrailerInterchangeHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );

  app.post(
    "/api/v1/dispatch/trailer-interchanges/:id/agreement",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = agreementBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          attachInterchangeAgreement(client, {
            operating_company_id: body.data.operating_company_id,
            interchange_id: params.data.id,
            agreement_document_id: body.data.agreement_document_id,
            actor_user_id: user.uuid,
          })
        );
        return result;
      } catch (error) {
        const mapped = mapTrailerInterchangeHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );

  app.post(
    "/api/v1/dispatch/trailer-interchanges/:id/void",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = voidBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          voidTrailerInterchange(client, {
            operating_company_id: body.data.operating_company_id,
            interchange_id: params.data.id,
            reason: body.data.reason,
            actor_user_id: user.uuid,
          })
        );
        return result;
      } catch (error) {
        const mapped = mapTrailerInterchangeHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );
}
