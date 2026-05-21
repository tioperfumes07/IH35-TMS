import { describe, expect, it } from "vitest";
import {
  calculateDriftPct,
  DS5_REQUIRED_COLUMNS,
  runDs5ContractCheckForCompany,
  runSamsaraStaticReconciliationForCompany,
  transactionalDriftSeverity,
} from "./reconciliation-worker.service.js";

describe("reconciliation-worker.service", () => {
  it("calculates percentage drift against max count baseline", () => {
    expect(calculateDriftPct(100, 110)).toBeCloseTo(10 / 110, 8);
    expect(calculateDriftPct(0, 0)).toBe(0);
    expect(calculateDriftPct(0, 12)).toBe(1);
  });

  it("applies transactional threshold defaults from DD-4", () => {
    expect(transactionalDriftSeverity(1000, 1005)).toBeNull();
    expect(transactionalDriftSeverity(1000, 1015)).toBe("important");
    expect(transactionalDriftSeverity(1000, 1050)).toBe("critical");
  });

  it("uses canonical DS-5 required column contract", () => {
    for (const item of DS5_REQUIRED_COLUMNS) {
      expect(item.staleColumn).toBe("last_seen_at");
      expect(item.requiredColumns).toContain("raw_payload");
      expect(item.requiredColumns).toContain("last_seen_at");
      expect(item.requiredColumns).toContain("created_at");
      expect(item.requiredColumns).toContain("updated_at");
    }
  });

  it("emits zero schema_contract_gap when all DS-5 columns exist", async () => {
    const requiredByTable = new Map(
      DS5_REQUIRED_COLUMNS.map((item) => [`${item.tableSchema}.${item.tableName}`, item.requiredColumns])
    );
    const findings: Array<{ sql: string; values?: unknown[] }> = [];

    const client = {
      async query(sql: string, values?: unknown[]) {
        if (sql.includes("FROM information_schema.columns")) {
          const schema = String(values?.[0] ?? "");
          const table = String(values?.[1] ?? "");
          const required = requiredByTable.get(`${schema}.${table}`) ?? [];
          return { rows: required.map((column_name) => ({ column_name })) };
        }
        if (sql.includes("SELECT MAX(")) {
          return { rows: [{ max_value: new Date().toISOString() }] };
        }
        if (sql.includes("FROM _system.reconciliation_findings")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO _system.reconciliation_findings")) {
          findings.push({ sql, values });
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    await runDs5ContractCheckForCompany(client, "91e0bf0a-133f-4ce8-a734-2586cfa66d96", "c8446a16-8d82-46c2-8d95-bfd0e20302f9");

    expect(findings).toHaveLength(0);
  });

  it("skips samsara drift check when webhook is newer than polled_at + 2m", async () => {
    const findings: Array<unknown[]> = [];
    const audits: Array<unknown[]> = [];
    const now = new Date();
    const client = {
      async query(sql: string, values?: unknown[]) {
        if (sql.includes("FROM integrations.samsara_drivers")) {
          return { rows: [{ cnt: "5" }] };
        }
        if (sql.includes("FROM integrations.samsara_vehicles")) {
          return { rows: [{ cnt: "3" }] };
        }
        if (sql.includes("FROM integrations.samsara_remote_counts")) {
          return { rows: [{ remote_count: 4, polled_at: now.toISOString() }] };
        }
        if (sql.includes("FROM integrations.samsara_remote_count_collection_state")) {
          return { rows: [{ last_error_class: null }] };
        }
        if (sql.includes("MAX(received_at)")) {
          return { rows: [{ latest_webhook: new Date(now.getTime() + 3 * 60 * 1000).toISOString() }] };
        }
        if (sql.includes("FROM _system.reconciliation_findings")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO _system.reconciliation_findings")) {
          findings.push(values ?? []);
          return { rows: [] };
        }
        if (sql.includes("audit.append_event")) {
          audits.push(values ?? []);
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    await runSamsaraStaticReconciliationForCompany(
      client,
      "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
      "c8446a16-8d82-46c2-8d95-bfd0e20302f9"
    );

    expect(findings).toHaveLength(0);
    expect(audits.some((values) => values.includes("cron_count_drift_check_skipped_pending_projection"))).toBe(true);
  });

  it("emits critical remote_unavailable with auth_failed reason when collector state reports auth failure", async () => {
    const findings: Array<unknown[]> = [];
    const client = {
      async query(sql: string, values?: unknown[]) {
        if (sql.includes("FROM integrations.samsara_drivers")) {
          return { rows: [{ cnt: "1" }] };
        }
        if (sql.includes("FROM integrations.samsara_vehicles")) {
          return { rows: [{ cnt: "1" }] };
        }
        if (sql.includes("FROM integrations.samsara_remote_counts")) {
          return { rows: [] };
        }
        if (sql.includes("FROM integrations.samsara_remote_count_collection_state")) {
          return { rows: [{ last_error_class: "auth_failed" }] };
        }
        if (sql.includes("FROM _system.reconciliation_findings")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO _system.reconciliation_findings")) {
          findings.push(values ?? []);
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    await runSamsaraStaticReconciliationForCompany(
      client,
      "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
      "c8446a16-8d82-46c2-8d95-bfd0e20302f9"
    );

    const severities = findings.map((values) => values[4]);
    const scopes = findings.map((values) => JSON.parse(String(values[6] ?? "{}")) as Record<string, unknown>);
    expect(severities.every((sev) => sev === "critical")).toBe(true);
    expect(scopes.every((scope) => scope.reason === "auth_failed")).toBe(true);
  });
});
