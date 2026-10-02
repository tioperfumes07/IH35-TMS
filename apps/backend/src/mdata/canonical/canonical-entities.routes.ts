/**
 * ROUND 326 — canonical customers / vendors: plan (read), merge and reverse (Owner only, audited, reversible).
 * One merge per call so every merge is its own transaction, audit row and alias.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { withCompanyScope } from "../../accounting/shared.js";
import { readCustomerProfile } from "./customer-profile.service.js";
import { readVendorProfile } from "./vendor-profile.service.js";
import { readDriverProfile } from "./driver-profile.service.js";
import { readCustomerBoard, readVendorBoard } from "./party-board.service.js";
import { readDriverHub, readDriverHubPanel } from "./driver-hub.service.js";
import { readDriverOverview } from "./driver-overview.service.js";
import { mergeIntoCanonical, planCanonical, reverseCanonicalMerge, type CanonicalKind } from "./canonical-entities.service.js";
import { readVariantCandidates } from "./variant-candidates.service.js";

const kindSchema = z.enum(["customers", "vendors"]);
const toKind = (k: "customers" | "vendors"): CanonicalKind => (k === "customers" ? "customer" : "vendor");

export async function registerCanonicalEntityRoutes(app: FastifyInstance) {
  // ROUND 326 item 1B — the customer profile surface: eight blocks, each a value or a named empty reason.
  app.get("/api/v1/customers/:id/profile", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const p = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const qy = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!p.success || !qy.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, qy.data.operating_company_id);
    const profile = await withCompanyScope(req.user!.uuid, qy.data.operating_company_id, (client) =>
      readCustomerProfile(client, qy.data.operating_company_id, p.data.id));
    if (!profile) return reply.code(404).send({ error: "customer_not_found" });
    return profile;
  });

  // ROUND 326.5 — Driver Hub Home board: tiles, chips, list sorted by settlement due, and the selected driver's panel.
  app.get("/api/v1/mdata/boards/drivers", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const qy = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!qy.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, qy.data.operating_company_id);
    return withCompanyScope(req.user!.uuid, qy.data.operating_company_id, (client) => readDriverHub(client, qy.data.operating_company_id));
  });
  app.get("/api/v1/mdata/boards/drivers/:id/overview", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const p = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const qy = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!p.success || !qy.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, qy.data.operating_company_id);
    const overview = await withCompanyScope(req.user!.uuid, qy.data.operating_company_id, (client) => readDriverOverview(client, qy.data.operating_company_id, p.data.id));
    if (!overview) return reply.code(404).send({ error: "driver_not_found" });
    return overview;
  });
  app.get("/api/v1/mdata/boards/drivers/:id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const p = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const qy = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!p.success || !qy.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, qy.data.operating_company_id);
    const panel = await withCompanyScope(req.user!.uuid, qy.data.operating_company_id, (client) => readDriverHubPanel(client, qy.data.operating_company_id, p.data.id));
    if (!panel) return reply.code(404).send({ error: "driver_not_found" });
    return panel;
  });

  // ROUND 326.5 — the Customers / Vendors list boards: tiles, chip counts, rows and footers, all computed live.
  app.get("/api/v1/mdata/boards/:kind", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const p = z.object({ kind: kindSchema }).safeParse(req.params ?? {});
    const qy = z.object({ operating_company_id: z.string().uuid(), range: z.enum(["ytd", "12m", "all"]).default("ytd") }).safeParse(req.query ?? {});
    if (!p.success || !qy.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, qy.data.operating_company_id);
    return withCompanyScope<unknown>(req.user!.uuid, qy.data.operating_company_id, (client) =>
      p.data.kind === "customers"
        ? readCustomerBoard(client, qy.data.operating_company_id, qy.data.range)
        : readVendorBoard(client, qy.data.operating_company_id, qy.data.range));
  });

  // ROUND 326 item 3 — the whole driver in one read: seventeen blocks, each a value or a named empty reason.
  app.get("/api/v1/drivers/:id/whole-profile", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const p = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const qy = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!p.success || !qy.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, qy.data.operating_company_id);
    const profile = await withCompanyScope(req.user!.uuid, qy.data.operating_company_id, (client) =>
      readDriverProfile(client, qy.data.operating_company_id, p.data.id));
    if (!profile) return reply.code(404).send({ error: "driver_not_found" });
    return profile;
  });

  // ROUND 326 item 2 — the vendor profile surface: nine blocks, each a value or a named empty reason.
  app.get("/api/v1/vendors/:id/profile", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const p = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const qy = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!p.success || !qy.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, qy.data.operating_company_id);
    const profile = await withCompanyScope(req.user!.uuid, qy.data.operating_company_id, (client) =>
      readVendorProfile(client, qy.data.operating_company_id, p.data.id));
    if (!profile) return reply.code(404).send({ error: "vendor_not_found" });
    return profile;
  });

  app.get("/api/v1/mdata/canonical/:kind/plan", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const p = z.object({ kind: kindSchema }).safeParse(req.params ?? {});
    const qy = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!p.success || !qy.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, qy.data.operating_company_id);
    return withCompanyScope(req.user!.uuid, qy.data.operating_company_id, (client) => planCanonical(client, qy.data.operating_company_id, toKind(p.data.kind)));
  });

  // ROUND 297 — variant duplicate candidates across ONE namespace (customers + vendors + Faro debtors), each pair with
  // both records' document counts, totals and open balances. Read only: the owner approves each merge below.
  app.get("/api/v1/mdata/canonical/variant-candidates", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const qy = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!qy.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, qy.data.operating_company_id);
    return withCompanyScope(req.user!.uuid, qy.data.operating_company_id, (client) => readVariantCandidates(client, qy.data.operating_company_id));
  });

  app.post("/api/v1/mdata/canonical/:kind/merge", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    if (req.user!.role !== "Owner") return reply.code(403).send({ error: "owner_only" });
    const p = z.object({ kind: kindSchema }).safeParse(req.params ?? {});
    const b = z.object({
      operating_company_id: z.string().uuid(), survivor_id: z.string().uuid(), duplicate_id: z.string().uuid(), reason: z.string().trim().min(5),
      // ROUND 297: the owner approved THIS variant pair (names that never normalise equal); Owner-only route above.
      evidence: z.literal("owner_approved_variant").optional(),
    }).safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, b.data.operating_company_id);
    try {
      return await withCompanyScope(req.user!.uuid, b.data.operating_company_id, (client) =>
        mergeIntoCanonical(client, b.data.operating_company_id, toKind(p.data.kind), {
          survivorId: b.data.survivor_id, duplicateId: b.data.duplicate_id, actorUserId: req.user!.uuid, authId: null, reason: b.data.reason,
          evidence: b.data.evidence,
        }));
    } catch (e) {
      const m = String((e as Error).message);
      if (m.startsWith("canonical_")) return reply.code(409).send({ error: m });
      throw e;
    }
  });

  app.post("/api/v1/mdata/canonical/:kind/aliases/:aliasId/reverse", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    if (req.user!.role !== "Owner") return reply.code(403).send({ error: "owner_only" });
    const p = z.object({ kind: kindSchema, aliasId: z.string().uuid() }).safeParse(req.params ?? {});
    const b = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(req.user!.uuid, b.data.operating_company_id);
    try {
      return await withCompanyScope(req.user!.uuid, b.data.operating_company_id, (client) =>
        reverseCanonicalMerge(client, b.data.operating_company_id, toKind(p.data.kind), p.data.aliasId, req.user!.uuid));
    } catch (e) {
      const m = String((e as Error).message);
      if (m.startsWith("canonical_")) return reply.code(409).send({ error: m });
      throw e;
    }
  });
}
