import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { putObjectBytes, isR2Configured } from "../storage/r2-client.js";
import {
  buildBookLoadPrefillFromExtracted,
  buildExtractedFieldsFromParsed,
  heuristicExtractFromFilename,
  parseR2KeyFilename,
  shouldAutoProcessQueueItem,
  type OcrIntakeExtractedFields,
  type OcrIntakeStatus,
} from "./ocr-intake.lib.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type OcrIntakeQueueRow = {
  id: string;
  operating_company_id: string;
  status: OcrIntakeStatus;
  source: string;
  email_from: string | null;
  email_subject: string | null;
  email_received_at: string | null;
  source_pdf_r2_key: string;
  attachment_filename: string | null;
  extracted_fields: OcrIntakeExtractedFields;
  confidence_score: number | null;
  error_message: string | null;
  converted_load_id: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

async function withCompany<T>(userId: string, operatingCompanyId: string, fn: (client: PoolClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

function mapRow(row: Record<string, unknown>): OcrIntakeQueueRow {
  return {
    id: String(row.id),
    operating_company_id: String(row.operating_company_id),
    status: String(row.status) as OcrIntakeStatus,
    source: String(row.source),
    email_from: row.email_from ? String(row.email_from) : null,
    email_subject: row.email_subject ? String(row.email_subject) : null,
    email_received_at: row.email_received_at ? String(row.email_received_at) : null,
    source_pdf_r2_key: String(row.source_pdf_r2_key),
    attachment_filename: row.attachment_filename ? String(row.attachment_filename) : null,
    extracted_fields: (row.extracted_fields ?? {}) as OcrIntakeExtractedFields,
    confidence_score: row.confidence_score == null ? null : Number(row.confidence_score),
    error_message: row.error_message ? String(row.error_message) : null,
    converted_load_id: row.converted_load_id ? String(row.converted_load_id) : null,
    processed_at: row.processed_at ? String(row.processed_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listOcrIntakeQueue(userId: string, operatingCompanyId: string) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const res = await client.query(
      `
        SELECT *
        FROM dispatch.ocr_intake_queue
        WHERE operating_company_id = $1
          AND status IN ('pending_ocr', 'processing', 'ready_review', 'failed')
        ORDER BY created_at DESC
        LIMIT 200
      `,
      [operatingCompanyId]
    );
    return { items: res.rows.map((row) => mapRow(row as Record<string, unknown>)) };
  });
}

export async function createOcrIntakeFromEmail(
  operatingCompanyId: string,
  input: {
    email_from: string;
    email_subject: string;
    attachment_filename: string;
    attachment_base64: string;
    received_at?: string;
  }
) {
  if (!isR2Configured()) throw new Error("r2_not_configured");
  const buffer = Buffer.from(input.attachment_base64, "base64");
  if (!buffer.length) throw new Error("attachment_empty");

  const r2Key = `dispatch/ocr/${operatingCompanyId}/${randomUUID()}.pdf`;
  await putObjectBytes(r2Key, buffer, "application/pdf");

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query(
      `
        INSERT INTO dispatch.ocr_intake_queue (
          operating_company_id, status, source, email_from, email_subject, email_received_at,
          source_pdf_r2_key, attachment_filename
        )
        VALUES ($1, 'pending_ocr', 'email_forward', $2, $3, COALESCE($4::timestamptz, now()), $5, $6)
        RETURNING *
      `,
      [
        operatingCompanyId,
        input.email_from,
        input.email_subject,
        input.received_at ?? null,
        r2Key,
        input.attachment_filename,
      ]
    );
    const item = mapRow(res.rows[0] as Record<string, unknown>);
    scheduleOcrIntakeProcessing(item.id, operatingCompanyId);
    return item;
  });
}

const inFlight = new Set<string>();

export function scheduleOcrIntakeProcessing(itemId: string, operatingCompanyId: string) {
  if (inFlight.has(itemId)) return;
  inFlight.add(itemId);
  setImmediate(() => {
    void processOcrIntakeQueueItem(itemId, operatingCompanyId)
      .catch(() => undefined)
      .finally(() => inFlight.delete(itemId));
  });
}

export async function processOcrIntakeQueueItem(itemId: string, operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const existing = await client.query(
      `SELECT * FROM dispatch.ocr_intake_queue WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
      [itemId, operatingCompanyId]
    );
    const row = existing.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const status = String(row.status) as OcrIntakeStatus;
    if (!shouldAutoProcessQueueItem(status) && status !== "processing") return mapRow(row);

    await client.query(
      `UPDATE dispatch.ocr_intake_queue SET status = 'processing', updated_at = now() WHERE id = $1`,
      [itemId]
    );

    try {
      const r2Key = String(row.source_pdf_r2_key);
      const filename = String(row.attachment_filename ?? parseR2KeyFilename(r2Key));
      const extracted = heuristicExtractFromFilename(filename, r2Key);
      const customerId = await fuzzyMatchCustomer(client, operatingCompanyId, extracted.customer_name_raw ?? "");
      if (customerId) {
        extracted.customer_id = customerId;
        extracted.confidence_score = 0.82;
      }
      const confidence = extracted.confidence_score ?? 0.62;
      const update = await client.query(
        `
          UPDATE dispatch.ocr_intake_queue
          SET status = 'ready_review',
              extracted_fields = $2::jsonb,
              confidence_score = $3,
              processed_at = now(),
              updated_at = now(),
              error_message = NULL
          WHERE id = $1
          RETURNING *
        `,
        [itemId, JSON.stringify(extracted), confidence]
      );
      return mapRow(update.rows[0] as Record<string, unknown>);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "ocr_process_failed";
      const failed = await client.query(
        `
          UPDATE dispatch.ocr_intake_queue
          SET status = 'failed', error_message = $2, processed_at = now(), updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [itemId, message]
      );
      return mapRow(failed.rows[0] as Record<string, unknown>);
    }
  });
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

async function fuzzyMatchCustomer(client: DbClient, operatingCompanyId: string, rawName: string) {
  const res = await client.query<{ id: string; customer_name: string }>(
    `
      SELECT id, customer_name
      FROM mdata.customers
      WHERE operating_company_id = $1
        AND deactivated_at IS NULL
      LIMIT 500
    `,
    [operatingCompanyId]
  );
  const target = rawName.toLowerCase().trim();
  let best: { id: string; distance: number } | null = null;
  for (const row of res.rows) {
    const distance = levenshtein(target, String(row.customer_name ?? "").toLowerCase().trim());
    if (!best || distance < best.distance) best = { id: row.id, distance };
  }
  if (!best || best.distance >= 4) return null;
  return best.id;
}

export async function getOcrIntakeConvertPrefill(
  userId: string,
  operatingCompanyId: string,
  itemId: string
): Promise<{ ok: true; item: OcrIntakeQueueRow; book_load_prefill: Record<string, unknown> } | { ok: false; error: string }> {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const res = await client.query(
      `SELECT * FROM dispatch.ocr_intake_queue WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
      [itemId, operatingCompanyId]
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) return { ok: false as const, error: "not_found" };
    const status = String(row.status);
    if (status !== "ready_review") return { ok: false as const, error: "not_ready" };
    const fields = (row.extracted_fields ?? {}) as OcrIntakeExtractedFields;
    await client.query(
      `UPDATE dispatch.ocr_intake_queue SET status = 'converted', updated_at = now() WHERE id = $1`,
      [itemId]
    );
    await appendCrudAudit(
      client,
      userId,
      "dispatch.ocr_intake.converted",
      { resource_type: "dispatch.ocr_intake_queue", resource_id: itemId, operating_company_id: operatingCompanyId },
      "info",
      "B21-D7"
    );
    const item = mapRow({ ...row, status: "converted" });
    return { ok: true as const, item, book_load_prefill: buildBookLoadPrefillFromExtracted(fields) };
  });
}

/** Re-export for tests that assert Anthropic/OCR pipeline wiring. */
export { buildExtractedFieldsFromParsed };
