#!/usr/bin/env node
/**
 * GUARD (RELAY-F440): every Relay daily tick records that it finished — success, or failure with the reason.
 *
 * Measured 2026-10-07 (prod): 14 relay_fuel_daily_pull ticks since 2026-10-01, finished_at NULL and success NULL on
 * every one, no error_message, no Sentry issue. integrations.integration_sync_log forces row-level security with
 * INSERT and SELECT policies only, so the completion UPDATE matched zero rows and Postgres said nothing. The claim
 * could never be closed, so the log could never say whether the pull worked. Silence was the defect.
 *
 * STATIC (always runs), on apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts:
 *   R1 the claim is closed in a `finally` (finishRelayTick inside finally), so a tick that throws still records it
 *   R2 finishRelayTick uses RETURNING and refuses an UPDATE that matched no row
 *   R3 claimRelayTick closes a stale open claim (finished_at IS NULL, older than the stale window) and skips only for a
 *      concurrent instance (finished_at IS NULL OR success = true) — a crashed run is reclaimable
 *   R4 lastCoveredEndDate falls back to max(relay_created_at) from integrations.relay_fuel_transactions
 *   R5 lastCoveredEndDate is read inside the try, never before it
 *   R6 a migration gives integrations.integration_sync_log an UPDATE policy
 * LIVE (with DATABASE_URL): no relay tick has finished_at IS NULL older than 2 hours.
 *
 * Run: node scripts/verify-relay-tick-completes.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-tick-completes";
const CRON = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts";
const MIGRATIONS = "db/migrations";
export const OPEN_CLAIM_MAX_AGE = "2 hours";
// verify-no-silent-db-skip (03d): the static rules R1–R6 always run and fail closed; with DATABASE_URL the live
// open-claim check runs too. Without a credential the guard says "static only" in its OK line, never a silent pass.
export const ALLOW_OFFLINE_SKIP = "static R1–R6 always run and fail closed; the live open-claim check runs whenever DATABASE_URL is set";

function fnBody(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return null;
  const next = src.slice(i + 1).search(/\n(?:export )?(?:async )?function /);
  return next < 0 ? src.slice(i) : src.slice(i, i + 1 + next);
}

export function staticProblems(cronSrc, migrationsSql) {
  const p = [];
  const tick = fnBody(cronSrc, "runRelayFuelIngestTick") ?? "";
  const finallyBlocks = [...tick.matchAll(/\}\s*finally\s*\{([\s\S]*?)\n    \}\n/g)].map((m) => m[1]);
  if (!finallyBlocks.some((b) => /finishRelayTick\(/.test(b))) {
    p.push("R1: runRelayFuelIngestTick does not close the claim in a `finally` — a tick that throws leaves finished_at NULL");
  }
  const finish = fnBody(cronSrc, "finishRelayTick") ?? "";
  if (!/RETURNING/.test(finish) || !/rows\.length\s*!==\s*1/.test(finish)) {
    p.push("R2: finishRelayTick does not refuse an UPDATE that matched no row (RETURNING + rows.length !== 1)");
  }
  const claim = fnBody(cronSrc, "claimRelayTick") ?? "";
  if (!/UPDATE integrations\.integration_sync_log[\s\S]*?finished_at IS NULL AND started_at <=/.test(claim)) {
    p.push("R3: claimRelayTick does not close a stale open claim — a crashed run blocks the next one");
  }
  if (!/finished_at IS NULL OR success = true/.test(claim)) {
    p.push("R3: claimRelayTick skips on any recent claim, not only a concurrent one (finished_at IS NULL OR success = true)");
  }
  const last = fnBody(cronSrc, "lastCoveredEndDate") ?? "";
  if (!/relay_fuel_transactions/.test(last) || !/max\(relay_created_at\)/.test(last)) {
    p.push("R4: lastCoveredEndDate has no fallback to max(relay_created_at) — the watermark cannot self-heal");
  }
  const tryIdx = tick.search(/\n    try \{/);
  const lastIdx = tick.indexOf("lastCoveredEndDate(");
  if (lastIdx < 0 || tryIdx < 0 || lastIdx < tryIdx) {
    p.push("R5: lastCoveredEndDate is read before the try — an error there leaves the claim open with no reason");
  }
  if (!/CREATE POLICY\s+\w+\s+ON\s+integrations\.integration_sync_log\s+FOR UPDATE/i.test(migrationsSql)) {
    p.push("R6: no migration gives integrations.integration_sync_log an UPDATE policy — the completion write matches 0 rows");
  }
  return p;
}

function loadMigrationsSql(root = ROOT) {
  const dir = path.join(root, MIGRATIONS);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
}

async function liveProblems(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const r = await client.query(
      `SELECT id::text, operating_company_id::text, started_at::text
         FROM integrations.integration_sync_log
        WHERE integration = 'relay' AND finished_at IS NULL AND started_at < now() - interval '${OPEN_CLAIM_MAX_AGE}'
        ORDER BY started_at`
    );
    await client.query("ROLLBACK");
    return r.rows.map((x) => `LIVE: relay tick ${x.id} (company ${x.operating_company_id}) started ${x.started_at} never recorded a finish`);
  } finally {
    await client.end();
  }
}

const cronSrc = fs.readFileSync(path.join(ROOT, CRON), "utf8");
const migrationsSql = loadMigrationsSql();

if (process.argv.includes("--selftest")) {
  const real = staticProblems(cronSrc, migrationsSql);
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${real.join("\n  - ")}`);
    process.exit(1);
  }
  const plants = [
    ["R1 finish outside finally", staticProblems(cronSrc.replace(/\} finally \{/, "} /*no finally*/ {"), migrationsSql), "R1"],
    ["R2 finish without row check", staticProblems(cronSrc.replace("rows.length !== 1", "rows.length > 99"), migrationsSql), "R2"],
    ["R3 no stale reclaim", staticProblems(cronSrc.replace("finished_at IS NULL AND started_at <=", "finished_at IS NULL AND started_at >"), migrationsSql), "R3"],
    ["R3 skip on any recent claim", staticProblems(cronSrc.replace("finished_at IS NULL OR success = true", "true"), migrationsSql), "R3"],
    ["R4 no watermark fallback", staticProblems(cronSrc.replace("max(relay_created_at)", "max(created_at)"), migrationsSql), "R4"],
    [
      "R5 watermark read before try",
      staticProblems(
        cronSrc.replace(
          "    try {\n      lastEnd = await withLuciaBypass",
          "    lastEnd = await withLuciaBypass(async (client) => lastCoveredEndDate(client, operatingCompanyId));\n    try {\n      lastEnd = await withLuciaBypass"
        ),
        migrationsSql
      ),
      "R5",
    ],
    ["R6 no UPDATE policy", staticProblems(cronSrc, migrationsSql.replace(/FOR UPDATE/g, "FOR SELECT")), "R6"],
  ];
  const missed = plants.filter(([, probs, rule]) => !probs.some((x) => x.startsWith(rule))).map(([n]) => n);
  if (missed.length) {
    console.error(`${LABEL} --selftest FAIL — not caught: ${missed.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — real tree clean; ${plants.length}/${plants.length} plants caught (R1–R6)`);
  process.exit(0);
}

const problems = staticProblems(cronSrc, migrationsSql);
const url = process.env.DATABASE_URL;
if (url) problems.push(...(await liveProblems(url)));
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
  for (const x of problems) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — the Relay tick closes its claim in finally, refuses a 0-row finish, reclaims a crashed run, self-heals its watermark` +
    (url ? `; live: no relay tick open longer than ${OPEN_CLAIM_MAX_AGE}` : " (static only — no DATABASE_URL)")
);
