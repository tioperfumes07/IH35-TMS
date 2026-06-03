import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "../../../../..");
const MIGRATION_PATH = path.join(REPO_ROOT, "db/migrations/0325_clear_default_classifications.sql");

describe("0325 clear default classifications migration", () => {
  it("archives seed-applied rows and remains reversible", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    const text = fs.readFileSync(MIGRATION_PATH, "utf8");

    expect(text).toContain("CREATE TABLE IF NOT EXISTS accounting.customer_classifications");
    expect(text).toContain("CREATE TABLE IF NOT EXISTS accounting.vendor_classifications");
    expect(text).toContain("UPDATE accounting.customer_classifications");
    expect(text).toContain("UPDATE accounting.vendor_classifications");
    expect(text).toContain("applied_by_user_id IS NULL");
    expect(text).toContain("applied_at IS NULL");
    expect(text).toContain("archived_at = COALESCE(archived_at, now())");
    expect(text).toContain("'Late-pay'");
    expect(text).toContain("'FMCSA: Not verified'");
    expect(text).toContain("'Medium'");
    expect(text).toContain("-- DOWN");
    expect(text).toContain("SET archived_at = NULL");
    expect(text).not.toContain("DELETE FROM accounting.customer_classifications");
    expect(text).not.toContain("DELETE FROM accounting.vendor_classifications");
  });
});
