import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { buildUnitAggregate } from "./unit-aggregate.service.js";
import { buildVehicleProfilePdfSections, renderVehicleProfilePdf } from "./vehicle-profile-pdf-renderer.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const unitParamsSchema = z.object({ id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerUnitPdfExportRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/units/:id/export.pdf", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const pdf = await withCurrentUser(authUser.uuid, async (client) => {
      const aggregate = await buildUnitAggregate(client, params.data.id, query.data.operating_company_id);
      if (!aggregate) return null;
      const unitNumber = String((aggregate.unit as { unit_number?: string }).unit_number ?? params.data.id.slice(0, 8));
      const htmlSections = buildVehicleProfilePdfSections(aggregate as Record<string, unknown>);
      return renderVehicleProfilePdf({ unitNumber, htmlSections });
    });

    if (!pdf) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return reply
      .header("Content-Type", pdf.mimeType)
      .header("Content-Disposition", `attachment; filename="${pdf.filename}"`)
      .send(pdf.pdfBuffer);
  });
}
