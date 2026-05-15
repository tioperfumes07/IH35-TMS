import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pool } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  ADMIN_IMPORT_ENTITY_SLUGS,
  type AdminImportEntitySlug,
  CsvImportRowErrors,
  mapAdminImportEntityToSeedType,
  runAdminCsvImport,
  type CompanyCode,
} from "../seed/csv-seed-import.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const TEMPLATE_FILES: Record<AdminImportEntitySlug, string> = {
  drivers: "drivers.csv",
  units: "units.csv",
  customers: "customers.csv",
  vendors: "vendors.csv",
  "bank-accounts": "bank-accounts.csv",
  loads: "loads.csv",
  "bank-transactions": "bank-transactions.csv",
};

function allowDataImport(role: string | undefined): boolean {
  const r = String(role ?? "");
  return r === "Owner" || r === "Administrator";
}

function parseCompanyCode(raw: string | undefined): CompanyCode | undefined {
  if (!raw || !String(raw).trim()) return undefined;
  const u = String(raw).trim().toUpperCase();
  if (u !== "TRK" && u !== "TRANSP") throw new Error("company_code must be TRK or TRANSP");
  return u as CompanyCode;
}

function isEntitySlug(value: string): value is AdminImportEntitySlug {
  return ADMIN_IMPORT_ENTITY_SLUGS.includes(value as AdminImportEntitySlug);
}

export async function registerDataImportAdminRoutes(app: FastifyInstance) {
  app.get<{ Params: { entity_type: string } }>(
    "/api/v1/admin/data-import/template/:entity_type",
    async (req: FastifyRequest<{ Params: { entity_type: string } }>, reply: FastifyReply) => {
      if (!requireAuth(req, reply)) return;
      if (!allowDataImport(req.user?.role)) return reply.code(403).send({ error: "forbidden" });

      const slug = req.params.entity_type.trim().toLowerCase();
      if (!isEntitySlug(slug)) {
        return reply.code(400).send({ error: "invalid_entity_type" });
      }
      const filename = TEMPLATE_FILES[slug];
      const abs = path.join(repoRoot, "tests", "fixtures", "production-seed", filename);
      try {
        const buf = await fs.readFile(abs);
        return reply
          .header("Content-Type", "text/csv; charset=utf-8")
          .header("Content-Disposition", `attachment; filename="${slug}-template.csv"`)
          .send(buf);
      } catch {
        return reply.code(404).send({ error: "template_not_found" });
      }
    }
  );

  app.post("/api/v1/admin/data-import", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    if (!allowDataImport(req.user?.role)) return reply.code(403).send({ error: "forbidden" });

    const q = req.query as Record<string, string | undefined>;
    const entityRaw = q["entity_type"] ?? q["entityType"];
    if (!entityRaw) return reply.code(400).send({ error: "entity_type_required" });

    const slug = entityRaw.trim().toLowerCase();
    if (!isEntitySlug(slug)) {
      return reply.code(400).send({ error: "invalid_entity_type" });
    }

    let companyCode: CompanyCode | undefined;
    try {
      companyCode = parseCompanyCode(q["company_code"] ?? q["companyCode"]);
    } catch {
      return reply.code(400).send({ error: "invalid_company_code" });
    }

    const commit = q["commit"] === "true" || q["commit"] === "1";

    let csvText = "";
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        const buf = await part.toBuffer();
        csvText = buf.toString("utf8");
        break;
      }
    }
    if (!csvText.trim()) return reply.code(400).send({ error: "file_required" });

    const seedKind = mapAdminImportEntityToSeedType(slug);

    const client = await pool.connect();
    try {
      if (commit) {
        await client.query("BEGIN");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        try {
          const out = await runAdminCsvImport(client as unknown as pg.Client, {
            csvText,
            seedKind,
            companyCode,
            preview: false,
          });
          await client.query("COMMIT");
          return out;
        } catch (err) {
          await client.query("ROLLBACK").catch(() => undefined);
          if (err instanceof CsvImportRowErrors) {
            return reply.code(400).send({
              error: "import_failed",
              inserted_rows: 0,
              skipped_rows: 0,
              errors: err.errors,
            });
          }
          throw err;
        }
      }

      const out = await runAdminCsvImport(client as unknown as pg.Client, {
        csvText,
        seedKind,
        companyCode,
        preview: true,
      });
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("company_code is required")) {
        return reply.code(400).send({ error: "company_code_required", message: msg });
      }
      if (msg.includes("CSV missing columns")) {
        return reply.code(400).send({ error: "invalid_csv_headers", message: msg });
      }
      app.log.error({ err }, "[data-import] failed");
      return reply.code(500).send({ error: "data_import_failed", message: msg });
    } finally {
      client.release();
    }
  });
}
