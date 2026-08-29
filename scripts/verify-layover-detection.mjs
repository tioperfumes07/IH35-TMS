#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","load","connectivity","reverse_link"],"leaves":["misc.layover"],"task":"DSP-F7072-LAYOVER-HISTORY-COMPLETE-RANGE","vertical":"class-sweep"} */
/**
 * GAP-28 CI guard — verifies layover detection worker and routes are wired into
 * apps/backend/src/index.ts.
 *
 * Real incident this guard exists for (2026-08-01): apps/backend/src/jobs/layover-detector-worker.ts
 * fully implemented initializeLayoverDetectorWorker (routes registered, worker exported) but nothing
 * ever imported/called it from index.ts — the layover-detection worker (driver pay) silently never
 * ran on any live server, and this guard was the ONLY thing that caught it once it existed. The
 * string-import check below is deliberately strict about BOTH the import statement and the call site,
 * so "imported but never called" (the exact regression) fails loud.
 *
 * Self-test: node scripts/verify-layover-detection.mjs --selftest
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-layover-detection";
const INDEX_TS_PATH = "apps/backend/src/index.ts";
const SERVICE_TS_PATH = "apps/backend/src/dispatch/layovers/detection.service.ts";

export function assertGuard(indexTs) {
  const errors = [];
  if (!/registerLayoverRoutes\(app\)/.test(indexTs)) {
    errors.push("layover routes not registered — registerLayoverRoutes(app) call missing from index.ts");
  }
  if (!/import\s*\{\s*initializeLayoverDetectorWorker\s*\}\s*from\s*"[^"]*layover-detector-worker\.js"/.test(indexTs)) {
    errors.push("layover worker not imported — initializeLayoverDetectorWorker import missing from index.ts");
  }
  if (!/initializeLayoverDetectorWorker\(app\)/.test(indexTs)) {
    errors.push("layover worker imported but never called — initializeLayoverDetectorWorker(app) missing from index.ts startup");
  }
  return errors;
}

export function assertCompleteRange(serviceTs) {
  const errors = [];
  const historyQuery = serviceTs.match(/FROM dispatch\.driver_layovers dl[\s\S]*?params\n\s*\);/)?.[0] ?? "";
  if (!historyQuery) errors.push("canonical driver layover history query missing");
  if (!/WHERE dl\.operating_company_id = \$1::uuid AND dl\.driver_uuid = \$2/.test(historyQuery)) {
    errors.push("layover history must retain exact company and driver scope");
  }
  if (!/ORDER BY dl\.layover_started_at DESC, dl\.uuid DESC/.test(historyQuery)) {
    errors.push("layover history must use stable deterministic ordering");
  }
  if (/\bLIMIT\s+\d+/i.test(historyQuery)) {
    errors.push("layover history must not silently cap the selected date range");
  }
  return errors;
}

export function assertDetectorSerialization(serviceTs) {
  const errors = [];
  if (!/const lockKey = `dispatch\.layover_detector:\$\{operatingCompanyId\}`/.test(serviceTs)) {
    errors.push("layover detector must derive an exact per-company advisory lock key");
  }
  if (!/pg_advisory_lock\(hashtextextended\(\$1::text, 0\)\)/.test(serviceTs)) {
    errors.push("layover detector must acquire the per-company session lock");
  }
  if (!/finally\s*\{[\s\S]*?pg_advisory_unlock\(hashtextextended\(\$1::text, 0\)\)/.test(serviceTs)) {
    errors.push("layover detector must release the session lock in finally");
  }
  if (!/WHERE driver_uuid = \$1 AND previous_load_uuid = \$2 LIMIT 1/.test(serviceTs)) {
    errors.push("layover dedupe must retain canonical driver+previous-load identity");
  }
  if (!/const created = await client\.query<\{ uuid: string \}>\([\s\S]*?INSERT INTO dispatch\.driver_layovers[\s\S]*?RETURNING uuid::text/.test(serviceTs)) {
    errors.push("layover detector must return the canonical created identity");
  }
  if (!/if \(!created\.rows\[0\]\?\.uuid\) \{[\s\S]*?throw new LayoverDetectionUnavailableError\("driver_layovers insert returned no identity"\)/.test(serviceTs)) {
    errors.push("layover detector must fail loud before incrementing when the canonical insert returns no identity");
  }
  const identityCheck = serviceTs.indexOf("if (!created.rows[0]?.uuid)");
  const insertedIncrement = serviceTs.indexOf("inserted++");
  if (identityCheck < 0 || insertedIncrement < 0 || identityCheck > insertedIncrement) {
    errors.push("layover detector must prove the created identity before incrementing its success count");
  }
  return errors;
}

function selftest() {
  const good = `
    import { registerLayoverRoutes } from "./dispatch/layovers/routes.js";
    import { initializeLayoverDetectorWorker } from "./jobs/layover-detector-worker.js";
    await registerLayoverRoutes(app);
    initializeLayoverDetectorWorker(app);
  `;
  if (assertGuard(good).length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture rejected`, assertGuard(good));
    process.exit(1);
  }

  // Bad fixture 1: routes never registered.
  const noRoutes = good.replace("await registerLayoverRoutes(app);", "");
  if (!assertGuard(noRoutes).some((e) => e.includes("routes not registered"))) {
    console.error(`[${LABEL}] --selftest FAIL: missing route registration not rejected`);
    process.exit(1);
  }

  // Bad fixture 2: exact real-world regression — worker fully implemented and exported elsewhere,
  // but never imported here (this is the bug this guard was written to catch).
  const notImported = good.replace(
    'import { initializeLayoverDetectorWorker } from "./jobs/layover-detector-worker.js";\n',
    ""
  ).replace("    initializeLayoverDetectorWorker(app);\n", "");
  const notImportedErrors = assertGuard(notImported);
  if (!notImportedErrors.some((e) => e.includes("not imported"))) {
    console.error(`[${LABEL}] --selftest FAIL: missing worker import not rejected`, notImportedErrors);
    process.exit(1);
  }

  // Bad fixture 3: imported but never called (worker dead-code — the subtler half of the same bug).
  const importedNotCalled = good.replace("    initializeLayoverDetectorWorker(app);\n", "");
  const importedNotCalledErrors = assertGuard(importedNotCalled);
  if (!importedNotCalledErrors.some((e) => e.includes("never called"))) {
    console.error(`[${LABEL}] --selftest FAIL: imported-but-never-called not rejected`, importedNotCalledErrors);
    process.exit(1);
  }

  const completeHistory = `
    FROM dispatch.driver_layovers dl
    WHERE dl.operating_company_id = $1::uuid AND dl.driver_uuid = $2
    ORDER BY dl.layover_started_at DESC, dl.uuid DESC\`,
    params
  );
  `;
  if (assertCompleteRange(completeHistory).length) {
    console.error(`[${LABEL}] --selftest FAIL: complete-history fixture rejected`, assertCompleteRange(completeHistory));
    process.exit(1);
  }
  const rangeMutations = [
    completeHistory.replace("ORDER BY dl.layover_started_at DESC, dl.uuid DESC", "ORDER BY dl.layover_started_at DESC LIMIT 100"),
    completeHistory.replace("dl.operating_company_id = $1::uuid", "dl.operating_company_id IS NOT NULL"),
    completeHistory.replace(", dl.uuid DESC", ""),
  ];
  for (const [index, mutated] of rangeMutations.entries()) {
    if (assertCompleteRange(mutated).length === 0) {
      console.error(`[${LABEL}] --selftest FAIL: complete-range mutation ${index + 1} escaped`);
      process.exit(1);
    }
  }

  const serializedDetector = `
    const lockKey = \`dispatch.layover_detector:\${operatingCompanyId}\`;
    await client.query(\`SELECT pg_advisory_lock(hashtextextended($1::text, 0))\`, [lockKey]);
    try {
      SELECT 1 FROM dispatch.driver_layovers
      WHERE driver_uuid = $1 AND previous_load_uuid = $2 LIMIT 1
      const created = await client.query<{ uuid: string }>(
        INSERT INTO dispatch.driver_layovers DEFAULT VALUES RETURNING uuid::text
      );
      if (!created.rows[0]?.uuid) {
        throw new LayoverDetectionUnavailableError("driver_layovers insert returned no identity");
      }
      inserted++;
    } finally {
      await client.query(\`SELECT pg_advisory_unlock(hashtextextended($1::text, 0))\`, [lockKey]);
    }
  `;
  const serializationMutations = [
    serializedDetector.replace("pg_advisory_lock", "pg_advisory_lock_missing"),
    serializedDetector.replace("finally", "if (true)"),
    serializedDetector.replace("pg_advisory_unlock", "pg_advisory_unlock_missing"),
    serializedDetector.replace("previous_load_uuid = $2", "previous_load_uuid IS NOT NULL"),
    serializedDetector.replace("RETURNING uuid::text", "RETURNING driver_uuid::text"),
    serializedDetector.replace("if (!created.rows[0]?.uuid)", "if (false)"),
    serializedDetector.replace("if (!created.rows[0]?.uuid)", "inserted++;\n      if (!created.rows[0]?.uuid)"),
  ];
  for (const [index, mutated] of serializationMutations.entries()) {
    if (assertDetectorSerialization(mutated).length === 0) {
      console.error(`[${LABEL}] --selftest FAIL: serialization mutation ${index + 1} escaped`);
      process.exit(1);
    }
  }

  console.log(`[${LABEL}] --selftest OK — 13/13 wiring/range/serialization/identity mutations red`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const indexTs = readFileSync(INDEX_TS_PATH, "utf8");
  const serviceTs = readFileSync(SERVICE_TS_PATH, "utf8");
  const errors = [...assertGuard(indexTs), ...assertCompleteRange(serviceTs), ...assertDetectorSerialization(serviceTs)];
  if (errors.length) {
    for (const e of errors) console.error(`✗ FAIL: ${e}`);
    console.error("GAP-28 CI guard failed");
    process.exit(1);
  }
  console.log("✓ layover routes registered");
  console.log("✓ layover worker initialized");
  console.log("GAP-28 layover detection guard: PASS");
}

main();
