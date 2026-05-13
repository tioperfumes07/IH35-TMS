import { withLuciaBypass } from "../../auth/db.js";

export type BatchAuditEventType =
  | "batch_started"
  | "preflight_qbo_check_passed"
  | "preflight_qbo_check_failed"
  | "entities_phase_started"
  | "entities_phase_completed"
  | "entity_type_started"
  | "entity_type_completed"
  | "transactions_phase_started"
  | "transactions_phase_completed"
  | "txn_type_started"
  | "txn_type_completed"
  | "attachments_phase_started"
  | "attachments_phase_completed"
  | "attachment_downloaded"
  | "page_fetched"
  | "qbo_retry"
  | "error_encountered"
  | "batch_completed"
  | "batch_failed"
  | "batch_auto_failed_stale"
  | "forensic_import_error";

const FORENSIC_IMPORT_ERROR_MAX_LEN = 2000;

/** Best-effort parse of HTTP status from QBO client Error strings (`status=401`). */
export function extractQboHttpStatus(err: unknown): number | null {
  const msg = String((err as Error)?.message ?? err);
  const match = msg.match(/\bstatus=(\d{3})\b/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export async function auditForensicImportError(
  batchId: string,
  operatingCompanyId: string,
  err: unknown,
  ctx: {
    phase: "entities" | "transactions" | "attachments" | "runner" | "admin";
    step: string;
    entity_type?: string | null;
    last_qbo_entity_id?: string | null;
  }
) {
  const rawMessage = String((err as Error)?.message ?? err);
  const error_message = rawMessage.slice(0, FORENSIC_IMPORT_ERROR_MAX_LEN);
  const last_qbo_response_status = extractQboHttpStatus(err);
  const entity_type = ctx.entity_type ? String(ctx.entity_type) : null;
  await auditBatchEvent(batchId, operatingCompanyId, "forensic_import_error", {
    error_message,
    entity_type: entity_type ?? undefined,
    severity: "error",
    event_class: "forensic_import_error",
    context_json: {
      phase: ctx.phase,
      entity_type: entity_type,
      last_qbo_response_status,
      last_qbo_entity_id: ctx.last_qbo_entity_id ? String(ctx.last_qbo_entity_id) : null,
      step: ctx.step,
    },
  });
}

export async function auditBatchEvent(
  batchId: string,
  operatingCompanyId: string,
  eventType: BatchAuditEventType,
  metadata: Record<string, unknown> = {}
) {
  void withLuciaBypass(async (client) => {
    await client.query(
      `
        INSERT INTO qbo_archive.import_batch_audit_log (
          batch_id,
          operating_company_id,
          event_type,
          entity_type,
          page_number,
          total_pages,
          records_processed,
          duration_ms,
          error_message,
          metadata,
          occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
      `,
      [
        batchId,
        operatingCompanyId,
        eventType,
        typeof metadata.entity_type === "string" ? metadata.entity_type : null,
        typeof metadata.page_number === "number" ? metadata.page_number : null,
        typeof metadata.total_pages === "number" ? metadata.total_pages : null,
        typeof metadata.records_processed === "number" ? metadata.records_processed : null,
        typeof metadata.duration_ms === "number" ? metadata.duration_ms : null,
        typeof metadata.error_message === "string" ? metadata.error_message : null,
        JSON.stringify(metadata),
      ]
    );
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "qbo_archive.batch_audit_logged",
      "info",
      JSON.stringify({ batch_id: batchId, operating_company_id: operatingCompanyId, event_type: eventType }),
      "P6-FOUNDATION-OPS",
    ]);
  }).catch(() => {
    // Audit writes are best effort by design; never block import runner.
  });
}
