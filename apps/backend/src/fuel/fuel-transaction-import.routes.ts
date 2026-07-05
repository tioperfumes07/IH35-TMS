import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import * as XLSX from "xlsx";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  mapFuelCardRows,
  importFuelCardTransactionsForCompany,
  type DbClient,
} from "./fuel-transaction-import.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: DbClient) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [
      operatingCompanyId,
    ]);
    return fn(client as unknown as DbClient);
  });
}

function rowsFromWorkbook(data: Buffer): Record<string, unknown>[] {
  // XLSX.read auto-detects CSV as well as XLSX from a raw buffer.
  const wb = XLSX.read(data, { type: "buffer", cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = wb.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

export async function registerFuelTransactionImportRoutes(app: FastifyInstance) {
  // Upload a fleet-card TRANSACTION export (Love's / WEX / EFS / Comdata) and
  // persist each purchase into fuel.fuel_transactions (FUEL-1). Idempotent.
  app.post("/api/v1/fuel/transactions/import", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const filePart = await req.file();
    if (!filePart) return reply.code(400).send({ error: "file_required" });
    const name = filePart.filename.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      return reply.code(400).send({ error: "xlsx_or_csv_required" });
    }
    const bytes = await filePart.toBuffer();

    let rawRows: Record<string, unknown>[];
    try {
      rawRows = rowsFromWorkbook(bytes);
    } catch (err) {
      return reply
        .code(400)
        .send({ error: "unreadable_file", detail: String((err as Error)?.message ?? err) });
    }

    const parsed = mapFuelCardRows(rawRows);

    const result = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const tableExists = await client.query<{ ok: boolean }>(
        `SELECT to_regclass('fuel.fuel_transactions') IS NOT NULL AS ok`
      );
      if (!tableExists.rows[0]?.ok) return { unavailable: true as const };

      const counts = await importFuelCardTransactionsForCompany(client, companyId, parsed, {
        userId: authUser.uuid,
        sourceFileName: filePart.filename,
      });

      await appendCrudAudit(
        client,
        authUser.uuid,
        "fuel.fuel_transactions_imported",
        {
          resource_type: "fuel.fuel_transactions",
          resource_id: companyId,
          operating_company_id: companyId,
          filename: filePart.filename,
          rows_inserted: counts.rows_inserted,
          rows_duplicate: counts.rows_duplicate,
          rows_skipped: counts.rows_skipped,
          rows_unlinked_to_load: counts.rows_unlinked_to_load,
          dead_letters: counts.dead_letters,
        },
        "info",
        "FUEL-1-TRANSACTION-IMPORT"
      );

      return { counts };
    });

    if ("unavailable" in result) {
      return reply.code(501).send({ error: "fuel_transactions_unavailable" });
    }
    return {
      ...result.counts,
      dead_letter_details: parsed.dead_letters.slice(0, 25),
    };
  });
}
