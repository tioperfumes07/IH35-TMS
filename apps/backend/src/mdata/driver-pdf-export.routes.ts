import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { buildDriverAggregate } from "./driver-aggregate.service.js";
import { buildDriverProfilePdfSections, renderDriverProfilePdf } from "./driver-profile-pdf-renderer.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const driverParamsSchema = z.object({ id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverPdfExportRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/drivers/:id/export.pdf", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const pdf = await withCurrentUser(authUser.uuid, async (client) => {
      const aggregate = await buildDriverAggregate(client, params.data.id, query.data.operating_company_id);
      if (!aggregate) return null;
      const built = buildDriverProfilePdfSections(aggregate);
      return renderDriverProfilePdf({ lastName: built.lastName, htmlSections: built.htmlSections });
    });

    if (!pdf) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return reply
      .header("Content-Type", pdf.mimeType)
      .header("Content-Disposition", `attachment; filename="${pdf.filename}"`)
      .send(pdf.pdfBuffer);
  });
}
