import fs from "node:fs";
import path from "node:path";

const HELD_REGISTRY_FILENAME = ".held-migrations.json";

/**
 * Load the set of HELD migration filenames from db/migrations/.held-migrations.json.
 *
 * A held migration is registered "DO NOT RUN ON PROD": the deploy runner
 * (scripts/db-migrate.mjs, via shouldSkipHeldOnProd) HELD-SKIPs it on prod, so it
 * stays INTENTIONALLY UNLEDGERED on production until the owner hand-applies it on a
 * Neon branch and ledger-backfills. The boot drift guards must therefore treat a
 * held + unledgered migration as "expected pending", NOT drift — otherwise a held
 * migration merging to main refuses the backend's boot and fails the deploy
 * (2026-07-13 incident: 202607370000_driver_payment_methods held-skipped on prod →
 * runStartupMigrationDriftGuard saw it unledgered → process.exit(1) → deploy failed).
 *
 * This mirrors the runner's `loadHeldSet` (scripts/lib/held-migrations.mjs); the two
 * controls MUST agree — the runner refuses to run held on prod, and the boot guard
 * must not then treat that honest pending state as drift.
 *
 * Fail-safe: if the registry is unreadable, returns an empty set (the guards stay
 * strict — they will still catch genuinely missing NORMAL migrations). The registry
 * ships in the deploy image (db-migrate reads it at preDeploy), so at boot it is
 * reliably present in `${repoRoot}/db/migrations`.
 */
export function loadHeldMigrationSet(repoRoot: string): Set<string> {
  try {
    const p = path.join(repoRoot, "db", "migrations", HELD_REGISTRY_FILENAME);
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as { held?: Array<{ file?: string }> };
    return new Set(
      (parsed.held ?? []).map((h) => h.file).filter((f): f is string => Boolean(f))
    );
  } catch {
    return new Set<string>();
  }
}
