import { describe, expect, it, vi } from "vitest";
import { evaluateRule } from "../rule-engine.service.js";
import { notifyAnomalyAlert } from "../notification.service.js";

vi.mock("../notification.service.js", () => ({ notifyAnomalyAlert: vi.fn(async () => undefined) }));

describe("rule engine", () => {
  it("creates alerts for detector findings", async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("FROM mdata.loads")) {
          return { rows: [{ load_number: "L-1", cnt: "2", load_ids: ["00000000-0000-4000-8000-000000000001"] }] };
        }
        if (sql.includes("INSERT INTO safety.anomaly_alerts")) return { rows: [{ uuid: "alert-1" }] };
        return { rows: [] };
      },
    };
    const count = await evaluateRule(client, {
      uuid: "rule-1", operating_company_id: "oci", rule_slug: "x", rule_name: "Test",
      category: "integrity", detector_function: "duplicate_load_number", threshold_config: {},
      severity: "high", is_active: true, notify_roles: ["Owner"], cadence_minutes: 30,
    });
    expect(count).toBe(1);
    expect(queries.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(queries.some((sql) => sql.includes("resolution_status IN ('open', 'investigating')"))).toBe(true);
  });

  it("does not notify when the canonical unresolved finding already exists", async () => {
    vi.mocked(notifyAnomalyAlert).mockClear();
    const client = {
      query: async (sql: string) => {
        if (sql.includes("INSERT INTO safety.anomaly_alerts")) return { rows: [] };
        return { rows: [] };
      },
    };
    const count = await evaluateRule(client, {
      uuid: "rule-1", operating_company_id: "oci", rule_slug: "x", rule_name: "Test",
      category: "integrity", detector_function: "duplicate_load_number", threshold_config: {},
      severity: "high", is_active: true, notify_roles: ["Owner"], cadence_minutes: 30,
    });
    expect(count).toBe(0);
    expect(notifyAnomalyAlert).not.toHaveBeenCalled();
  });
});
