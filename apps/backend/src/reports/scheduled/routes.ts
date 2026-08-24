import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { Q8_DEFAULT_REPORT_SLUGS } from "./cadence.js";
import {
  createSubscription,
  deactivateSubscription,
  listDeliveryLog,
  listSubscriptions,
  updateSubscription,
} from "./subscription.service.js";

const uuidParamsSchema = z.object({ uuid: z.string().uuid() });

const subscriptionBodySchema = z.object({
  report_slug: z.enum(Q8_DEFAULT_REPORT_SLUGS),
  cadence: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  day_of_week: z.coerce.number().int().min(0).max(6).optional().nullable(),
  day_of_month: z.coerce.number().int().min(1).max(31).optional().nullable(),
  time_of_day: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/),
  timezone: z.string().trim().min(1).optional().default("America/Chicago"),
  recipient_emails: z.array(z.string().email()).min(1),
  recipient_user_uuids: z.array(z.string().uuid()).optional().nullable(),
  delivery_format: z.enum(["pdf", "xlsx", "html"]).optional().default("pdf"),
});

const updateBodySchema = subscriptionBodySchema.partial();

const deliveryLogQuerySchema = companyQuerySchema.extend({
  subscription_uuid: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

function requireOwner(user: { role: string }, reply: FastifyReply): boolean {
  if (String(user.role ?? "") !== "Owner") {
    void reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

// GAP43-SUBSCRIPTIONS-500-ON-EXPECTED-STATE: updateSubscription/deactivateSubscription throw a plain
// Error() for an ordinary business condition (the row was already deleted, or already inactive) —
// with no try/catch at the call site, Fastify's default handler turned that into an uncaught 500
// Internal Server Error. Live-confirmed on prod: deactivating an already-inactive subscription
// returned `{"statusCode":500,...,"message":"scheduled_subscription_not_found_or_already_inactive"}`,
// which the frontend surfaced as a generic "Deactivate failed" toast — indistinguishable from a real
// server fault. Neither condition is a server fault: map the two known service-layer error messages
// to the correct 4xx status instead of letting them fall through to 500.
function replyForSubscriptionError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "scheduled_subscription_not_found_or_already_inactive") {
    return reply.code(409).send({ error: "already_inactive_or_not_found" });
  }
  if (message === "scheduled_subscription_not_found") {
    return reply.code(404).send({ error: "not_found" });
  }
  throw error;
}

export async function registerScheduledSubscriptionRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/scheduled/subscriptions", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await listSubscriptions(query.data.operating_company_id, String(user.uuid));
    return { rows };
  });

  app.post("/api/v1/reports/scheduled/subscriptions", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireOwner(user, reply)) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = subscriptionBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const uuid = await createSubscription(
      {
        operatingCompanyId: query.data.operating_company_id,
        reportSlug: body.data.report_slug,
        cadence: body.data.cadence,
        dayOfWeek: body.data.day_of_week,
        dayOfMonth: body.data.day_of_month,
        timeOfDay: body.data.time_of_day,
        timezone: body.data.timezone,
        recipientEmails: body.data.recipient_emails,
        recipientUserUuids: body.data.recipient_user_uuids,
        deliveryFormat: body.data.delivery_format,
      },
      String(user.uuid)
    );
    return reply.code(201).send({ uuid });
  });

  app.patch("/api/v1/reports/scheduled/subscriptions/:uuid", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireOwner(user, reply)) return;
    const params = uuidParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = updateBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const row = await updateSubscription(
        params.data.uuid,
        query.data.operating_company_id,
        {
          cadence: body.data.cadence,
          dayOfWeek: body.data.day_of_week,
          dayOfMonth: body.data.day_of_month,
          timeOfDay: body.data.time_of_day,
          timezone: body.data.timezone,
          recipientEmails: body.data.recipient_emails,
          recipientUserUuids: body.data.recipient_user_uuids,
          deliveryFormat: body.data.delivery_format,
        },
        String(user.uuid)
      );
      return { row };
    } catch (error) {
      return replyForSubscriptionError(reply, error);
    }
  });

  app.patch(
    "/api/v1/reports/scheduled/subscriptions/:uuid/deactivate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!requireOwner(user, reply)) return;
      const params = uuidParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      try {
        await deactivateSubscription(params.data.uuid, query.data.operating_company_id, String(user.uuid));
        return reply.code(204).send();
      } catch (error) {
        return replyForSubscriptionError(reply, error);
      }
    }
  );

  app.get("/api/v1/reports/scheduled/delivery-log", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = deliveryLogQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await listDeliveryLog(query.data.operating_company_id, String(user.uuid), {
      subscriptionUuid: query.data.subscription_uuid,
      limit: query.data.limit,
    });
    return { rows };
  });
}
