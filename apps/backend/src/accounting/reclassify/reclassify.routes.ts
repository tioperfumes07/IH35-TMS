/** Reclassify Transactions — routes (Lead 2026-10-01, QBO spec §24). Owner / Administrator / Accountant only. */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { currentAuthUser, validationError } from "../shared.js";
import { getAccountBalances } from "../account-balances.service.js";
import { applyReclassify, findReclassifyLines, getReclassifyBatchLines, listReclassifyBatches, undoReclassifyBatch } from "./reclassify.service.js";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
function canReclassify(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}
const csv = (v: unknown) => (typeof v === "string" && v.trim() ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

export async function registerAccountingReclassifyRoutes(app: FastifyInstance) {
  // LEFT PANE: chart of accounts with the period activity per account (QBO: tree with period balances)
  app.get("/api/v1/accounting/reclassify/accounts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });
    const q = z.object({ operating_company_id: z.string().uuid(), from_date: DATE, to_date: DATE }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const report = await getAccountBalances({ userId: user.uuid, operating_company_id: q.data.operating_company_id, as_of_date: q.data.to_date, from_date: q.data.from_date });
    return reply.send({ from_date: q.data.from_date, to_date: q.data.to_date, accounts: report.accounts });
  });

  // RESULT GRID: GL lines matching the filters, with live count + net sum of the whole match set
  app.get("/api/v1/accounting/reclassify/lines", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });
    const q = z.object({
      operating_company_id: z.string().uuid(), from_date: DATE, to_date: DATE,
      account_ids: z.string().optional(), source_types: z.string().optional(), class_id: z.string().uuid().optional(), entity_uuid: z.string().uuid().optional(),
      search: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(500).optional(), offset: z.coerce.number().int().min(0).optional(),
    }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const out = await findReclassifyLines(user.uuid, { ...q.data, account_ids: csv(q.data.account_ids), source_types: csv(q.data.source_types) });
    return reply.send(out);
  });

  // APPLY: one batch, one RECLASSIFICATION JE per document, audit per document
  app.post("/api/v1/accounting/reclassify/apply", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = z.object({
      operating_company_id: z.string().uuid(),
      posting_ids: z.array(z.string().uuid()).min(1).max(500),
      reason: z.string().trim().min(3).max(1000),
      to_account_id: z.string().uuid().nullable().optional(),
      to_class_id: z.string().uuid().nullable().optional(),
      to_entity_uuid: z.string().uuid().nullable().optional(),
      to_entity_type: z.enum(["customer", "vendor", "driver", "unit"]).nullable().optional(),
      filter_snapshot: z.record(z.string(), z.unknown()).optional(),
    }).safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await applyReclassify(body.data, { userId: user.uuid, role: user.role });
      return reply.code(201).send(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.startsWith("reclassify_")) return reply.code(400).send({ error: msg });
      throw error;
    }
  });

  app.get("/api/v1/accounting/reclassify/batches", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });
    const q = z.object({ operating_company_id: z.string().uuid(), limit: z.coerce.number().int().min(1).max(200).optional() }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return reply.send({ batches: await listReclassifyBatches(user.uuid, q.data.operating_company_id, q.data.limit ?? 50) });
  });

  app.get("/api/v1/accounting/reclassify/batches/:batchId/lines", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });
    const p = z.object({ batchId: z.string().uuid() }).safeParse(req.params ?? {});
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!p.success) return validationError(reply, p.error);
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return reply.send({ lines: await getReclassifyBatchLines(user.uuid, q.data.operating_company_id, p.data.batchId) });
  });

  // UNDO per batch: reverse every reclass JE (linked reversals), restore document lines
  app.post("/api/v1/accounting/reclassify/batches/:batchId/undo", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canReclassify(user.role)) return reply.code(403).send({ error: "forbidden" });
    const p = z.object({ batchId: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid(), reason: z.string().trim().min(3).max(1000) }).safeParse(req.body ?? {});
    if (!p.success) return validationError(reply, p.error);
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      return reply.send(await undoReclassifyBatch({ operating_company_id: body.data.operating_company_id, batch_id: p.data.batchId, reason: body.data.reason }, { userId: user.uuid, role: user.role }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.startsWith("reclassify_")) return reply.code(400).send({ error: msg });
      throw error;
    }
  });
}

export default fp(async (app) => {
  await registerAccountingReclassifyRoutes(app);
}, { name: "accounting.registerAccountingReclassifyRoutes" });
