import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const migrationPath = path.join(repoRoot, "db/migrations/0367_archive_mdata_customers_test_seed.sql");

describe("0367_archive_mdata_customers_test_seed migration", () => {
  it("archives test/seed mdata.customers with ledger + reversible DOWN", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/BEGIN;/);
    expect(sql).toMatch(/COMMIT;/);
    expect(sql).toMatch(/migration\.test_seed_archive_ledger_0367/);
    expect(sql).toMatch(/mdata\.customers/);
    expect(sql).toMatch(/customer_name.*TEST-%/);
    expect(sql).toMatch(/-- DOWN/);
    expect(sql).toMatch(/SET archived_at = NULL/);
  });
});
