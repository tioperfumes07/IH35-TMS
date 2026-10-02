/** FEED GATE routes (Lead, 2026-10-01). Mounted explicitly from index.ts (driver-finance is not autoloaded). */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { currentAuthUser, validationError } from "../../accounting/shared.js";
import { FeedGateError, closeIntake, getIntake, listIntakes, openAndRunIntake } from "./feed-gate.service.js";

const KIND = z.enum(["settlement", "load", "invoice", "expense", "bill", "fuel_import", "deposit", "bill_payment"]);
const RL = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

function sendGateError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, error: unknown) {
  if (error instanceof FeedGateError) return reply.code(error.code === "feed_gate_subject_not_found" || error.code === "feed_gate_intake_not_found" ? 404 : 409).send({ error: error.code, message: error.message, details: error.details ?? null });
  throw error;
}

export async function registerFeedGateRoutes(app: FastifyInstance) {
  app.get("/api/v1/feed-gate/intakes", RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid(), limit: z.coerce.number().int().min(1).max(500).optional() }).safeParse(req.query);
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return reply.send({ intakes: await listIntakes(user.uuid, q.data.operating_company_id, q.data.limit ?? 100) });
  });

  app.get("/api/v1/feed-gate/intakes/:intakeId", RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = z.object({ intakeId: z.string().uuid() }).safeParse(req.params);
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query);
    if (!p.success) return validationError(reply, p.error);
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    try { return reply.send(await getIntake(user.uuid, q.data.operating_company_id, p.data.intakeId)); } catch (e) { return sendGateError(reply, e); }
  });

  // Open (or reuse) the intake for a subject and run every check now. Idempotent; each call appends a WORM run.
  app.post("/api/v1/feed-gate/run", RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = z.object({ operating_company_id: z.string().uuid(), feed_kind: KIND, subject_id: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try { return reply.send(await openAndRunIntake(user.uuid, body.data.operating_company_id, body.data.feed_kind, body.data.subject_id)); } catch (e) { return sendGateError(reply, e); }
  });

  app.post("/api/v1/feed-gate/intakes/:intakeId/close", RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = z.object({ intakeId: z.string().uuid() }).safeParse(req.params);
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body);
    if (!p.success) return validationError(reply, p.error);
    if (!body.success) return validationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try { return reply.send({ intake: await closeIntake(user.uuid, body.data.operating_company_id, p.data.intakeId) }); } catch (e) { return sendGateError(reply, e); }
  });
}
