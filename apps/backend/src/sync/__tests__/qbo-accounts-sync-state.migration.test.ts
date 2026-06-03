import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "../../../../..");
const MIGRATION_PATH = path.join(REPO_ROOT, "db/migrations/0323_qbo_accounts_sync_state.sql");

describe("0323 qbo accounts sync state migration", () => {
  it("is reversible via documented DOWN section", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    const text = fs.readFileSync(MIGRATION_PATH, "utf8");
    expect(text).toContain("-- DOWN");
    for (const column of [
      "sync_status",
      "qbo_push_attempts",
      "qbo_last_push_at",
      "qbo_last_error",
      "parent_synced",
      "parent_id",
    ]) {
      expect(text).toContain(`DROP COLUMN IF EXISTS ${column}`);
    }
    expect(text).toContain("DROP INDEX IF EXISTS idx_qbo_accounts_sync_status");
    expect(text).toContain("DROP POLICY IF EXISTS qbo_accounts_accounting_tenant_scope");
  });
});
