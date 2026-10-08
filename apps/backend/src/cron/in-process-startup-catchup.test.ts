import { describe, expect, it } from "vitest";
import { IN_PROCESS_CATCHUP_WINDOWS } from "./in-process-startup-catchup.js";

describe("in-process startup catch-up windows", () => {
  it("matches health.routes two-period thresholds for the jobs it covers", () => {
    const byName = Object.fromEntries(IN_PROCESS_CATCHUP_WINDOWS.map((j) => [j.jobName, j.maxStaleMinutes]));
    expect(byName["samsara.webhook_projection_cron"]).toBe(15);
    expect(byName["ai.model_lifecycle_monitor"]).toBe(2880);
    expect(byName["safety.reminders_cron"]).toBe(2880);
    expect(byName["cash_advance.expiry_cron"]).toBe(1560);
    expect(byName["insurance.payment_reminder_cron"]).toBe(1560);
    expect(byName["legal.matters_reminder_cron"]).toBe(1560);
    expect(byName["drivers.document_alert_engine_cron"]).toBe(2880);
    expect(byName["safety.cert_expiry_monitor"]).toBe(2880);
    expect(byName["search.indexer_incremental"]).toBe(2880);
    expect(byName["idempotency.cleanup_cron"]).toBe(2880);
    expect(byName["email.queue_processor"]).toBe(5);
    expect(byName["chat.confirmation_escalation"]).toBe(5);
    // SAMSARA-REMOTE-COUNT-COLLECTOR-NEVER-TICKS-UNDER-DEPLOY-CHURN (2026-09-09): matches
    // health.routes.ts's own `samsara.remote_count_collector` rule (1440 = 2x its 720min/12h
    // cron period) so the catch-up window and the /healthz staleness alarm agree on "late".
    expect(byName["samsara.remote_count_collector"]).toBe(1440);
  });

  it("does not include QBO push or money poster jobs", () => {
    const names = IN_PROCESS_CATCHUP_WINDOWS.map((j) => j.jobName).join(" ");
    expect(names).not.toMatch(/qbo/);
    expect(names).not.toMatch(/collections_sync/);
    expect(names).not.toMatch(/factoring_default_interest/);
    expect(names).not.toMatch(/loves_card_import/);
  });

  it("runs retry_held and plaid before integrity so a hung integrity tick cannot starve them", () => {
    const names = IN_PROCESS_CATCHUP_WINDOWS.map((j) => j.jobName);
    const retryIdx = names.indexOf("accounting.retry_held_expense_postings");
    const plaidIdx = names.indexOf("banking.plaid_daily_sync_cron");
    const integrityIdx = names.indexOf("safety.integrity_alert_engine_cron");
    expect(retryIdx).toBeGreaterThanOrEqual(0);
    expect(plaidIdx).toBeGreaterThanOrEqual(0);
    expect(integrityIdx).toBeGreaterThanOrEqual(0);
    expect(retryIdx).toBeLessThan(integrityIdx);
    expect(plaidIdx).toBeLessThan(integrityIdx);
    const integrity = IN_PROCESS_CATCHUP_WINDOWS.find((j) => j.jobName === "safety.integrity_alert_engine_cron");
    // Catch-up lease must be short: a 600s JOB_LEASE_SECONDS held by a killed deploy
    // instance left healthz LATE for 10m while every other instance skipped silently.
    expect(integrity?.leaseSeconds).toBe(90);
  });
});
