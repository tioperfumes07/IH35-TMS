import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { deliverScheduledReportToEmail } from "./report-delivery.js";
import { computeNextRunAt, scheduleInputFromDbRow, type ScheduleFrequency } from "./next-run.js";

let timer: NodeJS.Timeout | undefined;

function intervalMs() {
  const raw = Number(process.env.SCHEDULED_REPORTS_WORKER_INTERVAL_MS ?? "60000");
  return Number.isFinite(raw) && raw >= 5000 ? raw : 60000;
}

async function processDueRow(
  client: { query: (sql: string, vals?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  row: Record<string, unknown>,
  log: FastifyInstance["log"]
) {
  const id = String(row.id);
  const companyId = String(row.operating_company_id);
  const reportId = String(row.report_id);
  const format = String(row.format ?? "pdf") as "pdf" | "xlsx" | "csv";
  const frequency = String(row.frequency ?? "daily") as ScheduleFrequency;
  const timezone = String(row.timezone ?? "America/Chicago");
  const subjectTemplate = String(row.subject_template ?? "{report_name}");
  const recipientsTo = Array.isArray(row.recipients_to) ? (row.recipients_to as string[]) : [];
  const recipientsCc = Array.isArray(row.recipients_cc) ? (row.recipients_cc as string[]) : null;
  const recipientsBcc = Array.isArray(row.recipients_bcc) ? (row.recipients_bcc as string[]) : null;

  const bumpRes = await client.query(
    `
      UPDATE reporting.scheduled_reports
      SET last_run_at = now(),
          last_run_status = 'retrying',
          updated_at = now()
      WHERE id = $1::uuid
        AND status = 'active'
      RETURNING id
    `,
    [id]
  );
  if (!bumpRes.rows[0]?.id) return;

  const started = Date.now();

  try {
    const delivery = await deliverScheduledReportToEmail({
      operatingCompanyId: companyId,
      reportId,
      format,
      recipientsTo,
      cc: recipientsCc,
      bcc: recipientsBcc,
      subjectTemplate,
      timezone,
      frequency,
      actorUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
      pathSegment: id,
    });

    const durationMs = Date.now() - started;

    await client.query(
      `
        INSERT INTO reporting.scheduled_report_runs (
          operating_company_id,
          scheduled_report_id,
          status,
          duration_ms,
          generated_file_r2_path,
          file_size_bytes,
          email_queue_id
        )
        VALUES ($1::uuid,$2::uuid,'success',$3,$4,$5,$6::uuid)
      `,
      [companyId, id, durationMs, delivery.generated_file_r2_path, delivery.file_size_bytes, delivery.email_queue_id]
    );

    const scheduleInput = scheduleInputFromDbRow(row);
    const nextRunAt = computeNextRunAt(scheduleInput, new Date());

    await client.query(
      `
        UPDATE reporting.scheduled_reports
        SET last_run_status = 'success',
            last_run_error = NULL,
            next_run_at = $2,
            run_count = run_count + 1,
            failure_count = 0,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [id, nextRunAt]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    log.error({ err, scheduled_report_id: id }, "[scheduled-reports-worker] run failed");

    const failuresRes = await client.query(`SELECT failure_count FROM reporting.scheduled_reports WHERE id=$1::uuid`, [id]);
    const prevFailures = Number(failuresRes.rows[0]?.failure_count ?? 0);
    const failureCount = prevFailures + 1;

    const scheduleInput = scheduleInputFromDbRow(row);
    const nextRunAt = failureCount >= 3 ? null : computeNextRunAt(scheduleInput, new Date());

    await client.query(
      `
        UPDATE reporting.scheduled_reports
        SET last_run_status = 'failed',
            last_run_error = $2,
            failure_count = $3,
            status = CASE WHEN $3 >= 3 THEN 'failed' ELSE status END,
            next_run_at = CASE WHEN $3 >= 3 THEN NULL ELSE $4 END,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [id, message, failureCount, nextRunAt]
    );

    const durationMs = Date.now() - started;
    await client.query(
      `
        INSERT INTO reporting.scheduled_report_runs (
          operating_company_id,
          scheduled_report_id,
          status,
          duration_ms,
          error_message
        )
        VALUES ($1::uuid,$2::uuid,'failed',$3,$4)
      `,
      [companyId, id, durationMs, message]
    );
  }
}

export function initializeScheduledReportsWorker(app: FastifyInstance) {
  if (process.env.ENABLE_SCHEDULED_REPORTS_WORKER === "false") {
    app.log.info("[scheduled-reports-worker] disabled via ENABLE_SCHEDULED_REPORTS_WORKER=false");
    return;
  }

  const ms = intervalMs();

  const tick = async () => {
    try {
      await withLuciaBypass(async (client) => {
        const exists = await client.query(`SELECT to_regclass('reporting.scheduled_reports') IS NOT NULL AS ok`);
        if (!exists.rows[0]?.ok) return;

        const due = await client.query(
          `
            SELECT *
            FROM reporting.scheduled_reports
            WHERE status = 'active'
              AND next_run_at IS NOT NULL
              AND next_run_at <= now()
            ORDER BY next_run_at ASC
            LIMIT 10
          `
        );

        for (const row of due.rows) {
          await processDueRow(client, row as Record<string, unknown>, app.log);
        }
      });
    } catch (err) {
      app.log.error({ err }, "[scheduled-reports-worker] tick failed");
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, ms);

  app.log.info({ ms }, "[scheduled-reports-worker] started");
}

export function stopScheduledReportsWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
