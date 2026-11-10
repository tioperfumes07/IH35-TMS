/**
 * ACCT-F11108 — POST /api/v1/factoring/import/faro-purchase-report
 *
 * The Faro PURCHASE REPORT export, seeded as one file through the one factoring purchase engine (owner order 2026-11-09:
 * "not manually not one by one"). Owner only — every purchase write is Owner-only (ROUND 315 law), and the engine checks
 * the actor again. commit=false (default) runs the same engine and rolls it back: it answers what WOULD post, what is
 * already present and what is held (with the reason), writing nothing.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError } from "../accounting/shared.js";
import { FaroCsvImportError } from "./faro-csv-import.js";
import { FaroSeedError, seedFaroPurchaseReport } from "./faro-purchase-report-seed.service.js";

export const FARO_PURCHASE_REPORT_SEED_ROUTE = "/api/v1/factoring/import/faro-purchase-report";

const body = z.object({
  operating_company_id: z.string().uuid(),
  filename: z.string().trim().min(1).max(260),
  csv_text: z.string().min(16).max(4_000_000),
  commit: z.boolean().default(false),
});

export async function registerFaroPurchaseReportSeedRoutes(app: FastifyInstance) {
  app.post(
    FARO_PURCHASE_REPORT_SEED_ROUTE,
    { bodyLimit: 6 * 1024 * 1024, config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (String(user.role ?? "") !== "Owner") return reply.code(403).send({ error: "faro_purchase_report_owner_only" });
      const b = body.safeParse(req.body ?? {});
      if (!b.success) return validationError(reply, b.error);
      try {
        return await seedFaroPurchaseReport({
          actorUserId: user.uuid,
          operatingCompanyId: b.data.operating_company_id,
          csvText: b.data.csv_text,
          sourceFilename: b.data.filename,
          commit: b.data.commit,
        });
      } catch (err) {
        if (err instanceof FaroCsvImportError) return reply.code(400).send({ error: err.code, message: err.message });
        if (err instanceof FaroSeedError) return reply.code(422).send({ error: err.code, message: err.message });
        throw err;
      }
    },
  );
}
