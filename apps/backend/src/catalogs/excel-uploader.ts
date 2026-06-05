import * as XLSX from "xlsx";
import { z, type ZodSchema } from "zod";

export type ExcelUploadErrorRow = {
  row: number;
  message: string;
  data?: Record<string, unknown>;
};

export type ExcelUploadJobStatus = "pending" | "processing" | "completed" | "failed";

export type ExcelUploadJobRecord = {
  id: string;
  catalog_name: string;
  file_url: string | null;
  started_at: string;
  completed_at: string | null;
  rows_total: number | null;
  rows_succeeded: number | null;
  rows_failed: number | null;
  error_log: ExcelUploadErrorRow[];
  status: ExcelUploadJobStatus;
};

export type CatalogImportConfig = {
  catalogName: string;
  tableName: string;
  allowedColumns: string[];
  requiredColumns: string[];
  validators: Record<string, ZodSchema>;
  columnAliases?: Record<string, string>;
};

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

const tableNameGuard = /^[a-z_]+$/;

export function normalizeHeaderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseSpreadsheetBuffer(buffer: Buffer, filename: string): Array<Record<string, unknown>> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = buffer.toString("utf8");
    const wb = XLSX.read(text, { type: "string" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
  }

  throw new Error("unsupported_file_type");
}

export function mapSpreadsheetRows(
  rawRows: Array<Record<string, unknown>>,
  config: CatalogImportConfig
): { rows: Array<Record<string, unknown>>; missingRequiredColumns: string[] } {
  if (rawRows.length === 0) {
    return { rows: [], missingRequiredColumns: config.requiredColumns };
  }

  const headerMap = new Map<string, string>();
  for (const key of Object.keys(rawRows[0] ?? {})) {
    const normalized = normalizeHeaderKey(key);
    const alias = config.columnAliases?.[normalized] ?? normalized;
    if (config.allowedColumns.includes(alias)) {
      headerMap.set(key, alias);
    }
  }

  const presentColumns = new Set(headerMap.values());
  const missingRequiredColumns = config.requiredColumns.filter((column) => !presentColumns.has(column));

  const rows = rawRows.map((raw) => {
    const mapped: Record<string, unknown> = {};
    for (const [sourceKey, targetColumn] of headerMap.entries()) {
      mapped[targetColumn] = raw[sourceKey];
    }
    return mapped;
  });

  return { rows, missingRequiredColumns };
}

export function validateImportRow(
  row: Record<string, unknown>,
  config: CatalogImportConfig
): { ok: true; data: Record<string, unknown> } | { ok: false; message: string } {
  const shape: Record<string, ZodSchema> = {};
  for (const column of config.allowedColumns) {
    const validator = config.validators[column];
    if (validator) shape[column] = validator;
  }
  const schema = z.object(shape).strict();
  const parsed = schema.safeParse(row);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    return { ok: false, message };
  }

  for (const required of config.requiredColumns) {
    const value = parsed.data[required];
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
      return { ok: false, message: `missing required column: ${required}` };
    }
  }

  return { ok: true, data: parsed.data };
}

export async function createExcelUploadJob(
  client: DbClient,
  catalogName: string,
  fileUrl: string | null
): Promise<ExcelUploadJobRecord> {
  const res = await client.query<ExcelUploadJobRecord>(
    `
      INSERT INTO catalogs.excel_upload_jobs (catalog_name, file_url, status)
      VALUES ($1, $2, 'pending')
      RETURNING
        id,
        catalog_name,
        file_url,
        started_at,
        completed_at,
        rows_total,
        rows_succeeded,
        rows_failed,
        error_log,
        status
    `,
    [catalogName, fileUrl]
  );
  return res.rows[0];
}

export async function getExcelUploadJob(client: DbClient, jobId: string): Promise<ExcelUploadJobRecord | null> {
  const res = await client.query<ExcelUploadJobRecord>(
    `
      SELECT
        id,
        catalog_name,
        file_url,
        started_at,
        completed_at,
        rows_total,
        rows_succeeded,
        rows_failed,
        error_log,
        status
      FROM catalogs.excel_upload_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId]
  );
  return res.rows[0] ?? null;
}

function dbColumnForApiColumn(column: string): string {
  if (column === "display_name") return "name";
  return column;
}

export async function processCatalogImportJob(
  client: DbClient,
  jobId: string,
  config: CatalogImportConfig,
  rows: Array<Record<string, unknown>>,
  userId: string
): Promise<ExcelUploadJobRecord> {
  if (!tableNameGuard.test(config.tableName)) {
    throw new Error(`invalid_table_name_for_catalog_import: ${config.tableName}`);
  }

  await client.query(
    `
      UPDATE catalogs.excel_upload_jobs
      SET status = 'processing', rows_total = $2, started_at = now()
      WHERE id = $1
    `,
    [jobId, rows.length]
  );

  const errors: ExcelUploadErrorRow[] = [];
  let succeeded = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 2;
    const validation = validateImportRow(rows[i], config);
    if (!validation.ok) {
      errors.push({ row: rowNumber, message: validation.message, data: rows[i] });
      continue;
    }

    const data = validation.data;
    const insertColumns = ["created_by_user_id", "updated_by_user_id"];
    const insertValues: unknown[] = [userId, userId];
    const placeholders: string[] = ["$1", "$2"];
    let paramIndex = 3;

    for (const column of config.allowedColumns) {
      if (!(column in data)) continue;
      const dbColumn = dbColumnForApiColumn(column);
      insertColumns.push(dbColumn);
      insertValues.push(data[column]);
      placeholders.push(`$${paramIndex}`);
      paramIndex += 1;
    }

    try {
      await client.query(
        `
          INSERT INTO catalogs.${config.tableName} (${insertColumns.join(", ")})
          VALUES (${placeholders.join(", ")})
        `,
        insertValues
      );
      succeeded += 1;
    } catch (error) {
      errors.push({
        row: rowNumber,
        message: (error as Error).message ?? String(error),
        data: rows[i],
      });
    }
  }

  const status: ExcelUploadJobStatus = errors.length > 0 && succeeded === 0 ? "failed" : "completed";
  const res = await client.query<ExcelUploadJobRecord>(
    `
      UPDATE catalogs.excel_upload_jobs
      SET
        status = $2,
        completed_at = now(),
        rows_succeeded = $3,
        rows_failed = $4,
        error_log = $5::jsonb
      WHERE id = $1
      RETURNING
        id,
        catalog_name,
        file_url,
        started_at,
        completed_at,
        rows_total,
        rows_succeeded,
        rows_failed,
        error_log,
        status
    `,
    [jobId, status, succeeded, errors.length, JSON.stringify(errors)]
  );

  return res.rows[0];
}
