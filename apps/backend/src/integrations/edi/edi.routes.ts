import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { addEdiPartner, listPartners, testConnection } from "./setup.service.js";
import { handleInbound204 } from "./transactions/inbound-204.handler.js";
import { buildX12214 } from "./transactions/outbound-214.builder.js";
import { buildX12210 } from "./transactions/outbound-210.builder.js";
import { buildX12990 } from "./transactions/outbound-990.builder.js";
import { getPartnerByUuid } from "./setup.service.js";

const partnerBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  partner_name: z.string().trim().min(1),
  isa_qualifier: z.string().trim().min(1),
  isa_id: z.string().trim().min(1),
  gs_qualifier: z.string().trim().min(1),
  gs_id: z.string().trim().min(1),
  connection_type: z.enum(["as2", "ftp", "sftp", "api"]),
  connection_config: z.record(z.string(), z.unknown()).default({}),
  supported_transactions: z.array(z.string()).optional(),
});

const inboundBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  partner_uuid: z.string().uuid(),
  payload: z.string().min(1),
  customer_id: z.string().uuid().optional(),
});

const messagesQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  partner_uuid: z.string().uuid().optional(),
  status: z.string().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

export async function registerEdiRoutes(app: FastifyInstance) {
  app.post("/api/integrations/edi/partners", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = partnerBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    const uuid = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      return addEdiPartner(client, body.data);
    });
    return reply.send({ uuid });
  });

  app.get("/api/integrations/edi/partners", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });

    const partners = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      return listPartners(client, q.data.operating_company_id);
    });
    return reply.send({ partners });
  });

  app.post("/api/integrations/edi/partners/:uuid/test-connection", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ uuid: z.string().uuid() }).safeParse(req.params);
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query);
    if (!params.success || !q.success) return reply.code(400).send({ error: "invalid_request" });

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      return testConnection(client, q.data.operating_company_id, params.data.uuid);
    });
    return reply.send(result);
  });

  app.get("/api/integrations/edi/messages", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = messagesQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });

    const messages = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      const values: unknown[] = [q.data.operating_company_id];
      let sql = `
        SELECT uuid, partner_uuid, transaction_type, direction, control_number,
               status, error_message, related_load_uuid, received_at::text, processed_at::text
        FROM integrations.edi_messages
        WHERE operating_company_id = $1
      `;
      if (q.data.partner_uuid) {
        values.push(q.data.partner_uuid);
        sql += ` AND partner_uuid = $${values.length}`;
      }
      if (q.data.status) {
        values.push(q.data.status);
        sql += ` AND status = $${values.length}`;
      }
      sql += ` ORDER BY received_at DESC LIMIT 200`;
      const res = await client.query(sql, values);
      return res.rows;
    });
    return reply.send({ messages });
  });

  app.post("/api/integrations/edi/inbound", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = inboundBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const handled = await handleInbound204(client, {
        operating_company_id: body.data.operating_company_id,
        partner_uuid: body.data.partner_uuid,
        raw_payload: body.data.payload,
      });

      if (handled.status === "processed" && body.data.customer_id && !handled.load_uuid) {
        const { createDraftLoadFrom204 } = await import("./transactions/inbound-204.handler.js");
        const loadId = await createDraftLoadFrom204(client, {
          operating_company_id: body.data.operating_company_id,
          parsed: handled.parsed,
          customer_id: body.data.customer_id,
        });
        return { ...handled, load_uuid: loadId };
      }

      if (handled.status === "processed") {
        const partner = await getPartnerByUuid(client, body.data.operating_company_id, body.data.partner_uuid);
        if (partner) {
          const controlNumber = `990${Date.now()}`;
          const acceptance = buildX12990({
            isa_id: partner.isa_id,
            gs_id: partner.gs_id,
            control_number: controlNumber,
            tender_ref: handled.parsed.broker_ref ?? controlNumber,
            accepted: true,
            response_date: new Date().toISOString(),
          });
          await client.query(
            `
              INSERT INTO integrations.edi_messages (
                operating_company_id, partner_uuid, transaction_type, direction,
                control_number, payload, status, processed_at
              )
              VALUES ($1, $2, '990', 'outbound', $3, $4, 'sent', now())
            `,
            [body.data.operating_company_id, body.data.partner_uuid, controlNumber, acceptance]
          );
        }
      }

      return handled;
    });
    return reply.send(result);
  });

  app.post("/api/integrations/edi/build/214", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        partner_uuid: z.string().uuid(),
        load_ref: z.string(),
        status: z.enum(["assigned", "in_transit", "at_pickup", "departed_pickup", "at_delivery", "delivered"]),
        status_at: z.string(),
        city: z.string().optional(),
        state: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const partner = await getPartnerByUuid(client, body.data.operating_company_id, body.data.partner_uuid);
      if (!partner) throw new Error("partner_not_found");
      const controlNumber = `214${Date.now()}`;
      const x12 = buildX12214({
        isa_id: partner.isa_id,
        gs_id: partner.gs_id,
        control_number: controlNumber,
        load_ref: body.data.load_ref,
        status: body.data.status,
        status_at: body.data.status_at,
        city: body.data.city,
        state: body.data.state,
      });
      await client.query(
        `
          INSERT INTO integrations.edi_messages (
            operating_company_id, partner_uuid, transaction_type, direction,
            control_number, payload, status, processed_at
          )
          VALUES ($1, $2, '214', 'outbound', $3, $4, 'sent', now())
        `,
        [body.data.operating_company_id, body.data.partner_uuid, controlNumber, x12]
      );
      return { control_number: controlNumber, payload: x12 };
    });
    return reply.send(payload);
  });

  app.post("/api/integrations/edi/build/210", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        partner_uuid: z.string().uuid(),
        invoice_number: z.string(),
        load_ref: z.string(),
        amount_cents: z.number().int().nonnegative(),
        invoice_date: z.string(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body" });

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const partner = await getPartnerByUuid(client, body.data.operating_company_id, body.data.partner_uuid);
      if (!partner) throw new Error("partner_not_found");
      const controlNumber = `210${Date.now()}`;
      const x12 = buildX12210({
        isa_id: partner.isa_id,
        gs_id: partner.gs_id,
        control_number: controlNumber,
        invoice_number: body.data.invoice_number,
        load_ref: body.data.load_ref,
        amount_cents: body.data.amount_cents,
        invoice_date: body.data.invoice_date,
      });
      await client.query(
        `
          INSERT INTO integrations.edi_messages (
            operating_company_id, partner_uuid, transaction_type, direction,
            control_number, payload, status, processed_at
          )
          VALUES ($1, $2, '210', 'outbound', $3, $4, 'sent', now())
        `,
        [body.data.operating_company_id, body.data.partner_uuid, controlNumber, x12]
      );
      return { control_number: controlNumber, payload: x12 };
    });
    return reply.send(payload);
  });
}
