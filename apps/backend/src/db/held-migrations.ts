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
 * 2026-07-25 GUARD split: the registry carries TWO arrays — `held` (genuinely unapplied)
 * and `applied_held` (marker still on disk, but confirmed already applied on prod). This
 * unions both, same as the runner: an `applied_held` file is normally ledgered already (so
 * it won't even reach this "held + unledgered = expected pending" check), but unioning
 * keeps this boot guard and the runner's firewall in lockstep if that ever isn't true.
 *
 * Fail-safe: if the registry is unreadable, returns an empty set (the guards stay
 * strict — they will still catch genuinely missing NORMAL migrations). The registry
 * ships in the deploy image (db-migrate reads it at preDeploy), so at boot it is
 * reliably present in `${repoRoot}/db/migrations`.
 */
export function loadHeldMigrationSet(repoRoot: string): Set<string> {
  try {
    const p = path.join(repoRoot, "db", "migrations", HELD_REGISTRY_FILENAME);
    // Union EVERY array section, discovered dynamically — never a hardcoded list of section names.
    // The registry gained a third section (`superseded`) on 2026-07-25; a hardcoded
    // [held, applied_held] union silently dropped it, which is how a JSON edit can arm a migration.
    // Mirrors loadHeldSet in scripts/lib/held-migrations.mjs — the boot guard and the runner's
    // firewall must agree on the set, or one of them is wrong at the worst possible moment.
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
    const files = Object.values(parsed)
      .filter((v): v is Array<{ file?: string }> => Array.isArray(v))
      .flat()
      .map((h) => h?.file)
      .filter((f): f is string => Boolean(f));
    return new Set(files);
  } catch {
    return new Set<string>();
  }
}
