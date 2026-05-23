import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runStartupMigrationDriftGuard } from "../startup-migration-drift-guard.js";

function tmpRepoWithMigrations(files: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-startup-drift-"));
  const migrationDir = path.join(root, "db", "migrations");
  fs.mkdirSync(migrationDir, { recursive: true });
  for (const file of files) {
    fs.writeFileSync(path.join(migrationDir, file), "-- test migration\n");
  }
  return root;
}

describe("runStartupMigrationDriftGuard", () => {
  const tmpRoots: string[] = [];
  const prevSkip = process.env.SKIP_MIGRATION_DRIFT_GUARD;

  afterEach(() => {
    for (const root of tmpRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    tmpRoots.length = 0;
    process.env.SKIP_MIGRATION_DRIFT_GUARD = prevSkip;
    vi.restoreAllMocks();
  });

  it("passes when every db/migrations file is present in both ledgers", async () => {
    const repoRoot = tmpRepoWithMigrations(["0001_a.sql", "0002_b.sql"]);
    tmpRoots.push(repoRoot);

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const query = vi.fn(async () => ({
      rows: [
        { ledger: "system", migration: "0001_a.sql" },
        { ledger: "system", migration: "0002_b.sql" },
        { ledger: "app", migration: "0001_a.sql" },
        { ledger: "app", migration: "0002_b.sql" },
      ],
    }));

    await runStartupMigrationDriftGuard({ repoRoot, client: { query } as never });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"migration_drift_check_passed"'));
  });

  it("fails when a file is missing from _system._schema_migrations", async () => {
    const repoRoot = tmpRepoWithMigrations(["0001_a.sql", "0002_b.sql"]);
    tmpRoots.push(repoRoot);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process_exit_1");
    }) as never);
    const query = vi.fn(async () => ({
      rows: [
        { ledger: "system", migration: "0001_a.sql" },
        { ledger: "app", migration: "0001_a.sql" },
        { ledger: "app", migration: "0002_b.sql" },
      ],
    }));

    await expect(runStartupMigrationDriftGuard({ repoRoot, client: { query } as never })).rejects.toThrow("process_exit_1");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"migration_drift_detected"'));
  });

  it("fails when a file is missing from ih35_migrations.applied_migrations", async () => {
    const repoRoot = tmpRepoWithMigrations(["0001_a.sql", "0002_b.sql"]);
    tmpRoots.push(repoRoot);

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process_exit_1");
    }) as never);
    const query = vi.fn(async () => ({
      rows: [
        { ledger: "system", migration: "0001_a.sql" },
        { ledger: "system", migration: "0002_b.sql" },
        { ledger: "app", migration: "0001_a.sql" },
      ],
    }));

    await expect(runStartupMigrationDriftGuard({ repoRoot, client: { query } as never })).rejects.toThrow("process_exit_1");
  });

  it("bypasses guard when SKIP_MIGRATION_DRIFT_GUARD is true", async () => {
    const repoRoot = tmpRepoWithMigrations(["0001_a.sql"]);
    tmpRoots.push(repoRoot);
    process.env.SKIP_MIGRATION_DRIFT_GUARD = "true";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const query = vi.fn(async () => ({ rows: [] }));

    await runStartupMigrationDriftGuard({ repoRoot, client: { query } as never });

    expect(query).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"migration_drift_check_bypassed"'));
  });
});

