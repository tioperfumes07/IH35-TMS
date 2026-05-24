import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  unit_id: z.string().uuid().optional(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerTelematicsHeatmapRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/heatmap", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const from = parsed.data.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = parsed.data.to ?? new Date().toISOString();

    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);
      const values: unknown[] = [parsed.data.operating_company_id, from, to];
      const unitClause = parsed.data.unit_id ? `AND v.unit_id = $4::uuid` : "";
      if (parsed.data.unit_id) values.push(parsed.data.unit_id);
      const res = await client.query<{
        lat_bucket: number;
        lng_bucket: number;
        hit_count: number;
      }>(
        `
          SELECT
            floor((v.lat::numeric) / 0.001) * 0.001 AS lat_bucket,
            floor((v.lng::numeric) / 0.001) * 0.001 AS lng_bucket,
            count(*)::int AS hit_count
          FROM telematics.vehicle_locations v
          WHERE v.operating_company_id = $1::uuid
            AND v.captured_at >= $2::timestamptz
            AND v.captured_at <= $3::timestamptz
            ${unitClause}
          GROUP BY 1, 2
          ORDER BY hit_count DESC
          LIMIT 5000
        `,
        values
      );
      return res.rows;
    });

    return { from, to, rows, bucket_size_degrees: 0.001 };
  });
}
