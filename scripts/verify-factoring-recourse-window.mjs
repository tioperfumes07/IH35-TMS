#!/usr/bin/env node
/**
 * FACT-02 — Faro recourse window is 95 days off advanced_at (not 90 / created_at).
 *
 * Modes:
 *   (default) static source + fixture selftest
 *   --live   connect DATABASE_URL and prove prod view defs (lucia bypass)
 *
 * FAIL if:
 *   - migration / routes / UI still hardcode the 90-day lie, OR
 *   - live views.factoring_summary / factoring_recourse_at_risk still age on created_at+90.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = "db/migrations/202609010000_fact_02_factoring_recourse_window_95d.sql";
const ROUTES = "apps/backend/src/factoring/factoring.routes.ts";
const CONTRACT = "apps/backend/src/accounting/factoring-posting/contract-config.ts";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

export function assertSourcesPresent(root = ROOT) {
  const problems = [];
  const migPath = path.join(root, MIGRATION);
  if (!fs.existsSync(migPath)) {
    problems.push(`missing ${MIGRATION}`);
    return problems;
  }
  const mig = fs.readFileSync(migPath, "utf8");
  for (const needle of [
    "95",
    "advanced_at",
    "views.factoring_recourse_at_risk",
    "views.factoring_summary",
    "security_invoker",
    "120 days",
  ]) {
    if (!mig.includes(needle)) problems.push(`migration missing: ${needle}`);
  }
  {
    // allow mentioning "90" in prose comments only
    const code = mig
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    if (/\b90\b/.test(code)) problems.push("migration executable body still references 90");
  }

  const contract = fs.readFileSync(path.join(root, CONTRACT), "utf8");
  if (!/FACTORING_REPURCHASE_DEADLINE_DAYS\s*=\s*95/.test(contract)) {
    problems.push("contract-config must lock FACTORING_REPURCHASE_DEADLINE_DAYS = 95");
  }

  const routes = fs.readFileSync(path.join(root, ROUTES), "utf8");
  if (!routes.includes("FACTORING_REPURCHASE_DEADLINE_DAYS")) {
    problems.push("factoring.routes.ts must import/use FACTORING_REPURCHASE_DEADLINE_DAYS");
  }
  if (/recourse_days:\s*90/.test(routes)) {
    problems.push("factoring.routes.ts still hardcodes recourse_days: 90");
  }

  const home = fs.readFileSync(path.join(root, HOME), "utf8");
  if (/recourse_days\s*\?\?\s*90/.test(home)) {
    problems.push("FactoringHome.tsx still falls back to ?? 90");
  }
  if (!/recourse_days\s*\?\?\s*95/.test(home) && !/FACTORING_REPURCHASE_DEADLINE_DAYS/.test(home)) {
    problems.push("FactoringHome.tsx must fall back to 95 (Faro repurchase deadline)");
  }

  return problems;
}

/** Pure check of view definition text. */
export function findViewDefProblems(summaryDef, riskDef) {
  const problems = [];
  const summary = String(summaryDef ?? "");
  const risk = String(riskDef ?? "");

  if (!summary) problems.push("views.factoring_summary definition empty");
  if (!risk) problems.push("views.factoring_recourse_at_risk definition empty");

  if (/\b90\s+AS\s+recourse_days\b/i.test(summary) || /AS\s+recourse_days[^,]*,\s*90/i.test(summary)) {
    problems.push("factoring_summary still hardcodes 90 AS recourse_days");
  }
  if (!/\b95\b/.test(summary) && !/recourse_days/.test(summary)) {
    problems.push("factoring_summary missing recourse_days");
  }
  if (!/\b95\b/.test(summary)) {
    problems.push("factoring_summary must expose 95 as recourse_days (stub or live)");
  }

  if (/created_at\s*\+\s*\(\(COALESCE\(af\.recourse_days,\s*90\)/i.test(risk)) {
    problems.push("factoring_recourse_at_risk still ages created_at + COALESCE(..., 90)");
  }
  if (/fa\.created_at\s*>=\s*\(now\(\)\s*-\s*'90 days'/i.test(risk) || /interval '90 days'/i.test(risk)) {
    problems.push("factoring_recourse_at_risk still prunes at 90 days");
  }
  if (!/advanced_at/i.test(risk)) {
    problems.push("factoring_recourse_at_risk must reference advanced_at");
  }
  if (!/\b95\b/.test(risk)) {
    problems.push("factoring_recourse_at_risk must default to 95 days");
  }
  if (!/120 days/i.test(risk) && !/interval '120 days'/i.test(risk)) {
    problems.push("factoring_recourse_at_risk must widen prune to 120 days");
  }
  return problems;
}

function selftest() {
  const staticProblems = assertSourcesPresent();
  if (staticProblems.length) throw new Error(`static: ${staticProblems.join("; ")}`);

  const badSummary = "SELECT 90 AS recourse_days WHERE false";
  const badRisk =
    "SELECT (fa.created_at + ((COALESCE(af.recourse_days, 90) || ' days')::interval))::date " +
    "FROM accounting.factoring_advances fa WHERE fa.created_at >= (now() - '90 days'::interval)";
  const badProblems = findViewDefProblems(badSummary, badRisk);
  if (badProblems.length < 3) {
    throw new Error(`selftest: planted 90d defect under-caught (${badProblems.join("; ")})`);
  }

  const goodSummary = "SELECT 95 AS recourse_days WHERE false";
  const goodRisk =
    "SELECT (COALESCE(fa.advanced_at, fa.created_at) + ((COALESCE(ag.repurchase_deadline_days, 95) || ' days')::interval))::date " +
    "FROM accounting.factoring_advances fa WHERE COALESCE(fa.advanced_at, fa.created_at) >= now() - interval '120 days'";
  const goodProblems = findViewDefProblems(goodSummary, goodRisk);
  if (goodProblems.length) {
    throw new Error(`selftest: good defs falsely failed (${goodProblems.join("; ")})`);
  }

  console.log("[verify-factoring-recourse-window] SELFTEST PASS");
}

async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for --live");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const { rows } = await client.query(`
      SELECT c.relname,
             pg_get_viewdef(c.oid, true) AS def
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'views'
         AND c.relname IN ('factoring_summary', 'factoring_recourse_at_risk')
    `);
    const byName = Object.fromEntries(rows.map((r) => [r.relname, r.def]));
    const problems = findViewDefProblems(byName.factoring_summary, byName.factoring_recourse_at_risk);
    if (problems.length) {
      console.error("[verify-factoring-recourse-window] LIVE FAIL:");
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(
      "[verify-factoring-recourse-window] LIVE PASS — factoring_summary + factoring_recourse_at_risk use 95d / advanced_at",
    );
  } finally {
    await client.end();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) {
    selftest();
    return;
  }
  const staticProblems = assertSourcesPresent();
  if (staticProblems.length) {
    console.error("[verify-factoring-recourse-window] FAIL:");
    for (const p of staticProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes("--live")) {
    await liveCheck();
    return;
  }
  console.log(
    "[verify-factoring-recourse-window] PASS — sources lock 95d/advanced_at; run --live with DATABASE_URL for prod proof",
  );
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((err) => {
    console.error(`[verify-factoring-recourse-window] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
