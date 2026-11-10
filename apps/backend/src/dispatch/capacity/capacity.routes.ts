/**
 * CAPACITY ENGINE routes (spec 11-10-2026-Claude-Lead-CAPACITY-ENGINE-SPEC).
 *   GET  /api/v1/dispatch/capacity                    — Available Trucks screen (rows + switch + boards + audience count)
 *   GET  /api/v1/dispatch/capacity/preview            — "Preview today's email": the exact plan + rendered email, sends nothing
 *   PUT  /api/v1/dispatch/capacity/units/:unitId/offer — turn one truck's offer on / off (off = override-reason catalog)
 *   PUT  /api/v1/dispatch/capacity/settings           — the company switch (Owner only) + reply-to (Owner/Administrator)
 *   GET/POST /api/v1/public/capacity/unsubscribe?t=   — recipient unsubscribe (HMAC token; POST = RFC 8058 one-click)
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withLuciaBypass } from "../../auth/db.js";
import { currentAuthUser } from "../../accounting/shared.js";
import { withCompanyScope } from "../../accounting/db-scope.js";
import { overrideRefusalStatus, recordOverride } from "../../overrides/record-override.service.js";
import { renderEmailTemplate } from "../../email/render.js";
import { computeCapacity } from "./capacity.service.js";
import {
  buildOfferTemplateVars,
  centralDate,
  listOfferRecipients,
  offerSubject,
  readCapacitySettings,
  readCompanyFooter,
  recordUnsubscribe,
  runCapacityOffers,
  signUnsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
  type OfferKind,
} from "./capacity-offers.service.js";
import { boardStatus, LOAD_BOARDS } from "./load-board-posting.service.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const previewQuery = companyQuery.extend({ kind: z.enum(["morning", "change"]).default("morning") });
const unitParams = z.object({ unitId: z.string().uuid() });
const offerBody = z.object({
  operating_company_id: z.string().uuid(),
  offer_enabled: z.boolean(),
  reason_code: z.string().trim().min(1).max(80).nullable().optional(),
});
const settingsBody = z.object({
  operating_company_id: z.string().uuid(),
  send_truck_offers: z.boolean().optional(),
  reply_to_email: z.string().trim().email().max(254).nullable().optional(),
});

const RL = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

function bad(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

/** What stands between today and a real send — shown on the screen, never hidden. */
function sendBlockers(args: { switchOn: boolean; recipients: number; footerError: string | null }): string[] {
  const out: string[] = [];
  if (!args.switchOn) out.push("The \"Send truck offers\" switch is off — nothing is emailed until the owner turns it on.");
  if (args.recipients === 0) out.push("No customer contact is flagged \"Receives truck offers\" — flag contacts on Customers › Contacts.");
  if (String(process.env.CAPACITY_UNSUBSCRIBE_SECRET ?? "").trim().length < 16) out.push("Server setting CAPACITY_UNSUBSCRIBE_SECRET is not set — the unsubscribe link cannot be signed.");
  if (args.footerError) out.push(args.footerError);
  return out;
}

export async function registerCapacityRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/capacity", RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return reply;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return bad(reply, q.error);
    const companyId = q.data.operating_company_id;
    return withCompanyScope(user.uuid, companyId, async (client) => {
      const [rows, settings, recipients] = await Promise.all([
        computeCapacity(client, companyId),
        readCapacitySettings(client, companyId),
        listOfferRecipients(client, companyId),
      ]);
      return {
        rows,
        settings,
        recipient_count: recipients.length,
        boards: LOAD_BOARDS.map((b) => boardStatus(b)),
        generated_at: new Date().toISOString(),
      };
    });
  });

  app.get("/api/v1/dispatch/capacity/preview", RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return reply;
    const q = previewQuery.safeParse(req.query ?? {});
    if (!q.success) return bad(reply, q.error);
    const companyId = q.data.operating_company_id;
    const kind = q.data.kind as OfferKind;
    return withCompanyScope(user.uuid, companyId, async (client) => {
      const now = new Date();
      const settings = await readCapacitySettings(client, companyId);
      const result = await runCapacityOffers(client, companyId, kind, now, { dryRun: true });
      const plan = result.plan ?? [];
      let footerError: string | null = null;
      let footer: Awaited<ReturnType<typeof readCompanyFooter>> | null = null;
      try {
        footer = await readCompanyFooter(client, companyId);
      } catch {
        footerError = "The company's legal name or address is missing in Company settings — the email footer requires both.";
      }
      const recipientCount = (await listOfferRecipients(client, companyId)).length;
      let unsubLink = "(unsubscribe link is generated per recipient at send time)";
      const emails = plan.map(({ recipient, trucks }) => {
        try { unsubLink = unsubscribeUrl(signUnsubscribeToken(companyId, recipient.email)); } catch { /* reported in blockers */ }
        const subject = offerSubject(footer?.short_name ?? "", trucks, kind, now);
        const html = footer
          ? renderEmailTemplate("capacity-offer", buildOfferTemplateVars({ recipient, trucks, kind, footer, unsubscribeUrl: unsubLink, now })).html
          : null;
        return {
          to: recipient.email,
          contact_name: recipient.contact_name,
          customer_name: recipient.customer_name,
          subject,
          trucks,
          html,
        };
      });
      return {
        kind,
        send_date: centralDate(now),
        switch_on: settings.send_truck_offers,
        recipient_count: recipientCount,
        emails,
        blockers: sendBlockers({ switchOn: settings.send_truck_offers, recipients: recipientCount, footerError }),
      };
    });
  });

  app.put("/api/v1/dispatch/capacity/units/:unitId/offer", RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return reply;
    const p = unitParams.safeParse(req.params ?? {});
    if (!p.success) return bad(reply, p.error);
    const b = offerBody.safeParse(req.body ?? {});
    if (!b.success) return bad(reply, b.error);
    const companyId = b.data.operating_company_id;
    const unitId = p.data.unitId;
    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const unit: { rows: Array<{ id: string }> } = await client.query(
        `SELECT id::text FROM mdata.units WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [unitId, companyId]
      );
      if (!unit.rows[0]) return { status: 404 as const, body: { error: "unit_not_found" } };
      const before: { rows: Array<{ offer_enabled: boolean; off_reason_code: string | null }> } = await client.query(
        `SELECT offer_enabled, off_reason_code FROM dispatch.capacity_unit_offers WHERE operating_company_id = $1::uuid AND unit_id = $2::uuid`,
        [companyId, unitId]
      );
      const prior = before.rows[0] ?? { offer_enabled: true, off_reason_code: null };
      let reasonCode: string | null = null;
      if (!b.data.offer_enabled) {
        // Turning a truck's offer OFF is an override: the reason comes from catalogs.override_reasons (context 'dispatch').
        const ov = await recordOverride(client, {
          operatingCompanyId: companyId,
          context: "dispatch",
          entityType: "dispatch.capacity_unit_offer",
          entityId: unitId,
          reasonCode: b.data.reason_code ?? null,
          actor: { userId: user.uuid, role: String(user.role ?? "") },
          before: prior,
          after: { offer_enabled: false },
        });
        if (!ov.ok) return { status: overrideRefusalStatus(ov.error), body: { error: ov.error } };
        reasonCode = ov.reason_code;
      }
      const saved = await client.query(
        `INSERT INTO dispatch.capacity_unit_offers (operating_company_id, unit_id, offer_enabled, off_reason_code, updated_at, updated_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3, $4, now(), $5::uuid)
         ON CONFLICT (operating_company_id, unit_id) DO UPDATE
           SET offer_enabled = EXCLUDED.offer_enabled, off_reason_code = EXCLUDED.off_reason_code,
               updated_at = now(), updated_by_user_id = EXCLUDED.updated_by_user_id
         RETURNING unit_id::text, offer_enabled, off_reason_code`,
        [companyId, unitId, b.data.offer_enabled, reasonCode, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "dispatch.capacity_unit_offer.updated", {
        resource_id: unitId, resource_type: "dispatch.capacity_unit_offers", operating_company_id: companyId,
        before: prior, after: saved.rows[0],
      }, "info", "CAPACITY-ENGINE");
      return { status: 200 as const, body: { offer: saved.rows[0] } };
    });
    return reply.code(result.status).send(result.body);
  });

  app.put("/api/v1/dispatch/capacity/settings", RL, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return reply;
    const b = settingsBody.safeParse(req.body ?? {});
    if (!b.success) return bad(reply, b.error);
    const role = String(user.role ?? "");
    if (role !== "Owner" && role !== "Administrator") return reply.code(403).send({ error: "forbidden" });
    // The switch that makes the system email customers is the owner's decision.
    if (b.data.send_truck_offers !== undefined && role !== "Owner") return reply.code(403).send({ error: "owner_only_switch" });
    const companyId = b.data.operating_company_id;
    return withCompanyScope(user.uuid, companyId, async (client) => {
      const prior = await readCapacitySettings(client, companyId);
      const next = {
        send_truck_offers: b.data.send_truck_offers ?? prior.send_truck_offers,
        reply_to_email: b.data.reply_to_email !== undefined ? b.data.reply_to_email : prior.reply_to_email,
      };
      const saved = await client.query(
        `INSERT INTO dispatch.capacity_settings (operating_company_id, send_truck_offers, reply_to_email, updated_at, updated_by_user_id)
         VALUES ($1::uuid, $2, $3, now(), $4::uuid)
         ON CONFLICT (operating_company_id) DO UPDATE
           SET send_truck_offers = EXCLUDED.send_truck_offers, reply_to_email = EXCLUDED.reply_to_email,
               updated_at = now(), updated_by_user_id = EXCLUDED.updated_by_user_id
         RETURNING send_truck_offers, reply_to_email`,
        [companyId, next.send_truck_offers, next.reply_to_email, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "dispatch.capacity_settings.updated", {
        resource_id: companyId, resource_type: "dispatch.capacity_settings", before: prior, after: saved.rows[0],
      }, "warning", "CAPACITY-ENGINE");
      return { settings: saved.rows[0] };
    });
  });

  // ---- public unsubscribe (no session; HMAC token). GET shows a confirm page (link scanners must not unsubscribe people);
  // POST records it — the same POST a mail client sends for RFC 8058 List-Unsubscribe-Post one-click.
  await app.register(async (scope) => {
    scope.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => done(null, body));
    const tokenQuery = z.object({ t: z.string().min(10).max(1000) });
    const page = (title: string, body: string) =>
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<style>body{font-family:Arial,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;color:#1f2937}button{background:#1f2937;color:#fff;border:0;padding:10px 18px;border-radius:6px;font-size:15px;cursor:pointer}</style>` +
      `</head><body><h2>${title}</h2>${body}</body></html>`;

    scope.get("/api/v1/public/capacity/unsubscribe", RL, async (req, reply) => {
      const q = tokenQuery.safeParse(req.query ?? {});
      let parsed: ReturnType<typeof verifyUnsubscribeToken> = null;
      try { parsed = q.success ? verifyUnsubscribeToken(q.data.t) : null; } catch { parsed = null; }
      reply.type("text/html; charset=utf-8");
      if (!parsed || !q.success) return reply.code(400).send(page("Link not valid", "<p>This unsubscribe link is not valid.</p>"));
      const t = encodeURIComponent(q.data.t);
      return reply.send(page("Stop truck availability emails?",
        `<form method="post" action="/api/v1/public/capacity/unsubscribe?t=${t}"><p>You will no longer receive available-truck emails at this address.</p><button type="submit">Unsubscribe</button></form>`));
    });

    scope.post("/api/v1/public/capacity/unsubscribe", RL, async (req, reply) => {
      const q = tokenQuery.safeParse(req.query ?? {});
      let parsed: ReturnType<typeof verifyUnsubscribeToken> = null;
      try { parsed = q.success ? verifyUnsubscribeToken(q.data.t) : null; } catch { parsed = null; }
      reply.type("text/html; charset=utf-8");
      if (!parsed) return reply.code(400).send(page("Link not valid", "<p>This unsubscribe link is not valid.</p>"));
      const { operatingCompanyId, email } = parsed;
      await withLuciaBypass(async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
        await recordUnsubscribe(client, operatingCompanyId, email);
      });
      return reply.send(page("You are unsubscribed", "<p>You will no longer receive available-truck emails at this address.</p>"));
    });
  });
}
