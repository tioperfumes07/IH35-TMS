import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { lookupCarrierByMC, lookupCarrierByUSDOT } from "../lib/fmcsa-client.js";

const LOOKUP_ROLES = ["Owner", "Administrator", "Manager", "Dispatcher", "Safety", "Accountant"];
const LINK_ROLES = ["Owner", "Administrator", "Manager", "Safety"];

const lookupBodySchema = z.object({
  type: z.enum(["usdot", "mc"]),
  value: z.string().trim().min(1).max(40),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const linkParamsSchema = z.object({ id: z.string().uuid() });
const linkBodySchema = z.object({ lookup_id: z.string().uuid() });

type AuthUser = { uuid: string; role: string };

function currentAuthUser(req: FastifyRequest, reply: FastifyReply): AuthUser | null {
  if (!requireAuth(req, reply)) return null;
  return req.user as AuthUser;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function normalizeLookupValue(type: "usdot" | "mc", value: string) {
  const trimmed = value.trim();
  if (type === "mc") return trimmed.replace(/^MC[-\s]*/i, "");
  return trimmed.replace(/[^\d]/g, "");
}

function ensureRole(reply: FastifyReply, role: string, allowed: string[]) {
  if (!allowed.includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

async function resolveOperatingCompanyId(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  userId: string
) {
  const res = await client.query(
    `
      SELECT c.id
      FROM identity.users u
      JOIN org.companies c ON c.id = u.default_company_id
      WHERE u.id = $1
        AND c.deactivated_at IS NULL
      UNION
      SELECT c.id
      FROM org.companies c
      WHERE c.id IN (SELECT org.user_accessible_company_ids())
      ORDER BY id
      LIMIT 1
    `,
    [userId]
  );
  return res.rows[0]?.id ?? null;
}

export async function registerFmcsaRoutes(app: FastifyInstance) {
  app.post("/api/v1/catalogs/fmcsa/lookup", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!ensureRole(reply, authUser.role, LOOKUP_ROLES)) return;

    const parsedBody = lookupBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const lookupType = parsedBody.data.type;
    const lookupValue = normalizeLookupValue(lookupType, parsedBody.data.value);
    if (!lookupValue) return reply.code(400).send({ error: "lookup_value_invalid" });

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(client, authUser.uuid);
      if (!operatingCompanyId) throw new Error("operating_company_not_found");

      const cached = await client.query(
        `
          SELECT
            id,
            lookup_type,
            lookup_value,
            legal_name,
            dba_name,
            usdot_number,
            mc_number,
            address_line1,
            city,
            state,
            zip,
            phone,
            authority_status,
            insurance_status,
            safety_rating,
            fetched_at,
            cached_until
          FROM catalogs.fmcsa_lookups
          WHERE operating_company_id = $1
            AND lookup_type = $2
            AND lookup_value = $3
            AND cached_until > now()
          ORDER BY fetched_at DESC
          LIMIT 1
        `,
        [operatingCompanyId, lookupType, lookupValue]
      );

      if (cached.rows[0]) {
        return {
          lookup_id: cached.rows[0].id as string,
          cached: true,
          ...cached.rows[0],
        };
      }

      const carrier = lookupType === "usdot" ? await lookupCarrierByUSDOT(lookupValue) : await lookupCarrierByMC(lookupValue);
      if (!carrier) return null;

      const inserted = await client.query(
        `
          INSERT INTO catalogs.fmcsa_lookups (
            operating_company_id,
            lookup_type,
            lookup_value,
            legal_name,
            dba_name,
            usdot_number,
            mc_number,
            address_line1,
            city,
            state,
            zip,
            phone,
            authority_status,
            insurance_status,
            safety_rating,
            raw_response_json,
            fetched_at,
            cached_until,
            created_by_user_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16::jsonb, now(), now() + interval '7 days', $17
          )
          RETURNING
            id,
            lookup_type,
            lookup_value,
            legal_name,
            dba_name,
            usdot_number,
            mc_number,
            address_line1,
            city,
            state,
            zip,
            phone,
            authority_status,
            insurance_status,
            safety_rating,
            fetched_at,
            cached_until
        `,
        [
          operatingCompanyId,
          lookupType,
          lookupValue,
          carrier.legal_name,
          carrier.dba_name,
          carrier.usdot_number,
          carrier.mc_number,
          carrier.address.line1,
          carrier.address.city,
          carrier.address.state,
          carrier.address.zip,
          carrier.phone,
          carrier.authority_status,
          carrier.insurance_status,
          carrier.safety_rating,
          JSON.stringify(carrier.raw ?? {}),
          authUser.uuid,
        ]
      );

      await appendCrudAudit(
        client,
        authUser.uuid,
        "catalogs.fmcsa_lookup.executed",
        {
          resource_id: inserted.rows[0].id,
          resource_type: "catalogs.fmcsa_lookups",
          lookup_type: lookupType,
          lookup_value: lookupValue,
          authority_status: carrier.authority_status,
        },
        "info",
        "BT-2-FMCSA-VERIFICATION"
      );

      return {
        lookup_id: inserted.rows[0].id as string,
        cached: false,
        ...inserted.rows[0],
      };
    });

    if (!result) return reply.code(404).send({ error: "fmcsa_carrier_not_found" });
    return reply.send(result);
  });

  app.post("/api/v1/mdata/customers/:id/fmcsa-link", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!ensureRole(reply, authUser.role, LINK_ROLES)) return;

    const parsedParams = linkParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = linkBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const lookupRes = await client.query(
        `
          SELECT id, authority_status
          FROM catalogs.fmcsa_lookups
          WHERE id = $1
          LIMIT 1
        `,
        [parsedBody.data.lookup_id]
      );
      const lookup = lookupRes.rows[0];
      if (!lookup) return null;

      const customerRes = await client.query(
        `
          UPDATE mdata.customers
          SET
            fmcsa_verified_at = now(),
            fmcsa_lookup_id = $2,
            fmcsa_authority_status_at_verification = $3,
            updated_by_user_id = $4
          WHERE id = $1
          RETURNING id, fmcsa_verified_at, fmcsa_lookup_id, fmcsa_authority_status_at_verification
        `,
        [parsedParams.data.id, lookup.id, lookup.authority_status, authUser.uuid]
      );

      const customer = customerRes.rows[0];
      if (!customer) return null;

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.customer.fmcsa_verified",
        {
          resource_id: customer.id,
          resource_type: "mdata.customers",
          customer_id: customer.id,
          lookup_id: lookup.id,
          authority_status: lookup.authority_status,
        },
        "info",
        "BT-2-FMCSA-VERIFICATION"
      );

      return customer;
    });

    if (!updated) return reply.code(404).send({ error: "mdata_customer_or_lookup_not_found" });
    return reply.send({ customer: updated });
  });

  app.get("/api/v1/catalogs/fmcsa/lookups", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!ensureRole(reply, authUser.role, LOOKUP_ROLES)) return;

    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const lookups = await withCurrentUser(authUser.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(client, authUser.uuid);
      if (!operatingCompanyId) return [];

      const res = await client.query(
        `
          SELECT
            id,
            lookup_type,
            lookup_value,
            legal_name,
            dba_name,
            usdot_number,
            mc_number,
            address_line1,
            city,
            state,
            zip,
            phone,
            authority_status,
            insurance_status,
            safety_rating,
            fetched_at,
            cached_until,
            created_at,
            created_by_user_id
          FROM catalogs.fmcsa_lookups
          WHERE operating_company_id = $1
          ORDER BY created_at DESC
          LIMIT $2
          OFFSET $3
        `,
        [operatingCompanyId, parsedQuery.data.limit, parsedQuery.data.offset]
      );
      return res.rows;
    });

    return reply.send({ lookups });
  });
}
