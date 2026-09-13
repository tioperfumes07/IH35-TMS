/**
 * ALL-SEATS LAW (owner, 2026-09-13, verbatim): "in every window where we have a load number, we
 * must also have a column with a pre-settlement, or settlement or tour number." Item 6 of that law:
 * "One source everywhere: mdata.loads.presettlement_link_id joined to
 * driver_finance.driver_settlements. If an endpoint does not project it, add the projection — do
 * not invent a second path." This is that one shared projection, as a small batch endpoint any
 * surface can call for the rows it did not already enrich itself.
 *
 * Read-only. LOADS FENCE — this route reads mdata.loads.presettlement_link_id, never writes it or
 * any load status/tour/trip field; writing that column is Cursor's lane.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_ids: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(500)),
});

export type SettlementRefRow = {
  load_id: string;
  presettlement_link_id: string | null;
  source_document_ref: string | null;
  status: string | null;
};

export async function registerSettlementRefRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/mdata/loads/settlement-refs",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireAuth(req, reply) ? req.user : null;
      if (!user) return;

      const q = querySchema.safeParse(req.query ?? {});
      if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

      await assertCompanyMembership(user.uuid, q.data.operating_company_id);

      const rows: SettlementRefRow[] = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
        const res = await client.query<SettlementRefRow>(
          `
          SELECT l.id AS load_id, l.presettlement_link_id,
                 ds.source_document_ref, ds.status
          FROM mdata.loads l
          LEFT JOIN driver_finance.driver_settlements ds
            ON ds.id = l.presettlement_link_id
           AND ds.operating_company_id = l.operating_company_id
          WHERE l.operating_company_id = $1::uuid
            AND l.id = ANY($2::uuid[])
          `,
          [q.data.operating_company_id, q.data.load_ids]
        );
        return res.rows;
      });

      return { refs: rows };
    }
  );
}
