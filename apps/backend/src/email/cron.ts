import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type pg from "pg";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { recordBackgroundJobDisabled, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { createEmailProviderFromEnv } from "./factory.js";
import type { EmailAttachment } from "./provider.js";
import { computeNextRetryAt } from "./queue.service.js";
import { deriveTextFallback, renderEmailTemplate } from "./render.js";

let emailCronInitialized = false;

function parseAttachments(raw: unknown): EmailAttachment[] | undefined {
  if (!raw) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: EmailAttachment[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const filename = typeof rec.filename === "string" ? rec.filename : "";
    const contentBase64 = typeof rec.contentBase64 === "string" ? rec.contentBase64 : "";
    if (!filename || !contentBase64) continue;
    out.push({
      filename,
      contentBase64,
      contentType: typeof rec.contentType === "string" ? rec.contentType : undefined,
    });
  }
  return out.length ? out : undefined;
}

async function insertEmailAlert(
  client: pg.PoolClient,
  args: { queueId: string; companyId: string; severity: string; code?: string; message: string; retryCount: number }
) {
  await client.query(
    `
      INSERT INTO email.email_alerts (
        queue_id,
        operating_company_id,
        severity,
        error_code,
        error_message,
        retry_count
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
    `,
    [args.queueId, args.companyId, args.severity, args.code ?? null, args.message, args.retryCount]
  );
}

/**
 * Per-entity From address.
 *
 * EMAIL_FROM_BY_COMPANY is a JSON map of operating_company_id -> address, e.g.
 *   {"91e0bf0a-133f-4ce8-a734-2586cfa66d96":"dispatch@ih35trucking.net"}
 * Unmapped entities fall back to the provider's configured default rather than failing the send —
 * a missing map entry must not silently stop a customer being billed. Parsed once per process.
 */
let senderMap: Record<string, string> | null = null;
function senderForCompany(operatingCompanyId: string): string | undefined {
  if (senderMap === null) {
    const raw = process.env.EMAIL_FROM_BY_COMPANY?.trim();
    if (!raw) {
      senderMap = {};
    } else {
      try {
        const parsed = JSON.parse(raw) as Record<string, string>;
        senderMap = Object.fromEntries(
          Object.entries(parsed).map(([id, addr]) => [id.trim(), String(addr).trim()])
        );
      } catch {
        // Loud, and non-fatal: fall back to the default sender rather than halting the queue.
        console.error({}, "[email-cron] EMAIL_FROM_BY_COMPANY is not valid JSON — using default sender");
        senderMap = {};
      }
    }
  }
  return senderMap[operatingCompanyId] || undefined;
}

/**
 * LV-010 — a message that only reached the console is NOT delivered mail.
 *
 * EMAIL_PROVIDER defaults to "console" (email/factory.ts), and on prod every one of the 232 queue rows
 * carried a 'console-email-' message id while reading status='sent'. 'sent' is the word an operator, a
 * customer dispute, a collections workflow and an auditor all read as "we delivered this" — so an
 * invoice whose only destination was stdout was indistinguishable from one a customer received.
 *
 * The transport now decides the terminal status: a console provider terminates at 'logged_only', and
 * only a real ESP may write 'sent'. The provider is recorded alongside it so the row states which
 * transport handled it instead of leaving everyone to infer it from a message-id prefix.
 */
async function finalizeSuccess(
  client: pg.PoolClient,
  id: string,
  messageId: string,
  providerKind: "console" | "ses" | "postmark" | "google"
) {
  const terminalStatus = providerKind === "console" ? "logged_only" : "sent";
  await client.query(
    `
      UPDATE email.email_queue
      SET status = $3,
          provider = $4,
          sent_at = now(),
          provider_message_id = $2,
          error_code = NULL,
          error_message = NULL,
          next_retry_at = NULL,
          updated_at = now()
      WHERE id = $1::uuid
    `,
    [id, messageId, terminalStatus, providerKind]
  );
}

async function handleFailure(
  client: pg.PoolClient,
  args: { id: string; operatingCompanyId: string; retryCount: number; maxRetries: number; message: string; code: string }
) {
  const nextRetryCount = args.retryCount + 1;
  if (nextRetryCount >= args.maxRetries) {
    await client.query(
      `
        UPDATE email.email_queue
        SET status = 'failed',
            retry_count = $2,
            error_code = $3,
            error_message = $4,
            next_retry_at = NULL,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [args.id, nextRetryCount, args.code, args.message]
    );
    await insertEmailAlert(client, {
      queueId: args.id,
      companyId: args.operatingCompanyId,
      severity: "error",
      code: args.code,
      message: args.message,
      retryCount: nextRetryCount,
    });
    return;
  }

  const nextAt = computeNextRetryAt(new Date(), nextRetryCount);
  await client.query(
    `
      UPDATE email.email_queue
      SET status = 'queued',
          retry_count = $2,
          next_retry_at = $3,
          error_code = $4,
          error_message = $5,
          updated_at = now()
      WHERE id = $1::uuid
    `,
    [args.id, nextRetryCount, nextAt.toISOString(), args.code, args.message]
  );
}

export async function claimQueuedEmailsBatch(): Promise<Array<Record<string, unknown>>> {
  return withLuciaBypass(async (client) => {
    const exists = await client.query(`SELECT to_regclass('email.email_queue') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) return [];

    const claimed = await client.query(
      `
        WITH picked AS (
          SELECT id
          FROM email.email_queue
          WHERE (
              (status = 'queued' AND (next_retry_at IS NULL OR next_retry_at <= now()))
              -- G10-C4: reclaim rows orphaned in 'sending' by a mid-flight crash/redeploy. Mirrors the
              -- outbox.events stale-lock pattern (locked_at < now() - interval '5 minutes'); here the
              -- claim stamps updated_at = now(), so a stale updated_at means the worker died before
              -- finalizeSuccess/handleFailure ran.
              OR (status = 'sending' AND updated_at < now() - interval '5 minutes')
            )
          ORDER BY created_at ASC
          LIMIT 50
          FOR UPDATE SKIP LOCKED
        )
        UPDATE email.email_queue q
        SET status = 'sending',
            updated_at = now()
        FROM picked
        WHERE q.id = picked.id
        RETURNING q.*
      `
    );
    return claimed.rows as Array<Record<string, unknown>>;
  });
}

export async function processEmailQueueTick(logger?: Pick<FastifyBaseLogger, "info" | "warn" | "error">) {
  const provider = createEmailProviderFromEnv();
  const rows = await claimQueuedEmailsBatch();
  if (rows.length === 0) return { processed: 0 };

  let processed = 0;
  for (const row of rows) {
    const id = String(row.id ?? "");
    const operatingCompanyId = String(row.operating_company_id ?? "");
    assertTenantContext(operatingCompanyId, "email.queue_processor");
    const templateKey = String(row.template_key ?? "");
    const templateVars = (row.template_vars ?? {}) as Record<string, unknown>;
    const subject = String(row.subject ?? "");
    const toAddresses = row.to_addresses as string[];
    const ccAddresses = (row.cc_addresses as string[] | null) ?? undefined;
    const bccAddresses = (row.bcc_addresses as string[] | null) ?? undefined;
    const retryCount = Number(row.retry_count ?? 0);
    const maxRetries = Number(row.max_retries ?? 5);
    const attachments = parseAttachments(row.attachments);

    let html: string;
    let text: string | undefined;
    try {
      const rendered = renderEmailTemplate(templateKey, templateVars);
      html = rendered.html;
      text =
        rendered.text ?? deriveTextFallback(html, typeof templateVars.textBody === "string" ? templateVars.textBody : undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "render_failed";
      await withLuciaBypass(async (client) => {
        await handleFailure(client, {
          id,
          operatingCompanyId,
          retryCount,
          maxRetries,
          message,
          code: "render_failed",
        });
      });
      processed += 1;
      continue;
    }

    try {
      const sent = await provider.send({
        // Multi-entity sender: TRANSP/TRK bill from the ih35trucking.net mailbox, USMCA from its own.
        // Sending every entity's invoices from one address would misrepresent who is billing the
        // customer — on a factored A/R that is a real dispute risk, not cosmetics.
        from: senderForCompany(operatingCompanyId),
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject,
        html,
        text,
        attachments,
      });
      // G10-C4: the message is already sent — if persisting the 'sent' status throws, do NOT fall into
      // the failure path (that would re-send). Log it; the stale-lock reclaim above will pick the row
      // back up after 5m and, worst case, re-send once — far better than the tick crashing mid-batch.
      try {
        await withLuciaBypass(async (client) => {
          await finalizeSuccess(client, id, sent.messageId, provider.kind);
        });
      } catch (persistError) {
        logger?.error?.(
          { err: persistError, id },
          "[email-cron] send succeeded but persisting 'sent' status failed; row will be reclaimed after stale-lock timeout"
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "send_failed";
      await withLuciaBypass(async (client) => {
        await handleFailure(client, {
          id,
          operatingCompanyId,
          retryCount,
          maxRetries,
          message,
          code: "provider_error",
        });
      });
    }

    processed += 1;
  }

  logger?.info?.({ processed }, "[email-cron] tick complete");
  return { processed };
}

export function initializeEmailCron(app: FastifyInstance) {
  if (emailCronInitialized) return;
  emailCronInitialized = true;

  if (process.env.EMAIL_CRON_ENABLED !== "true") {
    app.log.info("[email-cron] disabled (set EMAIL_CRON_ENABLED=true to enable)");
    // GO-0017-L3: an early return is an outcome, not an absence — record it so
    // _system.background_jobs stays fresh (refreshed on every boot) instead of frozen forever.
    recordBackgroundJobDisabled("email.queue_processor").catch((err) =>
      app.log.warn({ err }, "[background-job:email.queue_processor] failed to record disabled-outcome")
    );
    return;
  }

  cron.schedule("* * * * *", async () => {
    await wrapBackgroundJobTick(
      "email.queue_processor",
      async () => {
        await processEmailQueueTick(app.log);
      },
      app.log
    );
  }, { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, });

  app.log.info("[email-cron] scheduled (every 60 seconds; processes up to 50 queued rows per tick)");
}
