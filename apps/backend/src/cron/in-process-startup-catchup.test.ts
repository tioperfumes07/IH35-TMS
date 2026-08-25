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
  });

  it("does not include QBO push or money poster jobs", () => {
    const names = IN_PROCESS_CATCHUP_WINDOWS.map((j) => j.jobName).join(" ");
    expect(names).not.toMatch(/qbo/);
    expect(names).not.toMatch(/collections_sync/);
    expect(names).not.toMatch(/factoring_default_interest/);
    expect(names).not.toMatch(/loves_card_import/);
  });
});
