import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import * as XLSX from "xlsx";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

type LovesRow = {
  station_uuid?: string;
  station_name: string;
  station_address: string;
  city?: string;
  state?: string;
  price_per_gallon: number;
};

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
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function normalizeRowsFromWorkbook(data: Buffer): LovesRow[] {
  const wb = XLSX.read(data, { type: "buffer" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const normalized: LovesRow[] = [];
  for (const row of rows) {
    const station_name = String(row.station_name ?? row.name ?? "").trim();
    const station_address = String(row.station_address ?? row.address ?? row.address_line1 ?? "").trim();
    const priceRaw = row.price_per_gallon ?? row.price ?? row.retail_price;
    const price = Number(priceRaw);
    if (!station_name || !station_address || !Number.isFinite(price)) continue;
    normalized.push({
      station_uuid: String(row.station_uuid ?? row.station_id ?? "").trim() || undefined,
      station_name,
      station_address,
      city: String(row.city ?? "").trim() || undefined,
      state: String(row.state ?? "").trim() || undefined,
      price_per_gallon: price,
    });
  }
  return normalized;
}

export async function registerFuelLovesUploadRoutes(app: FastifyInstance) {
  app.post("/api/v1/fuel/loves-prices/upload", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const tableExists = await client.query<{ ok: boolean }>(
        `SELECT to_regclass('fuel.loves_prices_daily') IS NOT NULL AS ok`
      );
      if (!tableExists.rows[0]?.ok) return { unavailable: true as const };

      const etagSourceRes = await client.query<{ marker: string }>(
        `
          SELECT COALESCE(
            max(COALESCE(updated_at::text, effective_date::text)),
            'none'
          ) || ':' || count(*)::text AS marker
          FROM fuel.loves_prices_daily
          WHERE operating_company_id = $1
            AND effective_date = current_date
        `,
        [companyId]
      );
      const marker = etagSourceRes.rows[0]?.marker ?? "none:0";
      const expectedEtag = crypto.createHash("sha1").update(marker).digest("hex");
      const ifMatch = typeof req.headers["if-match"] === "string" ? req.headers["if-match"].replaceAll('"', "") : null;
      if (ifMatch && ifMatch !== expectedEtag) return { conflict: true as const, expectedEtag };

      const filePart = await req.file();
      if (!filePart) return { badRequest: true as const };
      if (!filePart.filename.toLowerCase().endsWith(".xlsx")) return { invalidFile: true as const };
      const workbookBytes = await filePart.toBuffer();
      const rows = normalizeRowsFromWorkbook(workbookBytes);

      const counts = { rows_added: 0, rows_updated: 0, rows_skipped: 0 };
      for (const row of rows) {
        if (!row.station_name || !row.station_address || !Number.isFinite(row.price_per_gallon)) {
          counts.rows_skipped += 1;
          continue;
        }

        const updateRes = await client
          .query(
            `
              UPDATE fuel.loves_prices_daily
              SET price_per_gallon = $1,
                  station_uuid = COALESCE($2, station_uuid),
                  city = COALESCE($3, city),
                  state = COALESCE($4, state),
                  uploaded_by_user_id = $5,
                  source_file_name = $6,
                  updated_at = now()
              WHERE operating_company_id = $7
                AND effective_date = current_date
                AND station_name = $8
                AND station_address = $9
            `,
            [
              row.price_per_gallon,
              row.station_uuid ?? null,
              row.city ?? null,
              row.state ?? null,
              authUser.uuid,
              filePart.filename,
              companyId,
              row.station_name,
              row.station_address,
            ]
          )
          .catch(() => ({ rowCount: 0 }));
        if ((updateRes.rowCount ?? 0) > 0) {
          counts.rows_updated += 1;
          continue;
        }

        const insertRes = await client
          .query(
            `
              INSERT INTO fuel.loves_prices_daily (
                operating_company_id,
                effective_date,
                station_uuid,
                station_name,
                station_address,
                city,
                state,
                price_per_gallon,
                source_file_name,
                uploaded_by_user_id
              )
              VALUES ($1, current_date, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            [
              companyId,
              row.station_uuid ?? null,
              row.station_name,
              row.station_address,
              row.city ?? null,
              row.state ?? null,
              row.price_per_gallon,
              filePart.filename,
              authUser.uuid,
            ]
          )
          .catch(() => ({ rowCount: 0 }));
        if ((insertRes.rowCount ?? 0) > 0) counts.rows_added += 1;
        else counts.rows_skipped += 1;
      }

      await appendCrudAudit(
        client,
        authUser.uuid,
        "fuel.loves_prices_uploaded",
        {
          resource_type: "fuel.loves_prices_daily",
          resource_id: companyId,
          operating_company_id: companyId,
          filename: filePart.filename,
          rows_added: counts.rows_added,
          rows_updated: counts.rows_updated,
          rows_skipped: counts.rows_skipped,
        },
        "info",
        "BT-3-FUEL-PLANNER-REBUILD"
      );

      const refreshedEtagSource = await client.query<{ marker: string }>(
        `
          SELECT COALESCE(
            max(COALESCE(updated_at::text, effective_date::text)),
            'none'
          ) || ':' || count(*)::text AS marker
          FROM fuel.loves_prices_daily
          WHERE operating_company_id = $1
            AND effective_date = current_date
        `,
        [companyId]
      );
      const refreshedMarker = refreshedEtagSource.rows[0]?.marker ?? "none:0";
      const etag = crypto.createHash("sha1").update(refreshedMarker).digest("hex");
      return { ...counts, etag };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "loves_prices_daily_unavailable" });
    if ("conflict" in result) return reply.code(412).send({ error: "etag_conflict", expected_etag: result.expectedEtag });
    if ("badRequest" in result) return reply.code(400).send({ error: "file_required" });
    if ("invalidFile" in result) return reply.code(400).send({ error: "xlsx_required" });
    reply.header("ETag", `"${result.etag}"`);
    return {
      rows_added: result.rows_added,
      rows_updated: result.rows_updated,
      rows_skipped: result.rows_skipped,
    };
  });
}
