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
 */
import pg from "pg";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OUT = "docs/audit/program-scoreboard.json";

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
};

async function loadRegistry() {
  for (const rel of [
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
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const board = await computeScoreboard(client, registry);
    const next = JSON.stringify(board, null, 2) + "\n";
    if (check) {
      const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
      const prevModules = prev ? JSON.stringify(JSON.parse(prev).modules ?? {}) : "";
      if (prevModules !== JSON.stringify(board.modules)) {
        console.error(`scoreboard-from-live --check: ${OUT} is STALE vs live. Re-run without --check.`);
        process.exit(1);
      }
      console.log("scoreboard-from-live --check: committed scoreboard matches live.");
      process.exit(0);
    }
    writeFileSync(OUT, next);
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
