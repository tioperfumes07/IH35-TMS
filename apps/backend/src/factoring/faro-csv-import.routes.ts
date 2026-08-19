import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { commitFaroCsvImport, enrichFaroPreviewLines, FaroCsvImportError, parseFaroCsv } from "./faro-csv-import.js";

const importBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  csv_text: z.string().trim().min(1),
  statement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  statement_reference: z.string().trim().min(1).max(120).optional(),
  source_filename: z.string().trim().max(260).optional(),
  preview_only: z.boolean().optional(),
});

// ACCT-F5577: this route had no role gate at all -- any authenticated company member could commit a
// Faro factoring statement import (real reserve-balance-affecting transactions), not just office
// accounting staff. Matches factor.routes.ts's own canMutate role set for the same domain, minus
// dispatcher (a factoring statement import is an accounting operation, not a dispatch one).
function canImport(role: string) {
  const normalized = String(role || "").toLowerCase();
  return ["owner", "administrator", "accountant"].includes(normalized);
}

export async function registerFaroCsvImportRoutes(app: FastifyInstance) {
  app.post("/api/v1/factoring/import/faro", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canImport(String((user as { role?: string }).role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const body = importBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      if (body.data.preview_only) {
        const parsed = parseFaroCsv(body.data.csv_text);
        const lines = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          enrichFaroPreviewLines(client, body.data.operating_company_id, parsed.lines.slice(0, 25))
        );
        return {
          preview: true,
          line_count: parsed.lines.length,
          headers: parsed.headers,
          lines,
          statement_date: body.data.statement_date ?? parsed.statement_date,
        };
      }

      const result = await commitFaroCsvImport({
        userId: user.uuid,
        operatingCompanyId: body.data.operating_company_id,
        csvText: body.data.csv_text,
        statementDate: body.data.statement_date,
        statementReference: body.data.statement_reference,
        sourceFilename: body.data.source_filename,
      });

      return { ok: true, ...result };
    } catch (error) {
      if (error instanceof FaroCsvImportError) {
        return reply.code(400).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });
}
