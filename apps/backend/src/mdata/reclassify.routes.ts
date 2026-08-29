import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { requireAuth } from "../auth/session-middleware.js";

// ── Schemas ───────────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });

const historyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const reclassifyBodySchema = z.object({
  classification: z.string().trim().min(1).max(200),
  qbo_id: z.string().trim().max(200).optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
  operating_company_id: z.string().uuid().optional(),
});

const flagDuplicateBodySchema = z.object({
  merge_target_id: z.string().uuid().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
  operating_company_id: z.string().uuid().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function canReclassify(role: string) {
  const r = String(role || "").toLowerCase();
  return ["owner", "administrator", "manager", "accountant"].includes(r);
}

function sendValidation(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

// ── Route registration ────────────────────────────────────────────────────────
export async function registerReclassifyRoutes(app: FastifyInstance) {

  // POST /api/v1/customers/:id/reclassify
  // Rate-limited (CodeQL js/missing-rate-limiting). 30/min for a state-changing POST; the plugin is
  // global:false, so an un-configured route had NO limit at all. Pre-existing, surfaced by this PR.
  app.post("/api/v1/customers/:id/reclassify", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return sendValidation(reply, params.error);
    const body = reclassifyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidation(reply, body.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      const companyId = body.data.operating_company_id;

      // ENTITY-SCOPED RESOLVER. The row's own operating_company_id is what the membership assert and
      // the pinned UPDATE below are derived from, so this read cannot be scoped by a caller-supplied
      // company — that is the untrusted input MDATA-F08 was about. It IS scoped to the companies the
      // CALLER actually belongs to, which does two things: it satisfies the entity-predicate contract
      // (verify-steps/84) with a real predicate rather than a baseline waiver, and it closes an
      // existence oracle — previously a caller could tell "no such id" (404) from "exists in another
      // entity" (403) and enumerate ids across entities. Now both are 404.
      const beforeRes = await client.query(
        `SELECT entity_classification, qbo_classification_ref, operating_company_id::text AS row_company_id
           FROM mdata.customers
          WHERE id = $1
            AND operating_company_id IN (
              SELECT uca.company_id
                FROM org.user_company_access uca
                JOIN org.companies c ON c.id = uca.company_id AND c.deactivated_at IS NULL
               WHERE uca.user_id = $2::uuid
                 AND uca.deactivated_at IS NULL
            )
          LIMIT 1`,
        [params.data.id, user.uuid]
      );
      if (!beforeRes.rows.length) return { notFound: true };
      const before = beforeRes.rows[0] as Record<string, unknown>;

      // CROSS-ENTITY WRITE GATE. companyId comes from the REQUEST BODY, is optional, and was never
      // validated — and the UPDATE did not use it as a predicate at all, so any customer in any
      // entity could be reclassified by id. The entity is DERIVED from the row itself and asserted
      // here (resolver pattern, MDATA-F03); the UPDATE is then pinned to that same company so the
      // read and the write cannot disagree. Throws 403 forbidden_company_membership.
      const rowCompanyId = String(before.row_company_id ?? "");
      await assertCompanyMembership(client, user.uuid, rowCompanyId);

      const updateRes = await client.query(
        `UPDATE mdata.customers
         SET entity_classification   = $1,
             qbo_classification_ref  = COALESCE($2, qbo_classification_ref),
             reclassified_at         = now(),
             reclassified_by_user_id = $3
         WHERE id = $4
           AND operating_company_id = $5::uuid
         RETURNING id, entity_classification, qbo_classification_ref, reclassified_at`,
        [body.data.classification, body.data.qbo_id ?? null, user.uuid, params.data.id, rowCompanyId]
      );

      await appendCrudAudit(client, user.uuid, "category.reclassified", {
        resource_type: "mdata.customers",
        resource_id: params.data.id,
        operating_company_id: companyId ?? null,
        classification_before: before.entity_classification ?? null,
        classification_after: body.data.classification,
        qbo_id: body.data.qbo_id ?? null,
        reason: body.data.reason ?? null,
      }, "info", "C4-CUST-VEND-REBUILD-RECLASSIFY");

      await client.query(
        `INSERT INTO mdata.entity_reclassification_log
           (operating_company_id, entity_table, entity_id, action,
            classification_before, classification_after, qbo_id, reason, actor_user_id)
         VALUES ($1, 'mdata.customers', $2, 'reclassify', $3, $4, $5, $6, $7)`,
        [
          companyId ?? null, params.data.id,
          before.entity_classification ?? null, body.data.classification,
          body.data.qbo_id ?? null, body.data.reason ?? null, user.uuid,
        ]
      );

      return { customer: updateRes.rows[0] };
    });

    if (result.notFound) return reply.code(404).send({ error: "customer_not_found" });
    return reply.send(result);
  });

  // POST /api/v1/customers/:id/flag-duplicate
  app.post("/api/v1/customers/:id/flag-duplicate", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return sendValidation(reply, params.error);
    const body = flagDuplicateBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidation(reply, body.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      const companyId = body.data.operating_company_id;
      const action = body.data.merge_target_id !== null ? "flag_duplicate" : "unflag_duplicate";

      const updateRes = await client.query(
        `UPDATE mdata.customers
         SET is_duplicate    = $1,
             merge_target_id = $2,
             updated_at      = now()
         WHERE id = $3
         RETURNING id, is_duplicate, merge_target_id`,
        [body.data.merge_target_id !== null, body.data.merge_target_id ?? null, params.data.id]
      );
      if (!updateRes.rows.length) return { notFound: true };

      await appendCrudAudit(client, user.uuid, `category.${action}`, {
        resource_type: "mdata.customers",
        resource_id: params.data.id,
        operating_company_id: companyId ?? null,
        merge_target_id: body.data.merge_target_id ?? null,
        reason: body.data.reason ?? null,
      }, "info", "C4-CUST-VEND-REBUILD-RECLASSIFY");

      await client.query(
        `INSERT INTO mdata.entity_reclassification_log
           (operating_company_id, entity_table, entity_id, action, reason, actor_user_id)
         VALUES ($1, 'mdata.customers', $2, $3, $4, $5)`,
        [companyId ?? null, params.data.id, action, body.data.reason ?? null, user.uuid]
      );

      return { customer: updateRes.rows[0] };
    });

    if (result.notFound) return reply.code(404).send({ error: "customer_not_found" });
    return reply.send(result);
  });

  // POST /api/v1/vendors/:id/reclassify
  app.post("/api/v1/vendors/:id/reclassify", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return sendValidation(reply, params.error);
    const body = reclassifyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidation(reply, body.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      const companyId = body.data.operating_company_id;

      // ENTITY-SCOPED RESOLVER. The row's own operating_company_id is what the membership assert and
      // the pinned UPDATE below are derived from, so this read cannot be scoped by a caller-supplied
      // company — that is the untrusted input MDATA-F08 was about. It IS scoped to the companies the
      // CALLER actually belongs to, which does two things: it satisfies the entity-predicate contract
      // (verify-steps/84) with a real predicate rather than a baseline waiver, and it closes an
      // existence oracle — previously a caller could tell "no such id" (404) from "exists in another
      // entity" (403) and enumerate ids across entities. Now both are 404.
      const beforeRes = await client.query(
        `SELECT entity_classification, qbo_classification_ref, operating_company_id::text AS row_company_id
           FROM mdata.vendors
          WHERE id = $1
            AND operating_company_id IN (
              SELECT uca.company_id
                FROM org.user_company_access uca
                JOIN org.companies c ON c.id = uca.company_id AND c.deactivated_at IS NULL
               WHERE uca.user_id = $2::uuid
                 AND uca.deactivated_at IS NULL
            )
          LIMIT 1`,
        [params.data.id, user.uuid]
      );
      if (!beforeRes.rows.length) return { notFound: true };
      const before = beforeRes.rows[0] as Record<string, unknown>;

      // CROSS-ENTITY WRITE GATE. companyId comes from the REQUEST BODY, is optional, and was never
      // validated — and the UPDATE did not use it as a predicate at all, so any vendor in any
      // entity could be reclassified by id. The entity is DERIVED from the row itself and asserted
      // here (resolver pattern, MDATA-F03); the UPDATE is then pinned to that same company so the
      // read and the write cannot disagree. Throws 403 forbidden_company_membership.
      const rowCompanyId = String(before.row_company_id ?? "");
      await assertCompanyMembership(client, user.uuid, rowCompanyId);

      const updateRes = await client.query(
        `UPDATE mdata.vendors
         SET entity_classification   = $1,
             qbo_classification_ref  = COALESCE($2, qbo_classification_ref),
             reclassified_at         = now(),
             reclassified_by_user_id = $3
         WHERE id = $4
           AND operating_company_id = $5::uuid
         RETURNING id, entity_classification, qbo_classification_ref, reclassified_at`,
        [body.data.classification, body.data.qbo_id ?? null, user.uuid, params.data.id, rowCompanyId]
      );

      await appendCrudAudit(client, user.uuid, "category.reclassified", {
        resource_type: "mdata.vendors",
        resource_id: params.data.id,
        operating_company_id: companyId ?? null,
        classification_before: before.entity_classification ?? null,
        classification_after: body.data.classification,
        qbo_id: body.data.qbo_id ?? null,
        reason: body.data.reason ?? null,
      }, "info", "C4-CUST-VEND-REBUILD-RECLASSIFY");

      await client.query(
        `INSERT INTO mdata.entity_reclassification_log
           (operating_company_id, entity_table, entity_id, action,
            classification_before, classification_after, qbo_id, reason, actor_user_id)
         VALUES ($1, 'mdata.vendors', $2, 'reclassify', $3, $4, $5, $6, $7)`,
        [
          companyId ?? null, params.data.id,
          before.entity_classification ?? null, body.data.classification,
          body.data.qbo_id ?? null, body.data.reason ?? null, user.uuid,
        ]
      );

      return { vendor: updateRes.rows[0] };
    });

    if (result.notFound) return reply.code(404).send({ error: "vendor_not_found" });
    return reply.send(result);
  });

  // POST /api/v1/vendors/:id/flag-duplicate
  app.post("/api/v1/vendors/:id/flag-duplicate", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return sendValidation(reply, params.error);
    const body = flagDuplicateBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidation(reply, body.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      const companyId = body.data.operating_company_id;
      const action = body.data.merge_target_id !== null ? "flag_duplicate" : "unflag_duplicate";

      const updateRes = await client.query(
        `UPDATE mdata.vendors
         SET is_duplicate    = $1,
             merge_target_id = $2,
             updated_at      = now()
         WHERE id = $3
         RETURNING id, is_duplicate, merge_target_id`,
        [body.data.merge_target_id !== null, body.data.merge_target_id ?? null, params.data.id]
      );
      if (!updateRes.rows.length) return { notFound: true };

      await appendCrudAudit(client, user.uuid, `category.${action}`, {
        resource_type: "mdata.vendors",
        resource_id: params.data.id,
        operating_company_id: companyId ?? null,
        merge_target_id: body.data.merge_target_id ?? null,
        reason: body.data.reason ?? null,
      }, "info", "C4-CUST-VEND-REBUILD-RECLASSIFY");

      await client.query(
        `INSERT INTO mdata.entity_reclassification_log
           (operating_company_id, entity_table, entity_id, action, reason, actor_user_id)
         VALUES ($1, 'mdata.vendors', $2, $3, $4, $5)`,
        [companyId ?? null, params.data.id, action, body.data.reason ?? null, user.uuid]
      );

      return { vendor: updateRes.rows[0] };
    });

    if (result.notFound) return reply.code(404).send({ error: "vendor_not_found" });
    return reply.send(result);
  });

  // GET /api/v1/customers/:id/reclassification-history
  app.get("/api/v1/customers/:id/reclassification-history", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return sendValidation(reply, params.error);
    const query = historyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidation(reply, query.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const companyId = await resolveOperatingCompanyId(
        client,
        user.uuid,
        query.data.operating_company_id
      );
      if (!companyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      const res = await client.query(
        `SELECT l.id, l.action, l.classification_before, l.classification_after,
                l.qbo_id, l.reason, l.actor_user_id, l.occurred_at
           FROM mdata.get_customer_same_company($1::uuid, $2::uuid) c
           JOIN mdata.entity_reclassification_log l
             ON l.entity_id = c.id
            AND l.entity_table = 'mdata.customers'
            AND (l.operating_company_id = $2::uuid OR l.operating_company_id IS NULL)
          ORDER BY l.occurred_at DESC
          LIMIT 100`,
        [params.data.id, companyId]
      );
      return res.rows;
    });

    if (!rows) return reply.code(400).send({ error: "operating_company_id_required" });
    return reply.send({ history: rows });
  });

  // GET /api/v1/vendors/:id/reclassification-history
  app.get("/api/v1/vendors/:id/reclassification-history", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return sendValidation(reply, params.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `SELECT id, action, classification_before, classification_after,
                qbo_id, reason, actor_user_id, occurred_at
         FROM mdata.entity_reclassification_log
         WHERE entity_table = 'mdata.vendors' AND entity_id = $1
         ORDER BY occurred_at DESC LIMIT 100`,
        [params.data.id]
      );
      return res.rows;
    });

    return reply.send({ history: rows });
  });
}
