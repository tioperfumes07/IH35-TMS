import os from "node:os";
import type { PoolClient } from "pg";
import { pool } from "../auth/db.js";
import { retryAfterMsFromError } from "../lib/fmcsa-http-errors.js";
import { isPermanentDeliveryError } from "./delivery-errors.js";
import { buildOutboxHandlerRegistry, type OutboxPayload } from "./handlers/registry.js";
import { shouldReleaseOutboxDedupeKey } from "./reusable-dedupe.js";
import { computeOutboxRetryDelayMs, OUTBOX_MAX_RETRIES } from "./retry-backoff.js";

type ClaimedEvent = {
  id: string;
  event_type: string;
  payload: OutboxPayload;
  retry_count: number;
};

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
const MAX_RETRIES = OUTBOX_MAX_RETRIES;

/**
 * Global claim is architectural (shared OutboxProcessor for all event types).
 * Tenant safety for FMCSA is enforced in-handler via payload.operating_company_id
 * + scoped mdata.customers load (cross-tenant → PermanentDeliveryError).
 */
export const OUTBOX_CLAIM_IS_GLOBAL_ARCHITECTURAL = true as const;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs(retryCountAfterFailure: number, error?: unknown) {
  const backoff = computeOutboxRetryDelayMs(retryCountAfterFailure);
  const retryAfter = retryAfterMsFromError(error);
  if (retryAfter == null) return backoff;
  // Honor bounded Retry-After without going below schedule floor for the attempt.
  return Math.max(backoff, retryAfter);
}

function releaseDedupeSqlFragment(eventType: string): string {
  if (!shouldReleaseOutboxDedupeKey(eventType)) return "";
  // Clears slot so the same identity fingerprint can re-enqueue after terminal.
  return ",\n              dedupe_key = NULL";
}

export class OutboxProcessor {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private readonly handlerRegistry = buildOutboxHandlerRegistry();
  private readonly instanceId = `${os.hostname()}:${process.pid}`;

  start() {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.runLoop();
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    await this.loopPromise;
  }

  private log(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      console.log(`[outbox] ${message}`, meta);
      return;
    }
    console.log(`[outbox] ${message}`);
  }

  private async runLoop() {
    while (this.running) {
      try {
        await this.pollAndProcessBatch();
      } catch (error) {
        this.log("poll loop error", { error: String((error as Error)?.message ?? error) });
      }

      if (!this.running) break;
      await sleep(POLL_INTERVAL_MS);
    }
  }

  private async pollAndProcessBatch() {
    const claimRes = await pool.query<ClaimedEvent>(
      `
        WITH picked AS (
          SELECT e.id
          FROM outbox.events e
          WHERE e.delivered_at IS NULL
            AND e.failed_at IS NULL
            AND e.next_retry_at <= now()
            AND e.retry_count < $1
            AND (e.locked_at IS NULL OR e.locked_at < now() - interval '5 minutes')
          ORDER BY e.created_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        UPDATE outbox.events e
        SET locked_at = now(),
            locked_by = $3,
            updated_at = now()
        FROM picked
        WHERE e.id = picked.id
        RETURNING e.id, e.event_type, e.payload, e.retry_count
      `,
      [MAX_RETRIES, BATCH_SIZE, this.instanceId]
    );

    const events = claimRes.rows;
    if (events.length === 0) return;
    this.log("claimed outbox batch", { count: events.length, instanceId: this.instanceId });

    // Fail-closed per claimed event: pool.connect() / process failures must NOT abort
    // the sibling loop (avoids 5-minute lock abandonment for the rest of the batch).
    for (const event of events) {
      await this.processClaimedEvent(event);
    }
  }

  /**
   * Per-event boundary covering connection acquisition + delivery + retry scheduling.
   * Never rethrows — siblings in the claimed batch always continue.
   */
  private async processClaimedEvent(event: ClaimedEvent) {
    try {
      await this.processEvent(event);
    } catch (error) {
      this.log("per-event boundary caught unexpected failure", {
        eventId: event.id,
        error: String((error as Error)?.message ?? error),
      });
      try {
        await this.scheduleRetryViaPoolQuery(event, error as Error);
      } catch (scheduleError) {
        this.log("per-event boundary schedule failed; unlock fallback", {
          eventId: event.id,
          error: String((scheduleError as Error)?.message ?? scheduleError),
        });
        await this.unlockClaimedEventBestEffort(event, error as Error);
      }
    }
  }

  private tenantMeta(payload: OutboxPayload) {
    const operatingCompanyId =
      typeof payload.operating_company_id === "string" ? payload.operating_company_id : null;
    const customerId = typeof payload.customer_id === "string" ? payload.customer_id : null;
    return { operating_company_id: operatingCompanyId, customer_id: customerId };
  }

  private async processEvent(event: ClaimedEvent) {
    const handler = this.handlerRegistry.get(event.event_type);
    if (!handler) {
      await this.markFailedNow(event, `no handler registered for event_type=${event.event_type}`);
      return;
    }

    if (!handler.canHandle()) {
      // A handler that declares requiresDelivery must NOT be marked delivered when it cannot send.
      // Reporting "delivered" for an event a person is waiting on is the silent-success class this
      // codebase has been removing; failing loudly keeps it visible and retryable once the channel
      // (credentials, provider, config) is restored.
      if (handler.requiresDelivery) {
        await this.markFailedNow(
          event,
          `handler for event_type=${event.event_type} is unavailable in this environment and this event requires delivery`
        );
        return;
      }
      await this.markDelivered(event, `skipped ${event.event_type} (handler unavailable in this environment)`, true);
      return;
    }

    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (connectError) {
      // Connection acquisition is inside the per-event boundary — schedule retry without
      // abandoning siblings. Uses pool.query (one-shot) when dedicated clients are unavailable.
      await this.scheduleRetryViaPoolQuery(event, connectError as Error);
      return;
    }

    try {
      await client.query("BEGIN");
      const result = await handler.deliver(event.payload, {
        client,
        eventId: event.id,
        instanceId: this.instanceId,
        log: (message, meta) => this.log(message, meta),
      });

      await client.query(
        `
          UPDATE outbox.events
          SET delivered_at = now(),
              failed_at = NULL,
              locked_at = NULL,
              locked_by = NULL,
              last_error = CASE WHEN $2::text = '' THEN NULL ELSE left($2, 2000) END,
              updated_at = now()
              ${releaseDedupeSqlFragment(event.event_type)}
          WHERE id = $1
        `,
        [event.id, result?.message ?? ""]
      );
      await this.appendOutboxAudit(client, "outbox.event.delivered", "info", {
        outbox_event_id: event.id,
        event_type: event.event_type,
        retry_count: event.retry_count,
        instance_id: this.instanceId,
        dedupe_key_released: shouldReleaseOutboxDedupeKey(event.event_type),
        ...this.tenantMeta(event.payload),
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isPermanentDeliveryError(error)) {
        await this.markFailedNow(event, String((error as Error)?.message ?? error));
        return;
      }
      await this.markRetryOrFailure(event, error as Error);
    } finally {
      client.release();
    }
  }

  /**
   * Bounded fallback when pool.connect() fails (or outer boundary catches): schedule retry /
   * unlock via pool.query so claimed-row semantics stay consistent without a dedicated client.
   * Does not weaken SKIP LOCKED / idempotency — only advances retry_count + clears this lock.
   */
  private async scheduleRetryViaPoolQuery(event: ClaimedEvent, error: Error) {
    const nextRetryCount = Number(event.retry_count ?? 0) + 1;
    const exhausted = nextRetryCount >= MAX_RETRIES;
    const errorMessage = String(error?.message ?? error);
    const delayMs = retryDelayMs(nextRetryCount, error);
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    const releaseOnExhaust = exhausted ? releaseDedupeSqlFragment(event.event_type) : "";

    try {
      await pool.query(
        `
          UPDATE outbox.events
          SET retry_count = $2,
              next_retry_at = CASE WHEN $3 THEN next_retry_at ELSE $4::timestamptz END,
              failed_at = CASE WHEN $3 THEN now() ELSE failed_at END,
              last_error = left($5, 2000),
              locked_at = NULL,
              locked_by = NULL,
              updated_at = now()
              ${releaseOnExhaust}
          WHERE id = $1
        `,
        [event.id, nextRetryCount, exhausted, nextRetryAt, errorMessage]
      );
      try {
        await pool.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
          exhausted ? "outbox.event.failed" : "outbox.event.retried",
          "warning",
          JSON.stringify({
            outbox_event_id: event.id,
            event_type: event.event_type,
            retry_count: nextRetryCount,
            next_retry_at: exhausted ? null : nextRetryAt,
            retry_delay_ms: delayMs,
            retry_after_ms: retryAfterMsFromError(error),
            error: errorMessage,
            instance_id: this.instanceId,
            connect_boundary_fallback: true,
            max_attempts_exhausted: exhausted,
            ...this.tenantMeta(event.payload),
          }),
          "BT-2-OUTBOX-PROCESSOR",
        ]);
      } catch {
        /* audit best-effort — retry state already persisted */
      }
      this.log("outbox retry scheduled via pool.query fallback", {
        eventId: event.id,
        exhausted,
        nextRetryCount,
        error: errorMessage,
      });
    } catch (scheduleError) {
      this.log("pool.query retry schedule failed", {
        eventId: event.id,
        error: String((scheduleError as Error)?.message ?? scheduleError),
      });
      await this.unlockClaimedEventBestEffort(event, error);
    }
  }

  /** Last-resort unlock so the event is not stuck until the 5-minute stale reclaim. */
  private async unlockClaimedEventBestEffort(event: ClaimedEvent, error: Error) {
    try {
      await pool.query(
        `
          UPDATE outbox.events
          SET locked_at = NULL,
              locked_by = NULL,
              last_error = left($2, 2000),
              updated_at = now()
          WHERE id = $1
            AND locked_by = $3
        `,
        [event.id, String(error?.message ?? error), this.instanceId]
      );
    } catch (unlockError) {
      this.log("unlock fallback failed; stale-lock reclaim remains", {
        eventId: event.id,
        error: String((unlockError as Error)?.message ?? unlockError),
      });
    }
  }

  private async markDelivered(event: ClaimedEvent, message: string, skipped: boolean) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          UPDATE outbox.events
          SET delivered_at = now(),
              failed_at = NULL,
              locked_at = NULL,
              locked_by = NULL,
              last_error = left($2, 2000),
              updated_at = now()
              ${releaseDedupeSqlFragment(event.event_type)}
          WHERE id = $1
        `,
        [event.id, message]
      );
      await this.appendOutboxAudit(client, "outbox.event.delivered", "info", {
        outbox_event_id: event.id,
        event_type: event.event_type,
        skipped,
        message,
        instance_id: this.instanceId,
        dedupe_key_released: shouldReleaseOutboxDedupeKey(event.event_type),
        ...this.tenantMeta(event.payload),
      });
      await client.query("COMMIT");
      this.log("marked outbox event delivered", { eventId: event.id, skipped });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      this.log("failed marking outbox event delivered", { eventId: event.id, error: String((error as Error)?.message ?? error) });
    } finally {
      client.release();
    }
  }

  private async markFailedNow(event: ClaimedEvent, reason: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          UPDATE outbox.events
          SET failed_at = now(),
              locked_at = NULL,
              locked_by = NULL,
              last_error = left($2, 2000),
              updated_at = now()
              ${releaseDedupeSqlFragment(event.event_type)}
          WHERE id = $1
        `,
        [event.id, reason]
      );
      await this.appendOutboxAudit(client, "outbox.event.failed", "warning", {
        outbox_event_id: event.id,
        event_type: event.event_type,
        retry_count: event.retry_count,
        reason,
        instance_id: this.instanceId,
        dedupe_key_released: shouldReleaseOutboxDedupeKey(event.event_type),
        ...this.tenantMeta(event.payload),
      });
      await client.query("COMMIT");
      this.log("marked outbox event failed", { eventId: event.id, reason });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      this.log("failed marking outbox event failed", { eventId: event.id, error: String((error as Error)?.message ?? error) });
    } finally {
      client.release();
    }
  }

  private async markRetryOrFailure(event: ClaimedEvent, error: Error) {
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
    } catch (connectError) {
      await this.scheduleRetryViaPoolQuery(
        event,
        new Error(
          `retry-schedule connect failed: ${String((connectError as Error)?.message ?? connectError)}; prior: ${String(error?.message ?? error)}`
        )
      );
      return;
    }

    const nextRetryCount = Number(event.retry_count ?? 0) + 1;
    const exhausted = nextRetryCount >= MAX_RETRIES;
    const errorMessage = String(error?.message ?? error);
    const delayMs = retryDelayMs(nextRetryCount, error);
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    const releaseOnExhaust = exhausted ? releaseDedupeSqlFragment(event.event_type) : "";

    try {
      await client.query("BEGIN");
      await client.query(
        `
          UPDATE outbox.events
          SET retry_count = $2,
              next_retry_at = CASE WHEN $3 THEN next_retry_at ELSE $4::timestamptz END,
              failed_at = CASE WHEN $3 THEN now() ELSE failed_at END,
              last_error = left($5, 2000),
              locked_at = NULL,
              locked_by = NULL,
              updated_at = now()
              ${releaseOnExhaust}
          WHERE id = $1
        `,
        [event.id, nextRetryCount, exhausted, nextRetryAt, errorMessage]
      );

      if (exhausted) {
        await this.appendOutboxAudit(client, "outbox.event.failed", "warning", {
          outbox_event_id: event.id,
          event_type: event.event_type,
          retry_count: nextRetryCount,
          error: errorMessage,
          instance_id: this.instanceId,
          max_attempts_exhausted: true,
          dedupe_key_released: shouldReleaseOutboxDedupeKey(event.event_type),
          ...this.tenantMeta(event.payload),
        });
      } else {
        await this.appendOutboxAudit(client, "outbox.event.retried", "warning", {
          outbox_event_id: event.id,
          event_type: event.event_type,
          retry_count: nextRetryCount,
          next_retry_at: nextRetryAt,
          retry_delay_ms: delayMs,
          retry_after_ms: retryAfterMsFromError(error),
          error: errorMessage,
          instance_id: this.instanceId,
          ...this.tenantMeta(event.payload),
        });
      }
      await client.query("COMMIT");
      this.log("outbox delivery retry/fail recorded", { eventId: event.id, exhausted, nextRetryCount, error: errorMessage });
    } catch (updateError) {
      await client.query("ROLLBACK").catch(() => undefined);
      this.log("failed to update retry state", { eventId: event.id, error: String((updateError as Error)?.message ?? updateError) });
      await this.scheduleRetryViaPoolQuery(event, error).catch(() => undefined);
    } finally {
      client.release();
    }
  }

  private async appendOutboxAudit(
    client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
    eventClass: "outbox.event.delivered" | "outbox.event.retried" | "outbox.event.failed",
    severity: "info" | "warning",
    payload: Record<string, unknown>
  ) {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      "BT-2-OUTBOX-PROCESSOR",
    ]);
  }
}
