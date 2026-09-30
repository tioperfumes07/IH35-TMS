import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { wrapPdfDocument } from "../render/pdf-template.js";
// ONE DOCUMENT: this route and settlement-pdf-renderer.service.ts both render through
// buildDriverSettlementDocument, so the PDF a driver is handed and the statement on screen are the
// same paper. They used to be two different templates. See settlement-document.service.ts.
import { buildDriverSettlementDocument } from "./settlement-document.service.js";

const paramsSchema = z.object({ settlementId: z.string().uuid() });

export async function registerDriverFinanceSettlementHtmlRoutes(app: FastifyInstance) {
  // FAIL-SET3 follow-on: this route authorizes but carried no rateLimit, which CodeQL flags as
  // js/missing-rate-limiting. It renders a driver's settlement — pay, deductions, CDL details — so an
  // unthrottled authenticated endpoint is a real enumeration surface, not a lint nit. Caught by
  // `money-pr-local-gate` (verify-new-auth-routes-rate-limited) once the gate was actually run.
  app.get("/api/v1/driver-finance/settlements/:settlementId.html", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return buildDriverSettlementDocument(client as never, {
        settlementId: params.data.settlementId,
        operatingCompanyId: query.data.operating_company_id,
        userId: user.uuid,
        userRole: String(user.role ?? ""),
        log: req.log,
      });
    });

    if (!payload) return reply.code(500).send({ error: "settlement_html_failed" });
    if (payload.kind === "unavailable") return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if (payload.kind === "not_found") return reply.code(404).send({ error: "settlement_not_found" });
    if (payload.kind === "forbidden") return reply.code(403).send({ error: "forbidden" });

    reply.header("Content-Type", "text/html; charset=utf-8");
    reply.header("Cache-Control", "private, no-store");
    return reply.send(wrapPdfDocument({ title: payload.title, body: payload.body, skin: "v10" }));
  });
}
