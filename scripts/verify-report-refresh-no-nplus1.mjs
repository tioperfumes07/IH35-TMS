#!/usr/bin/env node
/**
 * G5-4 / 0243-g5-4 — report refresh must not reintroduce N+1 unit×week load loops
 * or per-lane INSERT loops. Fail-closed with planted self-test (Rule 16 + Rule 17).
 *
 * Wiring: scripts/verify-steps/910-verify-report-refresh-no-nplus1.mjs (auto-discovered).
 * Do NOT register in package.json / locked-guards.yml / ci.yml (Rule 17).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEADHEAD = path.join(ROOT, "apps/backend/src/reports/deadhead.service.ts");
const LANE = path.join(ROOT, "apps/backend/src/reports/lane-profitability.service.ts");
const DEADHEAD_TEST = path.join(
  ROOT,
  "apps/backend/src/reports/__tests__/deadhead-refresh-batch.test.ts"
);
const LANE_TEST = path.join(
  ROOT,
  "apps/backend/src/reports/__tests__/lane-profitability-refresh-batch.test.ts"
);

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing required file: ${path.relative(ROOT, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function extractBalancedBlock(source, openBraceIndex) {
  // openBraceIndex points at '{'. Skip braces inside quotes / template literals / ${}.
  let depth = 0;
  let i = openBraceIndex;
  let quote = null; // ' " `
  let templateExprDepth = 0;

  while (i < source.length) {
    const ch = source[i];
    const prev = i > 0 ? source[i - 1] : "";

    if (quote) {
      if (quote === "`" && ch === "$" && source[i + 1] === "{") {
        templateExprDepth += 1;
        i += 2;
        continue;
      }
      if (quote === "`" && ch === "}" && templateExprDepth > 0) {
        templateExprDepth -= 1;
        i += 1;
        continue;
      }
      if (ch === quote && prev !== "\\" && templateExprDepth === 0) {
        quote = null;
      }
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex + 1, i);
    }
    i += 1;
  }
  return null;
}

function hasPerLaneAwaitInsert(laneSource) {
  // True N+1: await client.query(...INSERT INTO reports.lane_profitability_cache...)
  // appears inside a for-of `lanes` loop. A placeholder-building for-loop that only
  // pushes into arrays (no await query) is allowed.
  const re = /for\s*\(\s*const\s+lane\s+of\s+lanes\s*\)\s*\{/g;
  let match;
  while ((match = re.exec(laneSource)) !== null) {
    const openBrace = match.index + match[0].length - 1;
    const body = extractBalancedBlock(laneSource, openBrace);
    if (!body) continue;
    if (
      /await\s+client\.query\s*\(/.test(body) &&
      /INSERT\s+INTO\s+reports\.lane_profitability_cache/.test(body)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Inspect source snapshots. Returns failure strings (empty = pass).
 */
export function inspect({ deadhead, lane, deadheadTest, laneTest }) {
  const failures = [];

  if (
    /for\s*\(\s*const\s+\w+\s+of\s+unitsRes\.rows\s*\)[\s\S]{0,500}?for\s*\(\s*const\s+\w+\s+of\s+weekStarts\s*\)[\s\S]{0,500}?await\s+computeDeadhead\s*\(/.test(
      deadhead
    )
  ) {
    failures.push("deadhead refresh reintroduced unit×week await computeDeadhead N+1 loop");
  }
  if (!/DEADHEAD_REFRESH_UNIT_BATCH_SIZE/.test(deadhead)) {
    failures.push("deadhead refresh missing DEADHEAD_REFRESH_UNIT_BATCH_SIZE bounded batching");
  }
  if (!/assigned_unit_id\s*=\s*ANY\(\$2::uuid\[\]\)/.test(deadhead)) {
    failures.push("deadhead refresh must batch-load via assigned_unit_id = ANY($2::uuid[])");
  }
  if (!/INSERT INTO reports\.deadhead_cache/.test(deadhead) || !/insertPlaceholders\.join/.test(deadhead)) {
    failures.push("deadhead refresh must keep one multi-row INSERT into reports.deadhead_cache");
  }
  if (/SELECT\s+\*\s+FROM\s+(mdata\.loads|reports\.deadhead_cache)/i.test(deadhead)) {
    failures.push("deadhead service must not use SELECT * on loads/deadhead_cache");
  }

  if (hasPerLaneAwaitInsert(lane)) {
    failures.push("lane profitability refresh reintroduced per-lane INSERT loop");
  }
  if (!/INSERT INTO reports\.lane_profitability_cache/.test(lane) || !/insertPlaceholders\.join/.test(lane)) {
    failures.push("lane profitability refresh must use one multi-row INSERT (insertPlaceholders.join)");
  }
  if (/SELECT\s+\*\s+FROM\s+reports\.lane_profitability_cache/i.test(lane)) {
    failures.push("lane profitability service must not use SELECT * on lane_profitability_cache");
  }

  if (!/G5-4/.test(deadheadTest) || !/loadCalls/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must assert G5-4 load query batching");
  }
  if (!/DEADHEAD_REFRESH_UNIT_BATCH_SIZE/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must cover large-batch chunking (no silent cap)");
  }
  if (!/entity scope|opco-scoped/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must cover entity isolation");
  }
  if (!/planted_insert_failure/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must cover INSERT failure atomicity");
  }

  if (!/multi-row INSERT|insertPlaceholders|G5-4/.test(laneTest)) {
    failures.push("lane-profitability-refresh-batch tests must assert multi-row INSERT (G5-4)");
  }
  if (!/empty/.test(laneTest)) {
    failures.push("lane-profitability-refresh-batch tests must cover empty batch");
  }
  if (!/planted_lane_insert_failure/.test(laneTest)) {
    failures.push("lane-profitability-refresh-batch tests must cover INSERT failure atomicity");
  }
  if (!/opco-only|entity scope/.test(laneTest)) {
    failures.push("lane-profitability-refresh-batch tests must cover entity isolation");
  }

  return failures;
}

function main() {
  const source = {
    deadhead: read(DEADHEAD),
    lane: read(LANE),
    deadheadTest: read(DEADHEAD_TEST),
    laneTest: read(LANE_TEST),
  };

  const failures = inspect(source);

  const plantedDeadhead = inspect({
    ...source,
    deadhead: `${source.deadhead}
for (const unit of unitsRes.rows) {
  for (const week of weekStarts) {
    const computed = await computeDeadhead(client, operatingCompanyId, unit.id, week);
  }
}
`,
  });
  if (!plantedDeadhead.some((f) => f.includes("unit×week") || f.includes("N+1"))) {
    failures.push("self-test failed: planted deadhead N+1 loop was not detected");
  }

  const plantedLane = inspect({
    ...source,
    lane: `${source.lane}
for (const lane of lanes) {
  await client.query(\`
        INSERT INTO reports.lane_profitability_cache (
          operating_company_id
        ) VALUES ($1)
      \`);
}
`,
  });
  if (!plantedLane.some((f) => f.includes("per-lane INSERT"))) {
    failures.push("self-test failed: planted lane per-row INSERT loop was not detected");
  }

  const plantedSelectStar = inspect({
    ...source,
    deadhead: source.deadhead + "\nSELECT * FROM mdata.loads\n",
  });
  if (!plantedSelectStar.some((f) => f.includes("SELECT *"))) {
    failures.push("self-test failed: planted SELECT * was not detected");
  }

  if (failures.length) {
    console.error("verify-report-refresh-no-nplus1 FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(
    "verify-report-refresh-no-nplus1 OK — deadhead batch reads + multi-row upsert; lane multi-row INSERT; planted N+1/per-row/SELECT * regressions fail-closed."
  );
}

main();
