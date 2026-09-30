#!/usr/bin/env node
/**
 * GUARD: a telematics position cache must carry its SOURCE timestamp, never now().
 *
 * WHY (measured live 2026-09-30, br-fancy-credit-akjnd07a):
 * jobs/samsara-position-poll-worker.ts does not call Samsara despite its name -- it MIRRORS
 * telematics.vehicle_latest_position into integrations.samsara_vehicle_positions. It wrote
 * `recorded_at = now()` on every row it copied:
 *   T170  source captured_at 2026-09-29 21:06:28Z  mirror recorded_at 2026-09-30 13:31:31Z
 *         -> 16h25m of freshness invented
 *   T173  source captured_at 2026-09-30 11:46:51Z  mirror recorded_at 2026-09-30 13:31:31Z
 *         -> 1h44m invented
 *   T171  source captured_at 2026-09-30 13:29:42Z  mirror recorded_at 2026-09-30 13:31:31Z
 *         -> genuinely fresh, and the only one of the three that was
 * A truck parked for sixteen hours read as reporting seconds ago. A cache that goes dark is a
 * problem; a cache that LIES about being current is worse, because nothing downstream can tell.
 *
 * THE RULE: recorded_at is when the truck reported. A mirror carries its source's timestamp
 * through, skips a row whose source timestamp is unknown, and never moves a timestamp backwards.
 *
 * Usage:  node scripts/verify-no-fabricated-telematics-freshness.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-no-fabricated-telematics-freshness";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = "apps/backend/src/jobs/samsara-position-poll-worker.ts";

export function assertNoFabricatedFreshness(src) {
  const problems = [];

  const insert = src.match(/INSERT INTO integrations\.samsara_vehicle_positions[\s\S]*?`/);
  if (!insert) {
    problems.push(`${WORKER}: the samsara_vehicle_positions upsert is gone -- this guard cannot verify it.`);
    return problems;
  }
  const sql = insert[0];

  if (/recorded_at\s*\)?[\s\S]{0,200}?VALUES[\s\S]{0,200}?\bnow\(\)/i.test(sql)) {
    problems.push(
      `${WORKER}: the upsert writes recorded_at = now(). This worker MIRRORS an existing table and cannot make a ` +
        `position newer than its source -- stamping now() invents freshness. Measured: 16h25m invented on T170. ` +
        `Carry the source's captured_at through instead.`
    );
  }
  if (!/\$\d+::timestamptz/.test(sql)) {
    problems.push(`${WORKER}: recorded_at is no longer bound from a parameter, so the source timestamp is not being carried through.`);
  }
  if (!/WHERE EXCLUDED\.recorded_at > integrations\.samsara_vehicle_positions\.recorded_at/.test(sql)) {
    problems.push(
      `${WORKER}: the upsert no longer refuses to move recorded_at backwards. A mirror pass must be a no-op unless ` +
        `the source genuinely advanced.`
    );
  }
  if (!/p\.captured_at/.test(src)) {
    problems.push(`${WORKER}: the source query no longer selects captured_at, so there is no real timestamp to carry.`);
  }
  if (!/if \(!row\.captured_at\)/.test(src)) {
    problems.push(
      `${WORKER}: a row with no source timestamp is no longer skipped. An unknown age is a question, never an ` +
        `answer -- writing one anyway is the defect this guard exists for.`
    );
  }
  if (!/skipped_no_source_timestamp/.test(src)) {
    problems.push(`${WORKER}: the run no longer counts skipped rows. A feed that mirrors nothing must say so -- no silent failures.`);
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, WORKER), "utf8");

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = read();
  const expect = (name, src, needle) => {
    const problems = assertNoFabricatedFreshness(src);
    if (!problems.some((p) => p.includes(needle))) failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  const live = assertNoFabricatedFreshness(good);
  if (live.length) failures.push(`live: ${live.join(" | ")}`);

  // 1. THE REAL REGRESSION -- verbatim the line that shipped.
  expect("now-in-values", good.replace("VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::timestamptz)", "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, now())"), "writes recorded_at = now()");
  // 2. The backwards guard is dropped.
  expect("backwards-allowed", good.replace(/\s*WHERE EXCLUDED\.recorded_at > integrations\.samsara_vehicle_positions\.recorded_at/, ""), "move recorded_at backwards");
  // 3. Rows with no source timestamp are written anyway.
  expect("unknown-age-written", good.replace("if (!row.captured_at)", "if (false)"), "no longer skipped");
  // 4. The source stops selecting captured_at.
  expect("source-drops-timestamp", good.replace(/\n\s*p\.captured_at/, ""), "no longer selects captured_at");
  // 5. The skip counter disappears.
  expect("silent-skips", good.replace(/skipped_no_source_timestamp/g, "x"), "no longer counts skipped rows");
  // 6. The upsert is removed entirely.
  expect("upsert-gone", good.replace(/INSERT INTO integrations\.samsara_vehicle_positions/g, "INSERT INTO other.table"), "upsert is gone");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 6/6 OK`);
  }
} else {
  const problems = assertNoFabricatedFreshness(read());
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
