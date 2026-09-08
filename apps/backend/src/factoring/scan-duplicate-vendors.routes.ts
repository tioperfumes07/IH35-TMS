import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** Exported for future index registration; scan logic also available client-side. */
export async function registerScanDuplicateVendorRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/factoring/scan-duplicate-vendors",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error" });

    await assertCompanyMembership(user.uuid, parsed.data.operating_company_id);
    const pairs = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [parsed.data.operating_company_id]);
      // VENDOR-MERGE-QBO-ID-MISMATCH (owner-live-tested 2026-09-08): the deep-link/merge form
      // (POST /api/v1/integrations/qbo/driver-vendor-merges) validates fromQboVendorId/
      // toQboVendorId against qbo_archive.entities_snapshot.qbo_entity_id -- QuickBooks' OWN
      // entity id, a completely different value from mdata.vendors.id (this TMS's internal
      // UUID). This query used to select only the internal id as from_vendor_id/to_vendor_id,
      // which the banner's own EntityLink correctly uses for /vendors/<uuid> navigation but is
      // NOT a valid input to the merge endpoint -- every deep-linked merge attempt 404'd with
      // qbo_vendor_from_not_found/qbo_vendor_to_not_found, confirmed live. Added the real
      // qbo_vendor_id (mdata.vendors' own FK-shaped link column, distinct from the internal id)
      // as separate from_qbo_vendor_id/to_qbo_vendor_id fields -- additive, the existing
      // from_vendor_id/to_vendor_id stay as the internal UUID for EntityLink, unchanged.
      const res = await client.query<{
        from_vendor_id: string;
        from_vendor_name: string;
        from_qbo_vendor_id: string | null;
        to_vendor_id: string;
        to_vendor_name: string;
        to_qbo_vendor_id: string | null;
        similarity: number;
      }>(
        `
          SELECT
            a.id AS from_vendor_id,
            a.vendor_name AS from_vendor_name,
            a.qbo_vendor_id AS from_qbo_vendor_id,
            b.id AS to_vendor_id,
            b.vendor_name AS to_vendor_name,
            b.qbo_vendor_id AS to_qbo_vendor_id,
            similarity(a.vendor_name, b.vendor_name) AS similarity
          FROM mdata.vendors a
          JOIN mdata.vendors b
            ON b.operating_company_id = a.operating_company_id
           AND a.id < b.id
           AND similarity(a.vendor_name, b.vendor_name) > 0.55
           AND lower(a.vendor_name) <> lower(b.vendor_name)
          WHERE a.operating_company_id = $1::uuid
            AND a.deactivated_at IS NULL
            AND b.deactivated_at IS NULL
            AND a.is_sample_data IS NOT TRUE
            AND b.is_sample_data IS NOT TRUE
          ORDER BY similarity DESC
          LIMIT 25
        `,
        [parsed.data.operating_company_id]
      );
      return res.rows;
    });

    return { pairs };
  }
  );
}
