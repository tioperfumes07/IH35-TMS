import * as XLSX from "xlsx";
import type { z } from "zod";

export type ExcelUploadJobStatus = "pending" | "processing" | "completed" | "failed";

export type ExcelUploadFailure = {
  row_number: number;
  reason: string;
  row: Record<string, unknown>;
};

export type ExcelUploadJobResult = {
  job_id: string;
  rows_total: number;
  rows_succeeded: number;
  rows_failed: number;
  failures: ExcelUploadFailure[];
  status: ExcelUploadJobStatus;
};

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export function normalizeHeaderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseSpreadsheetRows(buffer: Buffer, filename?: string): Array<Record<string, unknown>> {
  const lowerName = (filename ?? "").toLowerCase();
  if (lowerName.endsWith(".csv")) {
    const text = buffer.toString("utf8");
    const wb = XLSX.read(text, { type: "string" });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  }

  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

export function mapRowToColumns(
  rawRow: Record<string, unknown>,
  allowedColumns: string[]
): Record<string, unknown> {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(rawRow)) {
    normalized.set(normalizeHeaderKey(key), value);
  }

  const mapped: Record<string, unknown> = {};
  for (const column of allowedColumns) {
    if (normalized.has(column)) {
      mapped[column] = normalized.get(column);
    }
  }
  return mapped;
}

export async function createExcelUploadJob(
  client: DbClient,
  catalogName: string,
  fileUrl?: string | null
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO catalogs.excel_upload_jobs (catalog_name, file_url, status)
      VALUES ($1, $2, 'pending')
      RETURNING id
    `,
    [catalogName, fileUrl ?? null]
  );
  return String(res.rows[0]?.id);
}

export async function updateExcelUploadJob(
  client: DbClient,
  jobId: string,
  patch: {
    status: ExcelUploadJobStatus;
    rows_total?: number;
    rows_succeeded?: number;
    rows_failed?: number;
    error_log?: ExcelUploadFailure[];
    completed_at?: string | null;
  }
): Promise<void> {
  await client.query(
    `
      UPDATE catalogs.excel_upload_jobs
      SET status = $2,
          rows_total = COALESCE($3, rows_total),
          rows_succeeded = COALESCE($4, rows_succeeded),
          rows_failed = COALESCE($5, rows_failed),
          error_log = COALESCE($6::jsonb, error_log),
          completed_at = COALESCE($7::timestamptz, completed_at)
      WHERE id = $1
    `,
    [
      jobId,
      patch.status,
      patch.rows_total ?? null,
      patch.rows_succeeded ?? null,
      patch.rows_failed ?? null,
      patch.error_log ? JSON.stringify(patch.error_log) : null,
      patch.completed_at ?? null,
    ]
  );
}

export async function getExcelUploadJob(client: DbClient, jobId: string) {
  const res = await client.query(
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

export async function processSpreadsheetUpload<T extends Record<string, unknown>>(options: {
  client: DbClient;
  catalogName: string;
  buffer: Buffer;
  filename?: string;
  allowedColumns: string[];
  requiredColumns: string[];
  validators: Record<string, z.ZodTypeAny>;
  insertRow: (row: T) => Promise<void>;
  fileUrl?: string | null;
}): Promise<ExcelUploadJobResult> {
  const jobId = await createExcelUploadJob(options.client, options.catalogName, options.fileUrl);
  await updateExcelUploadJob(options.client, jobId, { status: "processing" });

  const rawRows = parseSpreadsheetRows(options.buffer, options.filename);
  const failures: ExcelUploadFailure[] = [];
  let rowsSucceeded = 0;

  for (let index = 0; index < rawRows.length; index += 1) {
    const rowNumber = index + 2;
    const mapped = mapRowToColumns(rawRows[index] ?? {}, options.allowedColumns);
    const missingRequired = options.requiredColumns.filter(
      (column) => mapped[column] === null || mapped[column] === undefined || mapped[column] === ""
    );
    if (missingRequired.length > 0) {
      failures.push({
        row_number: rowNumber,
        reason: `missing_required_columns:${missingRequired.join(",")}`,
        row: mapped,
      });
      continue;
    }

    const validated: Record<string, unknown> = {};
    let rowValid = true;
    for (const [column, schema] of Object.entries(options.validators)) {
      if (!(column in mapped)) continue;
      const parsed = schema.safeParse(mapped[column]);
      if (!parsed.success) {
        failures.push({
          row_number: rowNumber,
          reason: `invalid_${column}`,
          row: mapped,
        });
        rowValid = false;
        break;
      }
      validated[column] = parsed.data;
    }
    if (!rowValid) continue;

    try {
      await options.insertRow(validated as T);
      rowsSucceeded += 1;
    } catch (error) {
      failures.push({
        row_number: rowNumber,
        reason: (error as Error).message || "insert_failed",
        row: mapped,
      });
    }
  }

  const status: ExcelUploadJobStatus = failures.length > 0 && rowsSucceeded === 0 ? "failed" : "completed";
  await updateExcelUploadJob(options.client, jobId, {
    status,
    rows_total: rawRows.length,
    rows_succeeded: rowsSucceeded,
    rows_failed: failures.length,
    error_log: failures,
    completed_at: new Date().toISOString(),
  });

  return {
    job_id: jobId,
    rows_total: rawRows.length,
    rows_succeeded: rowsSucceeded,
    rows_failed: failures.length,
    failures,
    status,
  };
}
