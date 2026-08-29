import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { requireDriverSession } from "../driver/auth.js";
import {
  assertDriverActingCompany,
  deliverDriverProfileMessage,
  DriverMessagePersistenceError,
  insertDriverReply,
  listDriverMessageThread,
  listDriverPwaMessages,
  listOfficeInbox,
  listUnreadMessages,
  markMessageRead,
} from "./messages.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const driverParamsSchema = z.object({ driverId: z.string().uuid() });
const messageParamsSchema = z.object({ messageId: z.string().uuid() });
const replyBodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  // DRV-F6179 — optional: which company thread this reply belongs to. Omitted = the driver's home
  // company (unchanged prior behavior). When present, must be the home company or an active
  // canonical authorization (assertDriverActingCompany) — a shared driver replying to an
  // authorized-company thread no longer silently misroutes into their home-company inbox.
  operating_company_id: z.string().uuid().optional(),
});
// DRV-F6179 — same optional-company contract as replyBodySchema, for the PWA mark-read route.
const pwaReadQuerySchema = z.object({ operating_company_id: z.string().uuid().optional() });

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function officeAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await assertCompanyMembership(client, userId, operatingCompanyId);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerDriversMessagesRoutes(app: FastifyInstance) {
  app.get("/api/v1/drivers/messages/inbox", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const conversations = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      listOfficeInbox(client, query.data.operating_company_id)
    );
    return reply.send({ conversations });
  });

  app.get("/api/v1/drivers/messages/unread", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const messages = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      listUnreadMessages(client, query.data.operating_company_id)
    );
    return reply.send({ messages, unread_count: messages.length });
  });

  app.get("/api/v1/drivers/messages/:driverId/thread", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const messages = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      listDriverMessageThread(client, query.data.operating_company_id, params.data.driverId)
    );
    return reply.send({ driver_id: params.data.driverId, messages });
  });

  app.patch("/api/v1/drivers/messages/:messageId/read", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const params = messageParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const message = await withCompanyScope(authUser.uuid, query.data.operating_company_id, async (client) => {
      const updated = await markMessageRead(client, params.data.messageId, query.data.operating_company_id, authUser.uuid);
      if (updated) {
        await appendCrudAudit(client, authUser.uuid, "mdata.driver_profile_message.read", {
          resource_type: "mdata.driver_profile_messages",
          resource_id: params.data.messageId,
          operating_company_id: query.data.operating_company_id,
        });
      }
      return updated;
    });
    if (!message) return reply.code(404).send({ error: "not_found" });
    return reply.send({ message });
  });

  app.get("/api/v1/driver/messages", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver!;
    const messages = await withLuciaBypass(async (client) => {
      // The authenticated driver id is principal-derived. The service binds every returned
      // message to that exact id and to either the driver's home company or an active canonical
      // company authorization, so the bypass cannot widen this read to another driver/company.
      return listDriverPwaMessages(client as Queryable, driver.id);
    }, { actorUserId: req.user!.uuid });
    return reply.send({ driver_id: driver.id, messages });
  });

  app.post("/api/v1/driver/messages", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const body = replyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    const driver = req.driver!;
    const userId = req.user!.uuid;
    try {
      const message = await withCurrentUser(userId, async (client) => {
        let operatingCompanyId: string;
        if (body.data.operating_company_id) {
          // DRV-F6179 — the caller named a target company (e.g. replying in an authorized-company
          // thread). Validate it's the driver's home company or an active canonical authorization
          // before honoring it — never trust a caller-supplied company id outright.
          await assertDriverActingCompany(client as Queryable, driver.id, body.data.operating_company_id);
          operatingCompanyId = body.data.operating_company_id;
        } else {
          const companyRes = await client.query<{ operating_company_id: string }>(
            `SELECT operating_company_id::text FROM mdata.drivers WHERE id = $1`,
            [driver.id]
          );
          const homeCompanyId = companyRes.rows[0]?.operating_company_id;
          if (!homeCompanyId) throw new Error("driver_company_missing");
          operatingCompanyId = homeCompanyId;
        }
        // membership-scope-exempt: principal-derived, and (when caller-supplied) explicitly
        // authorization-checked above via assertDriverActingCompany.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
        const created = await insertDriverReply(client as Queryable, {
          operatingCompanyId,
          driverId: driver.id,
          driverUserId: userId,
          message: body.data.message,
        });
        await appendCrudAudit(client, userId, "mdata.driver_profile_message.driver_reply", {
          resource_type: "mdata.driver_profile_messages",
          resource_id: created.id,
          operating_company_id: operatingCompanyId,
          driver_id: driver.id,
        });
        return created;
      });
      return reply.code(201).send({ message });
    } catch (err) {
      if ((err as Error).message === "driver_company_not_authorized") {
        return reply.code(403).send({ error: "driver_company_not_authorized" });
      }
      if (err instanceof DriverMessagePersistenceError) {
        return reply.code(409).send({ error: err.message, operation: err.operation });
      }
      throw err;
    }
  });

  app.patch("/api/v1/driver/messages/:messageId/read", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = messageParamsSchema.safeParse(req.params ?? {});
    const query = pwaReadQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const driver = req.driver!;
    const userId = req.user!.uuid;
    try {
      const message = await withCurrentUser(userId, async (client) => {
        let operatingCompanyId: string;
        if (query.data.operating_company_id) {
          // DRV-F6179 — same validated-target-company path as the reply route above.
          await assertDriverActingCompany(client as Queryable, driver.id, query.data.operating_company_id);
          operatingCompanyId = query.data.operating_company_id;
        } else {
          const companyRes = await client.query<{ operating_company_id: string }>(
            `SELECT operating_company_id::text FROM mdata.drivers WHERE id = $1`,
            [driver.id]
          );
          const homeCompanyId = companyRes.rows[0]?.operating_company_id;
          if (!homeCompanyId) return null;
          operatingCompanyId = homeCompanyId;
        }
        // membership-scope-exempt: principal-derived, and (when caller-supplied) explicitly
        // authorization-checked above via assertDriverActingCompany.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
        return markMessageRead(client as Queryable, params.data.messageId, operatingCompanyId, userId);
      });
      if (!message) return reply.code(404).send({ error: "not_found" });
      return reply.send({ message });
    } catch (err) {
      if ((err as Error).message === "driver_company_not_authorized") {
        return reply.code(403).send({ error: "driver_company_not_authorized" });
      }
      throw err;
    }
  });
}

export { deliverDriverProfileMessage };
