import { describe, expect, it } from "vitest";
import {
  isReconciliationJobOverdue,
  RECONCILIATION_CATCHUP_WINDOWS,
} from "./reconciliation-worker.cron.js";

describe("reconciliation startup catch-up", () => {
  it("exports catch-up windows matching health.routes two-period thresholds", () => {
    const byName = Object.fromEntries(RECONCILIATION_CATCHUP_WINDOWS.map((j) => [j.jobName, j.maxStaleMinutes]));
    expect(byName["reconciliation.qbo_refdata"]).toBe(720);
    expect(byName["reconciliation.qbo_transactional"]).toBe(120);
    expect(byName["reconciliation.samsara_static"]).toBe(1440);
    expect(byName["reconciliation.cap15_identity"]).toBe(120);
  });

  it("treats null / invalid last success as overdue", () => {
    expect(isReconciliationJobOverdue(null, 120)).toBe(true);
    expect(isReconciliationJobOverdue("not-a-date", 120)).toBe(true);
  });

  it("flags only when past maxStaleMinutes", () => {
    const now = Date.parse("2026-08-17T04:00:00.000Z");
    const fresh = "2026-08-17T02:45:00.000Z"; // 75m ago
    const late = "2026-08-17T01:45:00.000Z"; // 135m ago
    expect(isReconciliationJobOverdue(fresh, 120, now)).toBe(false);
    expect(isReconciliationJobOverdue(late, 120, now)).toBe(true);
  });
});
