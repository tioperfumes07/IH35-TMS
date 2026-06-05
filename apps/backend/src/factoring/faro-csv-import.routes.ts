import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError } from "../accounting/shared.js";
import { commitFaroCsvImport, FaroCsvImportError, parseFaroCsv } from "./faro-csv-import.js";

const importBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  csv_text: z.string().trim().min(1),
  statement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  statement_reference: z.string().trim().min(1).max(120).optional(),
  source_filename: z.string().trim().max(260).optional(),
  preview_only: z.boolean().optional(),
});

export async function registerFaroCsvImportRoutes(app: FastifyInstance) {
  app.post("/api/v1/factoring/import/faro", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const body = importBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      if (body.data.preview_only) {
        const parsed = parseFaroCsv(body.data.csv_text);
        return {
          preview: true,
          line_count: parsed.lines.length,
          headers: parsed.headers,
          lines: parsed.lines.slice(0, 25),
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
