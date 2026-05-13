import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("P6-T11173 master-data mirror migration", () => {
  it("defines additive mdata.qbo_* mirror tables with heartbeat + RLS", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationPath = path.resolve(here, "../../../../../db/migrations/0142_mdata_qbo_master_data_tables.sql");
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS mdata\.qbo_vendors/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS mdata\.qbo_sync_runs/i);
    expect(sql).toMatch(/last_heartbeat_at/i);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });
});
