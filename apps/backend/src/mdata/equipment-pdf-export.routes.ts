import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { requireAuth } from "../auth/session-middleware.js";
import { buildEquipmentAggregate } from "./equipment-aggregate.service.js";
import { buildTrailerProfilePdfSections, renderTrailerProfilePdf } from "./trailer-profile-pdf-renderer.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const paramsSchema = z.object({ id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerEquipmentPdfExportRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/equipment/:id/export.pdf", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const pdf = await withCurrentUser(user.uuid, async (client) => {
      // The PDF is a second consumer of the same aggregate and must not let a raw query parameter
      // select the transaction's RLS scope. Resolve membership before building or rendering it.
      const scopedCompanyId = await resolveOperatingCompanyId(
        client,
        user.uuid,
        query.data.operating_company_id
      );
      if (!scopedCompanyId) return null;
      const aggregate = await buildEquipmentAggregate(client, params.data.id, scopedCompanyId);
      if (!aggregate) return null;
      const built = buildTrailerProfilePdfSections(aggregate);
      return renderTrailerProfilePdf(built);
    });
    if (!pdf) return reply.code(404).send({ error: "mdata_equipment_not_found" });
    return reply
      .header("Content-Type", pdf.mimeType)
      .header("Content-Disposition", `attachment; filename="${pdf.filename}"`)
      .send(pdf.pdfBuffer);
  });
}
