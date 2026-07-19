#!/usr/bin/env node
/**
 * G5-4 / 0243-g5-4 — structural (TypeScript AST) guard against report-refresh N+1.
 *
 * Detects:
 *  - nested unit×week loops that await computeDeadhead / per-unit load queries
 *  - for-of loops that await client.query(...INSERT INTO reports.lane_profitability_cache...)
 *    regardless of loop variable name / formatting
 *
 * Wiring: scripts/verify-steps/910-verify-report-refresh-no-nplus1.mjs (auto-discovered).
 * Do NOT register in package.json / locked-guards.yml / ci.yml (Rule 17).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

function parseSource(fileName, text) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function isAnyLoop(node) {
  return (
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  );
}

/** Element iteration (for-of / for-in) — the historical per-row N+1 shape. */
function isElementLoop(node) {
  return ts.isForOfStatement(node) || ts.isForInStatement(node);
}

function textOf(node, sourceFile) {
  return node.getText(sourceFile);
}

function collectStringyLiterals(node, sourceFile, into) {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    into.push(textOf(node, sourceFile));
  }
  ts.forEachChild(node, (child) => collectStringyLiterals(child, sourceFile, into));
}

function callIsAwaitClientQuery(node) {
  // await client.query(...)  OR  await something.query(...)
  if (!ts.isCallExpression(node)) return false;
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;
  return expr.name.text === "query";
}

function callIsAwaitComputeDeadhead(node) {
  if (!ts.isCallExpression(node)) return false;
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text === "computeDeadhead";
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === "computeDeadhead";
  return false;
}

function awaitExpressionTarget(awaitNode) {
  // await <expr>  — unwrap parentheses
  let expr = awaitNode.expression;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  return expr;
}

function findAwaitedCalls(root, sourceFile, predicate) {
  const hits = [];
  function visit(node, loopDepth, elementLoopDepth) {
    const nextLoopDepth = isAnyLoop(node) ? loopDepth + 1 : loopDepth;
    const nextElementDepth = isElementLoop(node) ? elementLoopDepth + 1 : elementLoopDepth;
    if (ts.isAwaitExpression(node)) {
      const target = awaitExpressionTarget(node);
      if (predicate(target, node, { loopDepth, elementLoopDepth })) {
        hits.push({ node, loopDepth, elementLoopDepth, text: textOf(node, sourceFile) });
      }
    }
    ts.forEachChild(node, (child) => visit(child, nextLoopDepth, nextElementDepth));
  }
  visit(root, 0, 0);
  return hits;
}

/**
 * Deadhead N+1: await computeDeadhead(...) inside nested loops (depth >= 2),
 * OR await client.query(...) whose SQL mentions assigned_unit_id = $2 (single-unit)
 * inside nested loops (the historical per unit×week load fetch).
 */
export function analyzeDeadheadNplus1(sourceText) {
  const sf = parseSource("deadhead.service.ts", sourceText);
  const failures = [];

  const computeHits = findAwaitedCalls(sf, sf, (target, _awaitNode, depths) => {
    return depths.loopDepth >= 2 && callIsAwaitComputeDeadhead(target);
  });
  if (computeHits.length > 0) {
    failures.push("deadhead refresh reintroduced nested-loop await computeDeadhead N+1");
  }

  const singleUnitLoadHits = findAwaitedCalls(sf, sf, (target, awaitNode, depths) => {
    if (depths.loopDepth < 2 || !callIsAwaitClientQuery(target)) return false;
    const literals = [];
    collectStringyLiterals(awaitNode, sf, literals);
    const joined = literals.join("\n");
    const isLoads = /FROM\s+mdata\.loads/i.test(joined);
    const isSingleUnit =
      /assigned_unit_id\s*=\s*\$\d+/i.test(joined) && !/ANY\s*\(\s*\$\d+::uuid\[\]\s*\)/i.test(joined);
    return isLoads && isSingleUnit;
  });
  if (singleUnitLoadHits.length > 0) {
    failures.push("deadhead refresh reintroduced nested-loop per-unit load query N+1");
  }

  return failures;
}

/**
 * Lane N+1: any for/while loop whose body awaits client.query(...INSERT INTO
 * reports.lane_profitability_cache...). Loop variable name is irrelevant.
 * Placeholder-building loops without await query are allowed.
 */
export function analyzeLanePerRowInsert(sourceText) {
  const sf = parseSource("lane-profitability.service.ts", sourceText);
  const failures = [];

  // Only element-iteration loops (for-of / for-in) count as per-row N+1.
  // Index/chunk `for (let offset = …)` loops that await a multi-row INSERT are allowed.
  const hits = findAwaitedCalls(sf, sf, (target, awaitNode, depths) => {
    if (depths.elementLoopDepth < 1 || !callIsAwaitClientQuery(target)) return false;
    const literals = [];
    collectStringyLiterals(awaitNode, sf, literals);
    const joined = literals.join("\n");
    return /INSERT\s+INTO\s+reports\.lane_profitability_cache/i.test(joined);
  });

  if (hits.length > 0) {
    failures.push("lane profitability refresh reintroduced per-row awaited INSERT loop");
  }
  return failures;
}

/**
 * Inspect source snapshots. Returns failure strings (empty = pass).
 */
export function inspect({ deadhead, lane, deadheadTest, laneTest }) {
  const failures = [];

  failures.push(...analyzeDeadheadNplus1(deadhead));
  if (!/DEADHEAD_REFRESH_UNIT_BATCH_SIZE/.test(deadhead)) {
    failures.push("deadhead refresh missing DEADHEAD_REFRESH_UNIT_BATCH_SIZE bounded batching");
  }
  if (!/assigned_unit_id\s*=\s*ANY\(\$2::uuid\[\]\)/.test(deadhead)) {
    failures.push("deadhead refresh must batch-load via assigned_unit_id = ANY($2::uuid[])");
  }
  if (!/INSERT INTO reports\.deadhead_cache/.test(deadhead) || !/insertPlaceholders\.join/.test(deadhead)) {
    failures.push("deadhead refresh must keep multi-row INSERT into reports.deadhead_cache");
  }
  if (!/l\.id ASC|localeCompare\(String\(b\.id\)\)/.test(deadhead)) {
    failures.push("deadhead must document/use deterministic load id tie-break");
  }
  if (/SELECT\s+\*\s+FROM\s+(mdata\.loads|reports\.deadhead_cache)/i.test(deadhead)) {
    failures.push("deadhead service must not use SELECT * on loads/deadhead_cache");
  }

  failures.push(...analyzeLanePerRowInsert(lane));
  if (!/LANE_CACHE_INSERT_MAX_ROWS/.test(lane) || !/LANE_CACHE_INSERT_BIND_BUDGET/.test(lane)) {
    failures.push("lane profitability must define bind-budget chunk constants");
  }
  if (!/INSERT INTO reports\.lane_profitability_cache/.test(lane) || !/insertPlaceholders\.join/.test(lane)) {
    failures.push("lane profitability refresh must use multi-row INSERT (insertPlaceholders.join)");
  }
  if (/SELECT\s+\*\s+FROM\s+reports\.lane_profitability_cache/i.test(lane)) {
    failures.push("lane profitability service must not use SELECT * on lane_profitability_cache");
  }

  if (!/G5-4/.test(deadheadTest) || !/loadBatchCalls|loadCalls/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must assert G5-4 load query batching");
  }
  if (!/oracle|computeDeadhead/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must include computeDeadhead oracle equivalence");
  }
  if (!/tie-break|identical/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must cover identical-timestamp id tie-break");
  }
  if (!/DEADHEAD_REFRESH_UNIT_BATCH_SIZE/.test(deadheadTest) || !/203|unitCount/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must cover 203+ unit chunking");
  }
  if (!/entity scope|opco-scoped/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must cover entity isolation");
  }
  if (!/planted_insert_failure/.test(deadheadTest)) {
    failures.push("deadhead-refresh-batch tests must cover INSERT failure atomicity");
  }

  if (!/LANE_CACHE_INSERT_MAX_ROWS|bind-budget|G5-4/.test(laneTest)) {
    failures.push("lane-profitability-refresh-batch tests must assert bind-budget chunking (G5-4)");
  }
  if (!/3500|3501/.test(laneTest)) {
    failures.push("lane-profitability-refresh-batch tests must cover >3500-lane multi-insert");
  }
  if (!/planted_lane_chunk_failure|planted_lane_insert_failure/.test(laneTest)) {
    failures.push("lane-profitability-refresh-batch tests must cover chunk INSERT failure atomicity");
  }
  if (!/empty/.test(laneTest)) {
    failures.push("lane-profitability-refresh-batch tests must cover empty batch");
  }
  if (!/opco-only|entity scope/.test(laneTest)) {
    failures.push("lane-profitability-refresh-batch tests must cover entity isolation");
  }

  return failures;
}

function runSelfTests(source) {
  const failures = [];

  // Planted: renamed variables + odd formatting for deadhead nested await computeDeadhead.
  const plantedDeadheadRenamed = analyzeDeadheadNplus1(`${source.deadhead}
export async function refreshDeadheadCache(client, operatingCompanyId) {
  for (const truck of unitsRes.rows) {
    for (const monday of weekStarts) {
      const summary = await computeDeadhead(
        client,
        operatingCompanyId,
        truck.id,
        monday
      );
    }
  }
}
`);
  if (!plantedDeadheadRenamed.some((f) => /N\+1|nested-loop/.test(f))) {
    failures.push("self-test failed: renamed-variable deadhead N+1 was not detected");
  }

  // Planted: nested-loop single-unit load query (no computeDeadhead name).
  const plantedDeadheadQuery = analyzeDeadheadNplus1(`${source.deadhead}
async function refreshDeadheadCache(client, opco) {
  for (const u of units) {
    for (const w of weeks) {
      await client.query(
        \`SELECT id FROM mdata.loads WHERE assigned_unit_id = $2::uuid\`,
        [opco, u, w]
      );
    }
  }
}
`);
  if (!plantedDeadheadQuery.some((f) => /per-unit load query/.test(f))) {
    failures.push("self-test failed: nested per-unit load query N+1 was not detected");
  }

  // Planted: renamed loop var + compact formatting for per-row lane INSERT.
  const plantedLaneRenamed = analyzeLanePerRowInsert(`${source.lane}
async function refreshLaneProfitabilityCache(client, opco, start, end) {
  for(const row of lanes){await client.query(\`INSERT INTO reports.lane_profitability_cache (operating_company_id) VALUES ($1)\`,[opco]);}
}
`);
  if (!plantedLaneRenamed.some((f) => /per-row awaited INSERT/.test(f))) {
    failures.push("self-test failed: renamed-variable lane per-row INSERT was not detected");
  }

  // Planted: for-await style alternative with item variable + multiline template.
  const plantedLaneFormatted = analyzeLanePerRowInsert(`${source.lane}
async function refreshLaneProfitabilityCache(client) {
  for (const item of lanes) {
    await client
      .query(
        \`
          INSERT INTO reports.lane_profitability_cache (
            operating_company_id
          ) VALUES ($1::uuid)
        \`,
        [item]
      );
  }
}
`);
  if (!plantedLaneFormatted.some((f) => /per-row awaited INSERT/.test(f))) {
    failures.push("self-test failed: formatted lane per-row INSERT was not detected");
  }

  // Planted SELECT *
  const plantedSelectStar = inspect({
    ...source,
    deadhead: source.deadhead + "\nSELECT * FROM mdata.loads\n",
  });
  if (!plantedSelectStar.some((f) => f.includes("SELECT *"))) {
    failures.push("self-test failed: planted SELECT * was not detected");
  }

  // Negative control: placeholder-building for-of must NOT trip lane detector.
  const placeholderOnly = analyzeLanePerRowInsert(`
async function refreshLaneProfitabilityCache(client, lanes) {
  const insertValues = [];
  const insertPlaceholders = [];
  for (const lane of lanes) {
    const base = insertValues.length;
    insertValues.push(lane.origin_city);
    insertPlaceholders.push(\`($\$\{base + 1})\`);
  }
  await client.query(\`INSERT INTO reports.lane_profitability_cache (...) VALUES \$\{insertPlaceholders.join(", ")}\`, insertValues);
}
`);
  if (placeholderOnly.length > 0) {
    failures.push("self-test failed: placeholder-building loop falsely flagged as per-row INSERT");
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

  const failures = [...inspect(source), ...runSelfTests(source)];

  if (failures.length) {
    console.error("verify-report-refresh-no-nplus1 FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(
    "verify-report-refresh-no-nplus1 OK — AST structural N+1/per-row INSERT detection; bind-budget lane chunks; oracle/tie-break/chunk plants fail-closed."
  );
}

main();
