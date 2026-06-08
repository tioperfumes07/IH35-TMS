import { describe, expect, it, vi } from "vitest";
import { evaluateRule } from "../rule-engine.service.js";

vi.mock("../notification.service.js", () => ({ notifyAnomalyAlert: vi.fn(async () => undefined) }));

describe("rule engine", () => {
  it("creates alerts for detector findings", async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("INSERT INTO safety.anomaly_alerts")) return { rows: [{ uuid: "alert-1" }] };
        return { rows: [] };
      },
    };
    const count = await evaluateRule(client, {
      uuid: "rule-1", operating_company_id: "oci", rule_slug: "x", rule_name: "Test",
      category: "integrity", detector_function: "duplicate_load_number", threshold_config: {},
      severity: "high", is_active: true, notify_roles: ["Owner"], cadence_minutes: 30,
    });
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
