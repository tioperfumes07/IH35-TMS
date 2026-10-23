import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMigrationDriftBootGuard, findMigrationDrift, splitHeldPending } from "./migration-status.js";

function tmpRepoWithMigrations(filenames: string[], heldFiles: string[] = []) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-mig-"));
  const migDir = path.join(repoRoot, "db", "migrations");
  fs.mkdirSync(migDir, { recursive: true });
  for (const name of filenames) {
    fs.writeFileSync(path.join(migDir, name), "-- test migration\n");
  }
  if (heldFiles.length > 0) {
    fs.writeFileSync(
      path.join(migDir, ".held-migrations.json"),
      JSON.stringify({ held: heldFiles.map((file) => ({ file, reason: "test-held" })) }, null, 2)
    );
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

  it("boot guard throws when drift exists", async () => {
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

    const logError = vi.fn();
    await expect(
      assertMigrationDriftBootGuard({
        repoRoot,
        client: { query } as never,
        logError,
      })
    ).rejects.toThrow("[boot] migration drift detected: missing in DB: 0002_b.sql");
    expect(logError).not.toHaveBeenCalled();
  });

  it("boot guard does NOT throw when the only missing migration is HELD (pending on prod)", async () => {
    const repoRoot = tmpRepoWithMigrations(
      ["0001_a.sql", "202607370000_held.sql"],
      ["202607370000_held.sql"]
    );
    tmpRoots.push(repoRoot);

    // Only 0001_a.sql is ledgered; the held migration is deliberately unledgered on prod.
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_regclass('_system._schema_migrations')")) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("FROM _system._schema_migrations")) {
        return { rows: [{ name: "0001_a.sql", checksum: "x" }] };
      }
      return { rows: [] };
    });

    const logError = vi.fn();
    await expect(
      assertMigrationDriftBootGuard({ repoRoot, client: { query } as never, logError })
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ event: "migration_drift_held_pending_ignored" }),
      expect.stringContaining("held migrations pending")
    );
  });

  it("boot guard still throws on a missing NORMAL migration even when a held file is present", async () => {
    const repoRoot = tmpRepoWithMigrations(
      ["0001_a.sql", "0002_b.sql", "202607370000_held.sql"],
      ["202607370000_held.sql"]
    );
    tmpRoots.push(repoRoot);

    // 0001_a.sql ledgered; 0002_b.sql (NOT held) missing → real drift; held file ignored.
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_regclass('_system._schema_migrations')")) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("FROM _system._schema_migrations")) {
        return { rows: [{ name: "0001_a.sql", checksum: "x" }] };
      }
      return { rows: [] };
    });

    const logError = vi.fn();
    await expect(
      assertMigrationDriftBootGuard({ repoRoot, client: { query } as never, logError })
    ).rejects.toThrow("[boot] migration drift detected: missing in DB: 0002_b.sql");
  });
});

// LEAD 443.268-B: the health route answered 503 on a healthy prod because it counted the 10 HELD files as missing.
describe("splitHeldPending (one split for the boot guard and /admin/health/migrations)", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  it("a HELD file is pending, a normal missing file is drift", () => {
    const r = splitHeldPending(["202615210000_lease_to_own_lessee_asc842.sql", "209912310000_not_held_example.sql"], repoRoot);
    expect(r.heldPending).toEqual(["202615210000_lease_to_own_lessee_asc842.sql"]);
    expect(r.missing).toEqual(["209912310000_not_held_example.sql"]);
  });
});
