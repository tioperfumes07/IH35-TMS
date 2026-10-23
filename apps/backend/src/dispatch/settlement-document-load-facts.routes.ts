/**
 * LEAD 443.241 — apply the signed AlwaysTrack settlement documents to their USMCA loads through THE engine
 * (applySettlementDocumentToLoad: stop facility / ZIP / leg miles, document miles with the 443.240 lock, then the one geocode →
 * real-address fence → Samsara pass). One transaction per load, so one load's failure never undoes another's. Owner / Administrator.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, withCompanyScope } from "../accounting/shared.js";
import { applySettlementDocumentToLoad, type ApplyDocumentResult } from "./settlement-document-load-facts.service.js";

const WRITE_ROLES = new Set(["Owner", "Administrator"]);
const miles = z.number().finite().min(0).max(10000).nullable();
const stop = z.object({
  type: z.enum(["EMPTY", "PICKUP", "DELIVER"]),
  date: z.string().max(20).nullable(),
  company: z.string().max(200).nullable(),
  city: z.string().max(120).nullable(),
  state: z.string().max(20).nullable(),
  zip: z.string().max(12).nullable(),
  leg_miles: miles,
});
const body = z.object({
  operating_company_id: z.string().uuid(),
  geocode: z.boolean().optional(),
  loads: z.array(z.object({
    load_number: z.string().trim().min(1).max(30),
    settlement_no: z.number().int().positive(),
    stops: z.array(stop).min(1).max(30),
    loaded_miles_doc: miles,
    empty_miles_doc: miles,
    loaded_miles_legs: miles.optional(),
    empty_miles_legs: miles.optional(),
    practical_miles_doc: miles,
  })).min(1).max(60),
});

export async function registerSettlementDocumentLoadFactsRoutes(app: FastifyInstance) {
  app.post("/api/v1/dispatch/settlement-documents/apply", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return reply;
    if (!WRITE_ROLES.has(String(user.role))) return reply.code(403).send({ error: "forbidden" });
    const b = body.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.flatten() });
    const results: ApplyDocumentResult[] = [];
    const failed: Array<{ load_number: string; error: string }> = [];
    for (const doc of b.data.loads) {
      try {
        results.push(await withCompanyScope(user.uuid, b.data.operating_company_id, (client) =>
          applySettlementDocumentToLoad(client as never, { operatingCompanyId: b.data.operating_company_id, actorUserId: user.uuid, doc, geocode: b.data.geocode })));
      } catch (err) {
        // Each document runs in its own transaction (withCompanyScope), so one refusal never poisons the others; it is
        // logged and returned per load, never swallowed (verify-no-swallowed-db-error-in-transaction, 443.260-B).
        req.log.error({ err, load_number: doc.load_number }, "settlement-document apply failed for one load");
        failed.push({ load_number: doc.load_number, error: String((err as { message?: unknown })?.message ?? err).slice(0, 200) });
      }
    }
    return reply.send({ results, failed });
  });
}
