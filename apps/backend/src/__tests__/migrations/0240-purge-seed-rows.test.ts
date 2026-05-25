import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");

describe("0240_purge_seed_rows migration", () => {
  it("contains idempotent seed purge + audit append events", () => {
    const migrationPath = path.join(repoRoot, "db/migrations/0240_purge_seed_rows.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/BEGIN;/);
    expect(sql).toMatch(/COMMIT;/);
    expect(sql).toMatch(/mdata\.drivers/);
    expect(sql).toMatch(/mdata\.customers/);
    expect(sql).toMatch(/seed-purge-prod 2026-05-24 P7-AUDIT-VISUAL-P1/);
    expect(sql).toMatch(/audit\.append_event/);
    expect(sql).toMatch(/seed-test-%/i);
  });

  it("targets real mdata column names (no display_id assumptions)", () => {
    const migrationPath = path.join(repoRoot, "db/migrations/0240_purge_seed_rows.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).not.toMatch(/d\.display_id/);
    expect(sql).not.toMatch(/c\.display_id/);
    expect(sql).toMatch(/d\.first_name/);
    expect(sql).toMatch(/d\.last_name/);
    expect(sql).toMatch(/c\.customer_code/);
    expect(sql).toMatch(/c\.customer_name/);
  });
});
