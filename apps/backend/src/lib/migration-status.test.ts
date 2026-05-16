import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMigrationDriftBootGuard, findMigrationDrift } from "./migration-status.js";

function tmpRepoWithMigrations(filenames: string[]) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-mig-"));
  const migDir = path.join(repoRoot, "db", "migrations");
  fs.mkdirSync(migDir, { recursive: true });
  for (const name of filenames) {
    fs.writeFileSync(path.join(migDir, name), "-- test migration\n");
  }
  return repoRoot;
}

describe("migration-status", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const root of tmpRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    tmpRoots.length = 0;
  });

  it("findMigrationDrift reports missingInDB when DB lacks a known file", async () => {
    const repoRoot = tmpRepoWithMigrations(["0001_a.sql", "0002_b.sql"]);
    tmpRoots.push(repoRoot);

    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_regclass('_system._schema_migrations')")) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("FROM _system._schema_migrations")) {
        return { rows: [{ name: "0001_a.sql", checksum: "x" }] };
      }
      return { rows: [] };
    });

    const drift = await findMigrationDrift({ query } as never, repoRoot);
    expect(drift.missingInDB).toEqual(["0002_b.sql"]);
    expect(drift.extraInDB).toEqual([]);
  });

  it("findMigrationDrift reports extraInDB when DB has an unknown migration", async () => {
    const repoRoot = tmpRepoWithMigrations(["0001_a.sql"]);
    tmpRoots.push(repoRoot);

    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_regclass('_system._schema_migrations')")) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("FROM _system._schema_migrations")) {
        return { rows: [{ name: "0001_a.sql", checksum: "x" }, { name: "9999_z.sql", checksum: "x" }] };
      }
      return { rows: [] };
    });

    const drift = await findMigrationDrift({ query } as never, repoRoot);
    expect(drift.extraInDB).toEqual(["9999_z.sql"]);
    expect(drift.missingInDB).toEqual([]);
  });

  it("findMigrationDrift ok when applied matches expected", async () => {
    const repoRoot = tmpRepoWithMigrations(["0001_a.sql"]);
    tmpRoots.push(repoRoot);

    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_regclass('_system._schema_migrations')")) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("FROM _system._schema_migrations")) {
        return { rows: [{ name: "0001_a.sql", checksum: "x" }] };
      }
      return { rows: [] };
    });

    const drift = await findMigrationDrift({ query } as never, repoRoot);
    expect(drift.missingInDB).toEqual([]);
    expect(drift.extraInDB).toEqual([]);
  });

  it("boot guard logs (does not throw) when SKIP_MIGRATION_VERIFICATION=true and drift exists", async () => {
    const repoRoot = tmpRepoWithMigrations(["0002_b.sql"]);
    tmpRoots.push(repoRoot);

    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_regclass('_system._schema_migrations')")) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("FROM _system._schema_migrations")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const prev = process.env.SKIP_MIGRATION_VERIFICATION;
    process.env.SKIP_MIGRATION_VERIFICATION = "true";

    const logError = vi.fn();
    await assertMigrationDriftBootGuard({
      repoRoot,
      client: { query } as never,
      logError,
    });

    expect(logError).toHaveBeenCalled();
    process.env.SKIP_MIGRATION_VERIFICATION = prev;
  });
});
