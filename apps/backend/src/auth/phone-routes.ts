import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withLuciaBypass } from "./db.js";
import { lucia } from "./lucia.js";
import { setLuciaSessionCookie } from "./session-cookie-policy.js";
import { checkVerification, startVerification, type TwilioChannel } from "./twilio-verify.js";

const startBodySchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/, "phone must be E.164 format (e.g., +19565550001)"),
  channel: z.enum(["whatsapp", "sms"]).optional().default("whatsapp"),
});

const verifyBodySchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/),
  code: z.string().regex(/^\d{4,8}$/),
  returnTo: z.string().url().optional(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}

async function appendOutboxTrailEvent(
  eventType: "twilio.sms.send" | "twilio.whatsapp.send",
  payload: Record<string, unknown>
) {
  await withLuciaBypass(async (client) => {
    await client.query(
      `
        INSERT INTO outbox.events (event_type, payload, next_retry_at)
        VALUES ($1, $2::jsonb, now())
      `,
      [eventType, JSON.stringify(payload)]
    );
  });
}

export async function registerPhoneAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/phone/start", async (req, reply) => {
    const parsed = startBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const { phone, channel } = parsed.data;
    const userExists = await withLuciaBypass(async (client) => {
      const res = await client.query<{ id: string; deactivated_at: string | null }>(
        `SELECT id, deactivated_at FROM identity.users WHERE phone = $1 LIMIT 1`,
        [phone]
      );
      return res.rows[0] ?? null;
    });

    if (!userExists || userExists.deactivated_at) {
      return reply.code(200).send({
        ok: true,
        channel,
        message: "If this phone is registered, a code was sent.",
      });
    }

    try {
      const result = await startVerification(phone, channel as TwilioChannel);
      try {
        await appendOutboxTrailEvent(result.channel === "sms" ? "twilio.sms.send" : "twilio.whatsapp.send", {
          phone_masked: maskPhone(phone),
          channel: result.channel,
          twilio_sid: result.sid,
          source: "auth.phone.start",
        });
      } catch (outboxError) {
        req.log.warn({ err: outboxError }, "Failed to append outbox trail event for phone start");
      }
      await withLuciaBypass(async (client) => {
        await appendCrudAudit(
          client,
          userExists.id,
          "auth.phone.verification_started",
          {
            phone_masked: maskPhone(phone),
            channel: result.channel,
            twilio_sid: result.sid,
            user_id: userExists.id,
          },
          "info",
          "BT-1-AUTH-DRIVER"
        );
      });
      return reply.code(200).send({ ok: true, channel: result.channel, message: "Code sent" });
    } catch (err) {
      const errorMessage = (err as Error).message ?? "unknown";
      if (channel === "whatsapp" && errorMessage.includes("twilio_send_failed")) {
        try {
          const fallback = await startVerification(phone, "sms");
          try {
            await appendOutboxTrailEvent("twilio.sms.send", {
              phone_masked: maskPhone(phone),
              channel: "sms",
              twilio_sid: fallback.sid,
              source: "auth.phone.start.fallback",
              previous_error: errorMessage,
            });
          } catch (outboxError) {
            req.log.warn({ err: outboxError }, "Failed to append outbox trail event for fallback SMS");
          }
          await withLuciaBypass(async (client) => {
            await appendCrudAudit(
              client,
              userExists.id,
              "auth.phone.verification_fallback_sms",
              {
                phone_masked: maskPhone(phone),
                original_channel: "whatsapp",
                fallback_channel: "sms",
                twilio_sid: fallback.sid,
                user_id: userExists.id,
                error: errorMessage,
              },
              "warning",
              "BT-1-AUTH-DRIVER"
            );
          });
          return reply.code(200).send({
            ok: true,
            channel: "sms",
            message: "WhatsApp delivery failed, code sent via SMS",
          });
        } catch {
          return reply.code(503).send({
            error: "verification_send_failed_all_channels",
            message: "Could not send code via WhatsApp or SMS",
          });
        }
      }
      return reply.code(503).send({ error: "verification_send_failed", message: errorMessage });
    }
  });

  app.post("/api/v1/auth/phone/verify", async (req, reply) => {
    const parsed = verifyBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const { phone, code } = parsed.data;
    try {
      const checkResult = await checkVerification(phone, code);
      if (!checkResult.valid) {
        return reply.code(401).send({ error: "invalid_code" });
      }
    } catch (err) {
      return reply.code(503).send({ error: "verification_check_failed", message: (err as Error).message });
    }

    const user = await withLuciaBypass(async (client) => {
      const res = await client.query<{ id: string; email: string | null; role: string; deactivated_at: string | null }>(
        `SELECT id, email, role, deactivated_at FROM identity.users WHERE phone = $1 LIMIT 1`,
        [phone]
      );
      return res.rows[0] ?? null;
    });

    if (!user) return reply.code(404).send({ error: "user_not_found_for_phone" });
    if (user.deactivated_at) return reply.code(403).send({ error: "user_deactivated" });

    await withLuciaBypass(async (client) => {
      await client.query(`UPDATE identity.users SET auth_phone_verified_at = now() WHERE id = $1`, [user.id]);
      const syncedDrivers = await client.query<{ id: string }>(
        `
          UPDATE mdata.drivers
          SET phone = $2
          WHERE identity_user_id = $1
            AND phone IS DISTINCT FROM $2
          RETURNING id
        `,
        [user.id, phone]
      );
      await appendCrudAudit(
        client,
        user.id,
        "auth.phone.verified",
        {
          phone_masked: maskPhone(phone),
          user_id: user.id,
          role: user.role,
        },
        "info",
        "BT-1-AUTH-DRIVER"
      );
      if (syncedDrivers.rows.length > 0) {
        await appendCrudAudit(
          client,
          user.id,
          "mdata.drivers.phone_synced_from_auth_verify",
          {
            resource_type: "mdata.drivers",
            driver_ids: syncedDrivers.rows.map((row) => row.id),
            synced_phone_masked: maskPhone(phone),
            source: "auth.phone.verify",
          },
          "info",
          "BT-1-AUTH-DRIVER"
        );
      }
    });

    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    setLuciaSessionCookie(reply, sessionCookie);
    return reply.code(200).send({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
      session: { id: session.id },
    });
  });
}
