import { describe, expect, it } from "vitest";
import {
  calculateDriftPct,
  DS5_REQUIRED_COLUMNS,
  runDs5ContractCheckForCompany,
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
});
