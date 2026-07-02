import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { requireDriverSession } from "../driver/auth.js";
import {
  deliverDriverProfileMessage,
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
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function officeAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerDriversMessagesRoutes(app: FastifyInstance) {
  app.get("/api/v1/drivers/messages/inbox", async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const conversations = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      listOfficeInbox(client, query.data.operating_company_id)
    );
    return reply.send({ conversations });
  });

  app.get("/api/v1/drivers/messages/unread", async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const messages = await withCompanyScope(authUser.uuid, query.data.operating_company_id, (client) =>
      listUnreadMessages(client, query.data.operating_company_id)
    );
    return reply.send({ messages, unread_count: messages.length });
  });

  app.get("/api/v1/drivers/messages/:driverId/thread", async (req, reply) => {
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

  app.patch("/api/v1/drivers/messages/:messageId/read", async (req, reply) => {
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

  app.get("/api/v1/driver/messages", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver!;
    const messages = await withCurrentUser(req.user!.uuid, async (client) => {
      const companyRes = await client.query<{ operating_company_id: string }>(
        `SELECT operating_company_id::text FROM mdata.drivers WHERE id = $1`,
        [driver.id]
      );
      const operatingCompanyId = companyRes.rows[0]?.operating_company_id;
      if (operatingCompanyId) {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      }
      return listDriverPwaMessages(client as Queryable, driver.id);
    });
    return reply.send({ driver_id: driver.id, messages });
  });

  app.post("/api/v1/driver/messages", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const body = replyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    const driver = req.driver!;
    const userId = req.user!.uuid;
    const message = await withCurrentUser(userId, async (client) => {
      const companyRes = await client.query<{ operating_company_id: string }>(
        `SELECT operating_company_id::text FROM mdata.drivers WHERE id = $1`,
        [driver.id]
      );
      const operatingCompanyId = companyRes.rows[0]?.operating_company_id;
      if (!operatingCompanyId) throw new Error("driver_company_missing");
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
  });

  app.patch("/api/v1/driver/messages/:messageId/read", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = messageParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const driver = req.driver!;
    const userId = req.user!.uuid;
    const message = await withCurrentUser(userId, async (client) => {
      const companyRes = await client.query<{ operating_company_id: string }>(
        `SELECT operating_company_id::text FROM mdata.drivers WHERE id = $1`,
        [driver.id]
      );
      const operatingCompanyId = companyRes.rows[0]?.operating_company_id;
      if (!operatingCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      return markMessageRead(client as Queryable, params.data.messageId, operatingCompanyId, userId);
    });
    if (!message) return reply.code(404).send({ error: "not_found" });
    return reply.send({ message });
  });
}

export { deliverDriverProfileMessage };
