import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import {
  createFuelCardAssignment,
  endFuelCardAssignment,
  listFuelCardAssignments,
  resolveUnitByCard,
  voidFuelCardAssignment,
} from "./fuel-card-assignments.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const listQuery = companyQuery.extend({
  unit_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  card_last_digits: z.string().regex(/^[0-9]{4,6}$/).optional(),
  include_voided: z.enum(["true", "false"]).optional(),
});
const resolveQuery = companyQuery.extend({ card: z.string().min(4).max(40), at: z.string().datetime({ offset: true }) });
const createBody = z.object({
  card_last_digits: z.string().regex(/^[0-9]{4,6}$/, "last 4-6 digits only — never a full card number"),
  unit_id: z.string().uuid(),
  driver_id: z.string().uuid().nullable().optional(),
  fuel_card_type_id: z.string().uuid().nullable().optional(),
  effective_from: z.string().datetime({ offset: true }),
  effective_to: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
const endBody = z.object({ effective_to: z.string().datetime({ offset: true }) });
const voidBody = z.object({ reason: z.string().trim().min(3).max(500) });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client as unknown as DbClient);
  });
}

/** Which truck a card fuels decides whose fuel, and whose overage deduction, a fill becomes — accounting roles only. */
function requireCardWriteRole(reply: FastifyReply, role: string) {
  if (!canVoidCancel(role)) {
    reply.code(403).send({ error: "forbidden", detail: "changing a fuel card's truck requires Owner, Administrator or Accountant" });
    return false;
  }
  return true;
}

/** Trigger refusals (same-company, overlap) are the caller's input, not a server fault. */
function mapDbError(reply: FastifyReply, err: unknown) {
  const e = err as { code?: string; message?: string };
  if (e?.code === "23514" || e?.code === "23P01") return reply.code(e.code === "23P01" ? 409 : 400).send({ error: "refused", detail: e.message });
  throw err;
}

/** E-22 addition — card -> truck registry. Forward: card list; reverse: ?unit_id= / ?driver_id=. */
export async function registerFuelCardAssignmentRoutes(app: FastifyInstance) {
  app.get("/api/v1/fuel/card-assignments", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = listQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const rows = await withCompany(user.uuid, q.data.operating_company_id, (client) =>
      listFuelCardAssignments(client, q.data.operating_company_id, {
        unit_id: q.data.unit_id,
        driver_id: q.data.driver_id,
        card_last_digits: q.data.card_last_digits,
        include_voided: q.data.include_voided === "true",
      })
    );
    return { rows };
  });

  app.get("/api/v1/fuel/card-assignments/resolve", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = resolveQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    return withCompany(user.uuid, q.data.operating_company_id, (client) => resolveUnitByCard(client, q.data.operating_company_id, q.data.card, q.data.at));
  });

  app.post("/api/v1/fuel/card-assignments", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!requireCardWriteRole(reply, String(user.role ?? ""))) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const b = createBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.flatten() });
    try {
      const row = await withCompany(user.uuid, q.data.operating_company_id, async (client) => {
        const created = await createFuelCardAssignment(client, q.data.operating_company_id, user.uuid, b.data);
        await appendCrudAudit(client, user.uuid, "fuel.card_assignment.created", { operating_company_id: q.data.operating_company_id, assignment_id: created.id, card_last_digits: created.card_last_digits, unit_id: created.unit_id, driver_id: created.driver_id });
        return created;
      });
      return reply.code(201).send(row);
    } catch (err) {
      return mapDbError(reply, err);
    }
  });

  app.post("/api/v1/fuel/card-assignments/:id/end", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!requireCardWriteRole(reply, String(user.role ?? ""))) return;
    const q = companyQuery.safeParse(req.query ?? {});
    const id = z.string().uuid().safeParse((req.params as { id?: string })?.id);
    const b = endBody.safeParse(req.body ?? {});
    if (!q.success || !id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try {
      const row = await withCompany(user.uuid, q.data.operating_company_id, async (client) => {
        const ended = await endFuelCardAssignment(client, q.data.operating_company_id, id.data, b.data.effective_to);
        if (ended) await appendCrudAudit(client, user.uuid, "fuel.card_assignment.ended", { operating_company_id: q.data.operating_company_id, assignment_id: id.data, effective_to: b.data.effective_to });
        return ended;
      });
      if (!row) return reply.code(404).send({ error: "not_found_or_not_open" });
      return row;
    } catch (err) {
      return mapDbError(reply, err);
    }
  });

  app.post("/api/v1/fuel/card-assignments/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!requireCardWriteRole(reply, String(user.role ?? ""))) return;
    const q = companyQuery.safeParse(req.query ?? {});
    const id = z.string().uuid().safeParse((req.params as { id?: string })?.id);
    const b = voidBody.safeParse(req.body ?? {});
    if (!q.success || !id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    const row = await withCompany(user.uuid, q.data.operating_company_id, async (client) => {
      const voided = await voidFuelCardAssignment(client, q.data.operating_company_id, id.data, user.uuid, b.data.reason);
      if (voided) await appendCrudAudit(client, user.uuid, "fuel.card_assignment.voided", { operating_company_id: q.data.operating_company_id, assignment_id: id.data, reason: b.data.reason });
      return voided;
    });
    if (!row) return reply.code(404).send({ error: "not_found_or_already_voided" });
    return row;
  });
}
