/**
 * ACCT-F11108 — POST /api/v1/dispatch/loads/import/alwaystrack-load-history
 *
 * The AlwaysTrack "LOAD HISTORY" export, imported as one file (owner order 2026-11-09: "not manually not one by one").
 * Owner only — it records loads that already ran, the same authority the historical-import path in bookLoad requires.
 * commit=false (default) answers what WOULD be booked, skipped (already in the app) or refused, writing nothing.
 * The owner names whose load history it is (source_company_code); it must be the company it is booked under.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError } from "../accounting/shared.js";
import { SpreadsheetUploadRejectedError, validateSpreadsheetUploadBytes } from "../lib/spreadsheet-upload-bytes.js";
import { LoadHistoryParseError } from "./alwaystrack-load-history-import.js";
import { importAlwaysTrackLoadHistory, LoadHistoryRowRefusal } from "./alwaystrack-load-history-import.service.js";

export const ALWAYSTRACK_LOAD_HISTORY_IMPORT_ROUTE = "/api/v1/dispatch/loads/import/alwaystrack-load-history";

const body = z.object({
  operating_company_id: z.string().uuid(),
  source_company_code: z.enum(["TRANSP", "TRK", "USMCA"]),
  filename: z.string().trim().min(1).max(260),
  file_base64: z.string().min(16).max(8_000_000),
  commit: z.boolean().default(false),
});

export async function registerAlwaysTrackLoadHistoryImportRoutes(app: FastifyInstance) {
  app.post(
    ALWAYSTRACK_LOAD_HISTORY_IMPORT_ROUTE,
    { bodyLimit: 10 * 1024 * 1024, config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (String(user.role ?? "") !== "Owner") return reply.code(403).send({ error: "load_history_import_owner_only" });
      const b = body.safeParse(req.body ?? {});
      if (!b.success) return validationError(reply, b.error);
      const buffer = Buffer.from(b.data.file_base64, "base64");
      try {
        if (validateSpreadsheetUploadBytes(buffer, b.data.filename) !== "xlsx") {
          return reply.code(400).send({ error: "load_history_must_be_xlsx" });
        }
        return await importAlwaysTrackLoadHistory({
          actor: { uuid: user.uuid, role: String(user.role) },
          operatingCompanyId: b.data.operating_company_id,
          sourceCompanyCode: b.data.source_company_code,
          buffer,
          commit: b.data.commit,
        });
      } catch (err) {
        if (err instanceof SpreadsheetUploadRejectedError) return reply.code(400).send({ error: "spreadsheet_rejected", message: err.message });
        if (err instanceof LoadHistoryParseError) return reply.code(400).send({ error: err.code, message: err.message });
        if (err instanceof LoadHistoryRowRefusal) return reply.code(422).send({ error: err.code, message: err.message });
        throw err;
      }
    },
  );
}
