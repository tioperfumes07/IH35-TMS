import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverPushSubscriptionRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/push-subscription", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 512) : null;

    try {
      await withCurrentUser(user.uuid, async (client) => {
        const companyRes = await client.query<{ operating_company_id: string | null }>(
          `SELECT operating_company_id FROM mdata.drivers WHERE id = $1 LIMIT 1`,
          [driver.id]
        );
        const operatingCompanyId = companyRes.rows[0]?.operating_company_id ?? null;
        if (!operatingCompanyId) throw new Error("driver_company_missing");

        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

        await client.query(
          `
            INSERT INTO driver_pwa.push_subscriptions (
              operating_company_id, driver_id, endpoint, p256dh_key, auth_key, user_agent, last_active_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, now())
            ON CONFLICT (endpoint) DO UPDATE SET
              operating_company_id = EXCLUDED.operating_company_id,
              driver_id = EXCLUDED.driver_id,
              p256dh_key = EXCLUDED.p256dh_key,
              auth_key = EXCLUDED.auth_key,
              user_agent = EXCLUDED.user_agent,
              last_active_at = now()
          `,
          [
            operatingCompanyId,
            driver.id,
            parsed.data.endpoint,
            parsed.data.keys.p256dh,
            parsed.data.keys.auth,
            ua,
          ]
        );
      });
    } catch (err) {
      const msg = String((err as Error).message ?? "");
      if (msg.includes("driver_company_missing")) return reply.code(404).send({ error: "driver_company_not_found" });
      throw err;
    }

    return reply.code(204).send();
  });
}
