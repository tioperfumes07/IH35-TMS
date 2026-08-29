import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  assertReadOnlySurface,
  buildDotAuditPdfPayload,
  getEditHistory,
  getRecentEditHistory,
} from "./viewer.service.js";
import { renderEldAuditPdf } from "./eld-audit-pdf-renderer.service.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const auditTrailQuerySchema = companyQuerySchema.extend({
  driver: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const driverParamsSchema = z.object({
  uuid: z.string().uuid(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isSourceUnavailable(error: unknown): boolean {
  return error instanceof Error && (
    error.message === "eld_audit_source_not_configured" ||
    error.message.startsWith("samsara_hos_log_edits_http_")
  );
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerEldAuditTrailRoutes(app: FastifyInstance) {
  app.get("/api/safety/eld/audit-trail", async (req, reply) => {
    assertReadOnlySurface(req.method);
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = auditTrailQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    let history;
    try {
      history = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
        getEditHistory(client, parsed.data.operating_company_id, parsed.data.driver, parsed.data.from, parsed.data.to)
      );
    } catch (error) {
      if (isSourceUnavailable(error)) return reply.code(503).send({ error: "eld_audit_source_unavailable" });
      throw error;
    }

    return reply.send({
      ...history,
      pdf_payload: buildDotAuditPdfPayload(history),
    });
  });

  // Real PDF download for DOT (0441-mod12) — puppeteer bytes, not browser window.print().
  app.get(
    "/api/safety/eld/audit-trail/export.pdf",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      assertReadOnlySurface(req.method);
      const user = authUser(req, reply);
      if (!user) return;
      const parsed = auditTrailQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }

      let history;
      try {
        history = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
          getEditHistory(client, parsed.data.operating_company_id, parsed.data.driver, parsed.data.from, parsed.data.to)
        );
      } catch (error) {
        if (isSourceUnavailable(error)) return reply.code(503).send({ error: "eld_audit_source_unavailable" });
        throw error;
      }
      if (history.edits.length === 0) {
        return reply.code(404).send({ error: "eld_audit_trail_empty", message: "No ELD edits in the selected period" });
      }

      const pdf = await renderEldAuditPdf(buildDotAuditPdfPayload(history));
      return reply
        .header("Content-Type", pdf.mimeType)
        .header("Content-Disposition", `attachment; filename="${pdf.filename}"`)
        .send(pdf.pdfBuffer);
    }
  );

  app.get("/api/safety/eld/audit-trail/driver/:uuid/recent", async (req, reply) => {
    assertReadOnlySurface(req.method);
    const user = authUser(req, reply);
    if (!user) return;
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    const parsedParams = driverParamsSchema.safeParse(req.params ?? {});
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "validation_error", details: parsedQuery.error.flatten() });
    }
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "validation_error", details: parsedParams.error.flatten() });
    }

    let history;
    try {
      history = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
        getRecentEditHistory(client, parsedQuery.data.operating_company_id, parsedParams.data.uuid)
      );
    } catch (error) {
      if (isSourceUnavailable(error)) return reply.code(503).send({ error: "eld_audit_source_unavailable" });
      throw error;
    }

    return reply.send(history);
  });
}
