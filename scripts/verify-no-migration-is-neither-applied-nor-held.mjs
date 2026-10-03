#!/usr/bin/env node
/**
 * verify-no-migration-is-neither-applied-nor-held — ROUND 380.2, CC-1.
 *
 * "A migration on disk that is neither applied nor held should be refused by the gate, not discovered."
 * scripts/db-migrate.mjs applies EVERY disk file that is not in the ledger and not HELD — whatever its number — so a
 * file dated before the newest applied migration that nobody ledgered or held is a migration nobody decided to run,
 * running itself at the next deploy.
 *
 * Every db/migrations/*.sql is exactly one of:
 *   APPLIED   — in _system._schema_migrations on production
 *   HELD      — in db/migrations/.held-migrations.json (held / applied_held / superseded): a written decision
 *   PENDING   — added to the repository AFTER the last deploy applied anything (git add time > newest applied_at):
 *               merged, not yet deployed. Numbers are claimed per seat band, so a pending file can legitimately sort
 *               before one already applied — time, not number, decides (fixed 2026-10-03: 202615380000 sorted before
 *               the applied 202615380600 and read as "neither" for the minutes between merge and deploy).
 * RULE 1 (live)  — 0 files in NEITHER state: unapplied, unheld, and already in the repository when a later deploy ran.
 * RULE 2 (static) — every file the held registry names exists on disk (a decision about a file that is not there is
 *                   not a decision about anything).
 * Required value (380.2): 0 migrations in neither state. Measured 2026-10-03 on prod: 1401 on disk, 1391 applied,
 * 175 in the held registry, 0 neither, 0 pending.
 * --selftest exercises every rule.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-migration-is-neither-applied-nor-held";
const DIR = join(ROOT, "db/migrations");
export const REQUIRES_LIVE_DB = "the production migration ledger is the other half of the fact — fails closed without it";

export function heldUnion(registry) {
  const out = new Set();
  for (const k of ["held", "applied_held", "superseded"]) for (const e of registry[k] ?? []) out.add(typeof e === "string" ? e : e.file);
  return out;
}

/**
 * Pure: classify every disk migration against the ledger and the held registry.
 * addedAt(f) → ISO time the file entered the repository (null when unknown); lastDeployAt → newest applied_at.
 * With no times available it falls back to the number order (a file after the newest applied is pending).
 */
export function classify(disk, ledger, held, addedAt = () => null, lastDeployAt = null) {
  const applied = [...ledger].sort();
  const newest = applied[applied.length - 1] ?? "";
  const neither = [], pending = [];
  for (const f of disk) {
    if (ledger.has(f) || held.has(f)) continue;
    const added = addedAt(f);
    // Pending on EITHER signal (CC-3, 2026-10-03): numbered after the newest applied (db-migrate runs it next, in order),
    // or added after the last deploy (band numbering lets a merged file sort before an applied one). Time alone
    // misread every open branch committed before the latest deploy — its file is new, numbered after everything
    // applied, and was called "neither" (#24874, 202615380930).
    const isPending = f > newest || Boolean(added && lastDeployAt && new Date(added) > new Date(lastDeployAt));
    (isPending ? pending : neither).push(f);
  }
  return { newest, neither, pending };
}

/** ISO commit time at which each file was first added to the repository (git), or null. */
export function gitAddedAt(file) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--format=%cI", "--", join("db/migrations", file)], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    return out.length ? out[out.length - 1] : null;
  } catch {
    return null;
  }
}

export function staticProblems(diskSet, held) {
  return [...held].filter((f) => !diskSet.has(f)).map((f) => `RULE 2 the held registry names ${f}, which is not on disk`);
}

export function readDisk() {
  return readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
}
export function readHeld() {
  return heldUnion(JSON.parse(readFileSync(join(DIR, ".held-migrations.json"), "utf8")));
}

export function run() {
  return staticProblems(new Set(readDisk()), readHeld());
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const L = new Set(["202601010000_a.sql", "202601020000_b.sql", "202601050000_e.sql"]);
    const H = new Set(["202601030000_c.sql"]);
    const c1 = classify(["202601010000_a.sql", "202601020000_b.sql", "202601030000_c.sql", "202601050000_e.sql"], L, H);
    const c2 = classify(["202601010000_a.sql", "202601040000_d.sql", "202601050000_e.sql"], L, H);
    const c3 = classify(["202601050000_e.sql", "202601060000_f.sql"], L, H);
    const cases = [
      ["all applied or held → 0 neither", c1.neither.length === 0 && c1.pending.length === 0],
      ["an unapplied, unheld file older than the newest applied → neither", c2.neither.join() === "202601040000_d.sql"],
      ["a file after the newest applied → pending, not neither", c3.pending.join() === "202601060000_f.sql" && c3.neither.length === 0],
      ["a LOWER-numbered file added after the last deploy → pending (band numbering), not neither", (() => {
        const c = classify(["202601040000_d.sql"], L, H, () => "2026-10-03T22:00:00Z", "2026-10-03T21:59:00Z");
        return c.pending.join() === "202601040000_d.sql" && c.neither.length === 0;
      })()],
      ["a file that was in the repo at the last deploy and still is not applied → neither", (() => {
        const c = classify(["202601040000_d.sql"], L, H, () => "2026-10-01T00:00:00Z", "2026-10-03T21:59:00Z");
        return c.neither.join() === "202601040000_d.sql";
      })()],
      ["a HIGHER-numbered file committed BEFORE the last deploy (an open branch) → pending, not neither", (() => {
        const c = classify(["202601060000_f.sql"], L, H, () => "2026-10-03T21:00:00Z", "2026-10-03T22:00:00Z");
        return c.pending.join() === "202601060000_f.sql" && c.neither.length === 0;
      })()],
      ["a held entry with no file → RULE 2", staticProblems(new Set(["202601010000_a.sql"]), new Set(["202601099999_gone.sql"])).length === 1],
      ["registry object and string entries both read", heldUnion({ held: [{ file: "x.sql" }], superseded: ["y.sql"] }).size === 2],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const problems = run();
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { queryLiveNeonIdentity, KNOWN_PRODUCTION_BRANCH_ID } = await import("./lib/assert-not-production.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    // RULE 1 is a fact about the PRODUCTION ledger — a rehearsal fork carries migrations applied by hand and never
    // ledgered, so there it is reported, not enforced (a local report is not a live pass; the gate's prod read is).
    const { branchId } = await queryLiveNeonIdentity(client).catch(() => ({ branchId: null }));
    const isProd = branchId === KNOWN_PRODUCTION_BRANCH_ID;
    const ledgerRows = (await client.query(`SELECT filename, applied_at FROM _system._schema_migrations`)).rows;
    const ledger = new Set(ledgerRows.map((r) => r.filename));
    const lastDeployAt = ledgerRows.reduce((m, r) => (r.applied_at && (!m || new Date(r.applied_at) > new Date(m)) ? r.applied_at : m), null);
    const disk = readDisk();
    const { newest, neither, pending } = classify(disk, ledger, readHeld(), gitAddedAt, lastDeployAt);
    const lines = neither.map((f) => `RULE 1 ${f} is neither applied nor held and sorts before the newest applied (${newest}) — it would run itself at the next deploy. Hold it with a reason, or apply it deliberately.`);
    if (isProd) problems.push(...lines);
    else if (lines.length) console.log(`${LABEL}: REPORT-ONLY on non-production branch ${branchId ?? "(unknown)"} — its ledger is not production's:\n  ${lines.join("\n  ")}`);
    if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — ${disk.length} on disk, ${ledger.size} applied${isProd ? ", 0 in neither state on production" : ` (non-production branch ${branchId ?? "unknown"}: RULE 1 reported, not enforced)`}; ${pending.length} pending the next deploy${pending.length ? ` (${pending.join(", ")})` : ""}.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
