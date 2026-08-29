import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { requireAuth } from "../auth/session-middleware.js";
import { lookupCarrierByMC, lookupCarrierByUSDOT } from "../lib/fmcsa-client.js";

const LOOKUP_ROLES = ["Owner", "Administrator", "Manager", "Dispatcher", "Safety", "Accountant"];
const LINK_ROLES = ["Owner", "Administrator", "Manager", "Safety"];

const lookupBodySchema = z.object({
  type: z.enum(["usdot", "mc"]),
  value: z.string().trim().min(1).max(40),
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  operating_company_id: z.string().uuid(),
});

const linkParamsSchema = z.object({ id: z.string().uuid() });
const linkBodySchema = z.object({
  lookup_id: z.string().uuid(),
  operating_company_id: z.string().uuid(),
});

type AuthUser = { uuid: string; role: string };

function currentAuthUser(req: FastifyRequest, reply: FastifyReply): AuthUser | null {
  if (!requireAuth(req, reply)) return reply;
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

// LST-F05 (2026-07-25): this file used to define its OWN resolveOperatingCompanyId here, shadowing the
// canonical one, with the inline `SELECT default … UNION SELECT any accessible … ORDER BY id LIMIT 1`
// fallback. The UNION put the user's DEFAULT company and every accessible company on equal footing and
// then took the LOWEST UUID, losing the default — and USMCA (5c854333…) sorts below TRANSP (91e0bf0a…),
// so a TRANSP user's FMCSA lookup was attributed to USMCA and cached under the wrong entity.
//
// load-cancellation-reasons and void-cancel-reasons were repointed at the canonical resolver earlier; this
// third route was missed because the local copy has the SAME NAME, so a grep for resolveOperatingCompanyId
// showed call sites and read as already-fixed. The canonical resolver does COALESCE(default, lowest) and
// validates membership (403 on a foreign id rather than a silent empty list).
//
// The local definition is deleted; the import below is the canonical one.

export async function registerFmcsaRoutes(app: FastifyInstance) {
  app.post("/api/v1/catalogs/fmcsa/lookup", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!ensureRole(reply, authUser.role, LOOKUP_ROLES)) return;

    const parsedBody = lookupBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const lookupType = parsedBody.data.type;
    const lookupValue = normalizeLookupValue(lookupType, parsedBody.data.value);
    if (!lookupValue) return reply.code(400).send({ error: "lookup_value_invalid" });

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      // LST-F05: use shared resolver (default company first) — never UNION…ORDER BY id LIMIT 1.
      const operatingCompanyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedBody.data.operating_company_id ?? null
      );
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
          WHERE operating_company_id = $1::uuid
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

  app.post("/api/v1/mdata/customers/:id/fmcsa-link", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!ensureRole(reply, authUser.role, LINK_ROLES)) return;

    const parsedParams = linkParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = linkBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedBody.data.operating_company_id
      );
      if (!operatingCompanyId) return null;
      const lookupRes = await client.query(
        `
          SELECT id, authority_status
          FROM catalogs.fmcsa_lookups
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [parsedBody.data.lookup_id, operatingCompanyId]
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
            AND operating_company_id = $5::uuid
          RETURNING id, fmcsa_verified_at, fmcsa_lookup_id, fmcsa_authority_status_at_verification
        `,
        [parsedParams.data.id, lookup.id, lookup.authority_status, authUser.uuid, operatingCompanyId]
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

  app.get("/api/v1/catalogs/fmcsa/lookups", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!ensureRole(reply, authUser.role, LOOKUP_ROLES)) return;

    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const listed = await withCurrentUser(authUser.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id ?? null
      );
      if (!operatingCompanyId) return { rows: [], total: 0 };

      const totalRes = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM catalogs.fmcsa_lookups WHERE operating_company_id = $1::uuid`,
        [operatingCompanyId]
      );

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
          WHERE operating_company_id = $1::uuid
          ORDER BY created_at DESC, id ASC
          LIMIT $2
          OFFSET $3
        `,
        [operatingCompanyId, parsedQuery.data.limit, parsedQuery.data.offset]
      );
      return { rows: res.rows, total: Number(totalRes.rows[0]?.total ?? 0) };
    });

    return reply.send({
      lookups: listed.rows,
      total: listed.total,
      limit: parsedQuery.data.limit,
      offset: parsedQuery.data.offset,
      has_more: parsedQuery.data.offset + listed.rows.length < listed.total,
    });
  });
}
