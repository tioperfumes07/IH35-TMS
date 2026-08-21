// RATECON-3 — AI model-lifecycle monitor.
//
// A hardcoded Anthropic model was retired with 60 days' notice, but nothing watched for it, so the retirement
// landed as a silent multi-feature outage. This daily job calls the Claude API's GET /v1/models and raises a
// Sentry alert (+ best-effort audit event) if any model the backend depends on (ai/models.ts
// REGISTERED_MODEL_IDS) is missing from the live list — converting the next retirement into a two-month
// warning instead of an outage. Read-only; reuses the shared client's key path (no new env var).
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import * as Sentry from "@sentry/node";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { listAnthropicModels, AnthropicNotConfiguredError } from "../ai/anthropic-messages.js";
import { REGISTERED_MODEL_IDS } from "../ai/models.js";

let initialized = false;
const CRON_NAME = "ai.model_lifecycle_monitor";

type DbClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> };

async function bestEffortAuditEvent(
  eventClass: string,
  severity: "info" | "warning",
  payload: Record<string, unknown>,
  log: FastifyInstance["log"],
): Promise<void> {
  // A global (non-tenant) system event; the audit row is a nice-to-have. Never let it break the alert path.
  try {
    await withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
        eventClass,
        severity,
        JSON.stringify(payload),
        "RATECON-3",
      ]);
    });
  } catch (err) {
    log.warn({ err }, "model-lifecycle monitor: audit event write failed (non-fatal)");
  }
}

/** Runs one check. Exported so a unit test can drive it directly. Returns the outcome. */
export async function runModelLifecycleCheck(
  log: FastifyInstance["log"],
): Promise<{ configured: boolean; available: number; missing: string[] }> {
  let models;
  try {
    models = await listAnthropicModels();
  } catch (err) {
    if (err instanceof AnthropicNotConfiguredError) {
      log.info("model-lifecycle monitor: Anthropic API key not configured — skipping");
      return { configured: false, available: 0, missing: [] };
    }
    // A transient API failure of the monitor itself is worth a Sentry event (but not fatal to the tick).
    Sentry.captureException(err, { tags: { subsystem: "ai-model-lifecycle", phase: "list_models" } });
    log.error({ err }, "model-lifecycle monitor: GET /v1/models failed");
    throw err;
  }

  const availableIds = new Set(models.map((m) => m.id));
  const missing = REGISTERED_MODEL_IDS.filter((id) => !availableIds.has(id));

  if (missing.length > 0) {
    Sentry.captureMessage(
      `Anthropic model(s) missing from /v1/models: ${missing.join(", ")} — retirement imminent or active; update ai/models.ts`,
      { level: "error", tags: { subsystem: "ai-model-lifecycle" }, extra: { missing, registered: [...REGISTERED_MODEL_IDS], available: models.length } },
    );
    log.error({ missing, registered: [...REGISTERED_MODEL_IDS] }, "model-lifecycle monitor: registered model(s) MISSING from Anthropic /v1/models");
    await bestEffortAuditEvent("ai_model_missing_or_deprecated", "warning", { cron_name: CRON_NAME, missing, registered: [...REGISTERED_MODEL_IDS], available_count: models.length }, log);
  } else {
    await bestEffortAuditEvent("ai_model_lifecycle_ok", "info", { cron_name: CRON_NAME, registered: [...REGISTERED_MODEL_IDS], available_count: models.length }, log);
  }
  return { configured: true, available: models.length, missing };
}

export function initializeModelLifecycleMonitorCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_MODEL_LIFECYCLE_MONITOR_CRON === "false") {
    app.log.info("Model-lifecycle monitor cron disabled via ENABLE_MODEL_LIFECYCLE_MONITOR_CRON=false");
    return;
  }
  cron.schedule(
    "30 8 * * *",
    async () => {
      await wrapBackgroundJobTick(CRON_NAME, async () => { await runModelLifecycleCheck(app.log); }, app.log);
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" },
  );
  app.log.info("Model-lifecycle monitor cron scheduled (daily 08:30 America/Chicago)");
}
