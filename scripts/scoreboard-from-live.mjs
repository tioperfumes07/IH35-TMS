#!/usr/bin/env node
/**
 * SCOREBOARD FROM LIVE (spec §5) — regenerate module completion % from the SAME probes the tracker uses.
 *
 * `docs/audit/program-scoreboard.json` and `docs/module-completion/*.json` are committed snapshots. A
 * snapshot is a number somebody typed once; it keeps reporting the old truth forever and there is no
 * moment at which it announces it has gone stale. That is the identical failure the scenario tracker
 * exists to kill, so the scoreboard cannot be fixed by re-typing it more carefully — it has to be
 * derived from the same live predicates.
 *
 * Module % = (slices whose live predicate HOLDS) / (slices mapped to that module). Nothing hand-entered.
 *
 * SAME MASKING GUARD AS THE CERTIFIER: under FORCED RLS a `0` can mean "masked", not "absent". Writing
 * a scoreboard from a masked connection would publish an all-zero board that looks authoritative and
 * freshly dated. If the control reads zero, this refuses to write.
 *
 * --check exits non-zero when the committed file disagrees with live, so CI can catch a stale commit
 * without this job needing write access in that context.
 *
 * WHY THIS IS *NOT* IN THE IN-PROCESS CRON, unlike the certifier
 * The certifier's output is a database row, so a Render container can write it and everyone sees it.
 * This job's output is a FILE IN THE REPO. A Render filesystem is ephemeral and is not a git checkout
 * with push rights — running this on the app cron would regenerate the scoreboard into a container that
 * is about to be destroyed, log "wrote", and change nothing anyone can read. That is precisely the kind
 * of looks-done-runs-never wiring this board exists to expose, so it would be self-defeating here.
 *
 * The honest split: `npm run scoreboard:from-live` regenerates and commits it (a human or CI job with a
 * checkout), and `npm run scoreboard:check` runs in CI to FAIL when the committed file has drifted from
 * live. The freshness guarantee comes from the check failing, not from a write nobody can see.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OUT = "docs/audit/program-scoreboard.json";
const MODULE_DIR = "docs/module-completion";

/**
 * ADDITIVE write into docs/module-completion/<module>.json.
 *
 * These files are NOT ours to regenerate wholesale: they carry curated `items`, `sweep_matrix`,
 * `desktop_audit` and `ranked_fail_registry` that the auditor lane maintains by hand, and they are a
 * serialized hot file (Rule 26). Overwriting them from a probe would delete real audit work to publish
 * a percentage — trading something irreplaceable for something recomputable.
 *
 * So the live numbers go into their OWN key, `live_scenario_probe`, and every existing key is left
 * exactly as found. The derived percentage is therefore never hand-typed, and nothing curated is lost.
 */
function writeModuleLiveBlock(module, block) {
  const path = `${MODULE_DIR}/${module}.json`;
  // Read first and treat ENOENT as "no such module", rather than existsSync-then-read. The two-step
  // form is a time-of-check/time-of-use race (CodeQL js/file-system-race) and it also reads worse: the
  // read itself already tells us whether the file is there.
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return false;
    throw error;
  }
  const doc = JSON.parse(raw);
  doc.live_scenario_probe = block;
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  return true;
}

/** Which module each slice belongs to. Cascade owns the module→% mapping; this is the slice→module half. */
export const SLICE_MODULE = {
  "hop.book": "dispatch",
  "hop.assign": "driver-finance",
  "hop.dispatch": "dispatch",
  "hop.deliver": "dispatch",
  "hop.pod_bol": "dispatch",
  "hop.revenue": "accounting",
  "hop.invoice": "accounting",
  "hop.gl": "accounting",
  "hop.bank": "banking",
  "scenario.customer": "lists",
  "scenario.driver_onboarding": "drivers",
  "scenario.coa": "accounting",
  "scenario.settlement": "driver-finance",
  "scenario.advance": "driver-finance",
  "scenario.deductions": "driver-finance",
  "scenario.escrow": "driver-finance",
  "scenario.ap": "accounting",
  "scenario.fuel": "fuel",
  "scenario.maintenance": "maintenance",
  "scenario.accident": "safety",
  "scenario.insurance": "insurance",
  "scenario.legal": "legal",
  "scenario.factoring": "factoring",
  "scenario.banking": "banking",
  "scenario.breakdown_relay": "maintenance",
  "scenario.trailer_swap": "dispatch",
  "scenario.roadside_ap": "accounting",
  "scenario.parts_receive": "maintenance",
};

/**
 * REFUSE A TRANSACTION-POOLER ENDPOINT.
 *
 * This is not defensive boilerplate — it is the explanation for a failure measured while building this.
 * Probes run against a pooled connection returned real counts for some tables and 0 for others, varying
 * between runs. Cause: under transaction pooling a SESSION-scoped GUC does not survive between
 * statements, so `app.bypass_rls` is gone by the time the next probe runs and FORCE-RLS returns ZERO
 * ROWS **with no error**. The script would read nothing, see zeroes, and confidently certify the whole
 * board red.
 *
 * A silent wrong answer is worse than a crash, so refuse the endpoint outright rather than hope.
 */
function assertNotPooler(connectionString) {
  if (/-pooler\./.test(String(connectionString ?? ""))) {
    throw new Error(
      "refusing a -pooler connection string: session-scoped app.bypass_rls does not survive between " +
        "statements under transaction pooling, so every FORCE-RLS read would silently return 0 rows and " +
        "this job would certify a false all-red board. Use the direct (non-pooler) endpoint."
    );
  }
}

async function loadRegistry() {
  for (const rel of [
    // Repo-root dist/ is the real tsc outDir (tsconfig.json "outDir": "dist"). The
    // apps/backend/dist path was wrong: the registry never loaded, so this job would have thrown
    // "build the backend first" on every cron tick and certified nothing.
    "../dist/home/scenario-registry.js",
    "../apps/backend/dist/home/scenario-registry.js",
    "../apps/backend/src/home/scenario-registry.ts",
  ]) {
    try {
      const mod = await import(pathToFileURL(new URL(rel, import.meta.url).pathname).href);
      if (mod?.SCENARIO_REGISTRY?.length) return mod;
    } catch {
      /* next */
    }
  }
  throw new Error("scoreboard-from-live: build apps/backend first — refusing to score from a copied predicate.");
}

async function assertNotMasked(client) {
  const r = await client.query(
    `SELECT (SELECT count(*) FROM org.companies)::int AS companies,
            (SELECT count(*) FROM catalogs.accounts)::int AS accounts, current_user AS who`
  );
  const row = r.rows[0] ?? {};
  if (!Number(row.companies) || !Number(row.accounts)) {
    throw new Error(
      `scoreboard-from-live: RLS masking check FAILED (user=${row.who}, companies=${row.companies}, ` +
        `accounts=${row.accounts}). A zero here means masked, not empty — publishing would post a false ` +
        `all-zero scoreboard with a fresh timestamp. Aborting without writing.`
    );
  }
}

export async function computeScoreboard(client, registry) {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await assertNotMasked(client);

  const modules = {};
  const slices = [];
  for (const def of registry.SCENARIO_REGISTRY) {
    const module = SLICE_MODULE[def.key] ?? "unmapped";
    modules[module] ??= { pass_count: 0, total_count: 0, slices: [] };
    modules[module].total_count += 1;

    let holds = false;
    let evidence = "no count probe (resolved at request time)";
    if (def.probe) {
      const res = await client.query(def.probe.sql, [null]);
      const n = Number(res.rows[0]?.n ?? 0);
      holds = registry.probeHolds(n);
      evidence = def.probe.describe(n);
    }
    if (holds) modules[module].pass_count += 1;
    modules[module].slices.push({ key: def.key, holds, evidence });
    slices.push({ key: def.key, module, holds, evidence });
  }

  for (const m of Object.values(modules)) {
    m.progress = m.total_count ? Math.round((m.pass_count / m.total_count) * 100) : 0;
    // prod_verified is only true when EVERY slice of the module holds live — never asserted by hand.
    m.prod_verified = m.total_count > 0 && m.pass_count === m.total_count;
  }

  return {
    generated_by: "scripts/scoreboard-from-live.mjs",
    source: "live prod probes (same SQL as GET /api/v1/home/scenario-tracker)",
    note:
      "DERIVED, never hand-edited. Counts are TMS-NATIVE only — QuickBooks-imported rows are excluded " +
      "so an import can never make a TMS flow look proven.",
    modules,
    slices,
  };
}

async function main() {
  const check = process.argv.includes("--check");
  if (!process.env.DATABASE_URL) {
    console.error("scoreboard-from-live: DATABASE_URL is required.");
    process.exit(2);
  }
  const registry = await loadRegistry();
  assertNotPooler(process.env.DATABASE_URL);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const board = await computeScoreboard(client, registry);
    if (check) {
      let prev = "";
      try {
        prev = readFileSync(OUT, "utf8");
      } catch (error) {
        if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error;
      }
      let prevModules = "";
      try {
        prevModules = prev ? JSON.stringify(JSON.parse(prev).live_scenario_probe?.modules ?? {}) : "";
      } catch {
        prevModules = "";
      }
      if (prevModules !== JSON.stringify(board.modules)) {
        console.error(`scoreboard-from-live --check: ${OUT} is STALE vs live. Re-run without --check.`);
        process.exit(1);
      }
      console.log("scoreboard-from-live --check: committed scoreboard matches live.");
      process.exit(0);
    }
    // ADDITIVE into program-scoreboard.json. That file is NOT ours: it carries a richer curated
    // schema (meta.sourceSha / deployedSha / ledgerRows / failOpen, plus a tiered modules array
    // summarising the 680-row audit ledger) maintained by the auditor lane. An earlier version of this
    // script replaced it wholesale and deleted 730 lines of that work to publish a percentage —
    // trading something irreplaceable for something recomputable.
    let existing = {};
    try {
      existing = JSON.parse(readFileSync(OUT, "utf8"));
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error;
    }
    existing.live_scenario_probe = board;
    writeFileSync(OUT, JSON.stringify(existing, null, 2) + "\n");
    // Additive per-module live block. Modules with no matching file are skipped, not created — this
    // job reports on the module set that exists, it does not invent modules.
    let wrote = 0;
    for (const [module, v] of Object.entries(board.modules)) {
      if (module === "unmapped") continue;
      if (
        writeModuleLiveBlock(module, {
          source: "scripts/scoreboard-from-live.mjs (live prod probes, TMS-native only)",
          pass_count: v.pass_count,
          total_count: v.total_count,
          progress: v.progress,
          prod_verified: v.prod_verified,
          slices: v.slices,
        })
      ) {
        wrote += 1;
      }
    }
    console.log(`scoreboard-from-live: updated live_scenario_probe in ${wrote} module-completion file(s).`);
    const summary = Object.entries(board.modules)
      .map(([m, v]) => `${m} ${v.pass_count}/${v.total_count}`)
      .join(" · ");
    console.log(`scoreboard-from-live: wrote ${OUT} — ${summary}`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
