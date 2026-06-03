import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const migrationPath = path.join(repoRoot, "db/migrations/0320_archive_test_seed_data.sql");

describe("0320_archive_test_seed_data migration", () => {
  it("archives test/seed rows with ledger + reversible DOWN", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/BEGIN;/);
    expect(sql).toMatch(/COMMIT;/);
    expect(sql).toMatch(/migration\.test_seed_archive_ledger_0320/);
    expect(sql).toMatch(/mdata\.drivers/);
    expect(sql).toMatch(/accounting\.qbo_customers/);
    expect(sql).toMatch(/identity\.users/);
    expect(sql).toMatch(/display_name.*TEST-%/);
    expect(sql).toMatch(/@seed\.invalid/);
    expect(sql).toMatch(/-- DOWN/);
    expect(sql).toMatch(/SET archived_at = NULL/);
  });
});
