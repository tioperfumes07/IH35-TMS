import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../../");
const migrationPath = path.join(repoRoot, "db/migrations/0357_maint_parts_unify_deprecation.sql");

describe("0357_maint_parts_unify_deprecation migration", () => {
  it("deprecates catalogs.parts with B23 ARCHIVE-not-DELETE comment", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/catalogs\.parts/);
    expect(sql).toMatch(/DEPRECATED.*B23/);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });

  it("deprecates maint.part with B23 ARCHIVE-not-DELETE comment", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/maint\.part/);
    expect(sql).toMatch(/ARCHIVE-not-DELETE/);
  });

  it("marks maintenance.parts_inventory as canonical", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/maintenance\.parts_inventory/);
    expect(sql).toMatch(/CANONICAL company parts inventory \(B23\)/);
  });
});
