import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { pullVendorsFromQbo } from "./vendors-puller.js";
import { fetchVendorsSyncStatus, reconcileVendors } from "./vendors-reconciler.js";

const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const statusQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function isWriteRole(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

export async function registerVendorsSyncRoutes(app: FastifyInstance) {
  app.post("/api/v1/qbo-sync/vendors/pull-now", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    // LST-F9100: the underlying functions use withLuciaBypass (bypasses
    // RLS entirely), so without an explicit membership check ANY authenticated user can pass ANY
    // operating_company_id and trigger a QBO pull for a company they don't belong to.
    try {
      await assertCompanyMembership(authUser.uuid, parsed.data.operating_company_id);
    } catch {
      return reply.code(403).send({ error: "forbidden_company_membership" });
    }

    try {
      const result = await pullVendorsFromQbo(parsed.data.operating_company_id);
      return reply.send({ ok: true, ...result });
    } catch (error) {
      app.log.error({ err: error }, "Vendors pull failed");
      return reply.code(502).send({ error: "qbo_pull_failed", message: error instanceof Error ? error.message : "unknown" });
    }
  });

  app.post("/api/v1/qbo-sync/vendors/reconcile-now", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    // LST-F9100: same cross-entity leak as pull-now — reconcile uses
    // withLuciaBypass, so membership must be checked explicitly before the call.
    try {
      await assertCompanyMembership(authUser.uuid, parsed.data.operating_company_id);
    } catch {
      return reply.code(403).send({ error: "forbidden_company_membership" });
    }

    try {
      const result = await reconcileVendors(parsed.data.operating_company_id);
      return reply.send({ ok: true, ...result });
    } catch (error) {
      app.log.error({ err: error }, "Vendors reconcile failed");
      return reply.code(500).send({ error: "reconcile_failed", message: error instanceof Error ? error.message : "unknown" });
    }
  });

  app.get("/api/v1/qbo-sync/vendors/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;

    const parsed = statusQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    // LST-F9100: fetchVendorsSyncStatus uses withLuciaBypass (bypasses
    // RLS), so without an explicit membership check ANY authenticated user can read the vendor
    // sync status for ANY company — a cross-entity data leak.
    try {
      await assertCompanyMembership(authUser.uuid, parsed.data.operating_company_id);
    } catch {
      return reply.code(403).send({ error: "forbidden_company_membership" });
    }

    try {
      const status = await fetchVendorsSyncStatus(parsed.data.operating_company_id);
      return reply.send(status);
    } catch (error) {
      // LST-F9100: previously returned EMPTY_SYNC_STATUS (all zeros)
      // with HTTP 200, making a real fetch failure look like "0 vendors, everything synced" in
      // the UI — a silent no-op. Surface the error honestly now.
      app.log.error({ err: error }, "Vendors sync status fetch failed");
      return reply.code(500).send({ error: "vendors_sync_status_failed", message: error instanceof Error ? error.message : "unknown" });
    }
  });
}
