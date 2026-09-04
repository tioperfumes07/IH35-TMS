#!/usr/bin/env node
/**
 * ACC-19 (2026-09-04) — guards two things that regressed silently once already this session:
 *
 * 1. SAVEPOINT ISOLATION. runLedgerIntegrityTick runs every detector, for every company, inside
 *    ONE transaction (withLuciaBypass). A detector's caught JS exception does NOT reset Postgres's
 *    own aborted-transaction state — without a real per-detector SAVEPOINT / ROLLBACK TO SAVEPOINT
 *    / RELEASE SAVEPOINT, one detector's failure silently poisons every later detector's query, for
 *    every remaining company, for the rest of that tick. Live-confirmed 2026-09-04:
 *    _system.background_jobs.ledger.integrity_cron had been failing this exact way on every tick
 *    since before 2026-09-01, even after this session's earlier try/catch-only isolation fix
 *    (BANK-F10002, #20200) — that fix was necessary but not sufficient.
 *
 * 2. DETECTOR REGISTRY COMPLETENESS. The detectors array inside runLedgerIntegrityTick is the only
 *    thing that makes an exported check* function actually run on a schedule — a check can exist,
 *    compile, and even have its own unit tests while never being wired into the array (the same
 *    "written but never run" pattern this session found repeatedly elsewhere). This guard asserts
 *    every exported checkXForCompany function in the service is referenced inside the array.
 *
 * --selftest proves both detection rules against fixtures; the live run reads the actual source.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ledger-integrity-savepoint-isolation-and-registry";
const SERVICE_REL = "apps/backend/src/reconciliation/ledger-integrity-detectors.service.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure check over already-read source text, so --selftest can prove it with fixtures. */
export function checkSavepointIsolationAndRegistry(source) {
  const failures = [];

  // Rule 1 — SAVEPOINT isolation must be real, not just a try/catch.
  if (!/SAVEPOINT \$\{savepoint\}/.test(source) && !/query\(`SAVEPOINT/.test(source)) {
    failures.push("runDetectorIsolated must issue a real SAVEPOINT before calling the detector");
  }
  if (!/ROLLBACK TO SAVEPOINT/.test(source)) {
    failures.push("runDetectorIsolated must ROLLBACK TO SAVEPOINT on a caught detector failure — a bare try/catch alone leaves the shared transaction aborted for every later detector and company");
  }
  if (!/RELEASE SAVEPOINT/.test(source)) {
    failures.push("runDetectorIsolated must RELEASE SAVEPOINT (both on success and after rollback) — an un-released savepoint leaks across the loop");
  }

  // Rule 2 — every exported checkXForCompany(...) function must be referenced in the detectors array
  // inside runLedgerIntegrityTick. A function can be exported, unit-tested, and still never run on a
  // schedule if nobody adds it to that array — this catches exactly that gap.
  const exportedCheckNames = [...source.matchAll(/export async function (check\w+ForCompany)\(/g)].map((m) => m[1]);
  if (exportedCheckNames.length === 0) {
    failures.push("no exported checkXForCompany functions found — source shape changed, guard needs updating");
  }
  const tickMatch = source.match(/export async function runLedgerIntegrityTick[\s\S]*?\n\}\n/);
  const tickBody = tickMatch ? tickMatch[0] : "";
  for (const name of exportedCheckNames) {
    if (!tickBody.includes(name)) {
      failures.push(`${name} is exported but not referenced inside runLedgerIntegrityTick's detectors array — it will never run on a schedule`);
    }
  }

  return failures;
}

function runSelftest() {
  const goodSource = `
export async function runDetectorIsolated(name, operatingCompanyId, runId, client, fn) {
  const savepoint = \`ledger_detector_\${name}\`;
  await client.query(\`SAVEPOINT \${savepoint}\`);
  try {
    await fn();
    await client.query(\`RELEASE SAVEPOINT \${savepoint}\`);
  } catch (err) {
    await client.query(\`ROLLBACK TO SAVEPOINT \${savepoint}\`);
    await client.query(\`RELEASE SAVEPOINT \${savepoint}\`);
  }
}
export async function checkFooForCompany(client, operatingCompanyId, runId) {}
export async function checkBarForCompany(client, operatingCompanyId, runId) {}
export async function runLedgerIntegrityTick(client) {
  const detectors = [
    ["foo", () => checkFooForCompany(client, operatingCompanyId, runId)],
    ["bar", () => checkBarForCompany(client, operatingCompanyId, runId)],
  ];
  for (const [name, fn] of detectors) {
    await runDetectorIsolated(name, operatingCompanyId, runId, client, fn);
  }
}
`;
  if (checkSavepointIsolationAndRegistry(goodSource).length !== 0) {
    throw new Error(`selftest: fully-wired fixture must pass with zero failures — got ${JSON.stringify(checkSavepointIsolationAndRegistry(goodSource))}`);
  }

  // Planted mutation: the BANK-F10002-only fix (try/catch, no rollback) — must fail. This is
  // exactly the regression this guard exists to catch: it looks isolated, and is not.
  const noRollback = goodSource.replace(
    /await client\.query\(`ROLLBACK TO SAVEPOINT \$\{savepoint\}`\);\n\s*await client\.query\(`RELEASE SAVEPOINT \$\{savepoint\}`\);/,
    "// swallowed, no rollback"
  );
  const noRollbackFailures = checkSavepointIsolationAndRegistry(noRollback);
  if (!noRollbackFailures.some((f) => f.includes("ROLLBACK TO SAVEPOINT"))) {
    throw new Error("selftest: removing ROLLBACK TO SAVEPOINT must be flagged — it was not");
  }

  // Planted mutation: a new exported check function that nobody added to the detectors array — the
  // "written but never run" regression — must fail.
  const orphanedCheck = goodSource.replace(
    "export async function checkBarForCompany(client, operatingCompanyId, runId) {}",
    'export async function checkBarForCompany(client, operatingCompanyId, runId) {}\nexport async function checkOrphanedForCompany(client, operatingCompanyId, runId) {}'
  );
  const orphanedFailures = checkSavepointIsolationAndRegistry(orphanedCheck);
  if (!orphanedFailures.some((f) => f.includes("checkOrphanedForCompany"))) {
    throw new Error("selftest: an exported check function missing from the detectors array must be flagged — it was not");
  }

  console.log(`[${LABEL}] --selftest OK (real fixture passes; no-rollback and orphaned-check-function mutations both correctly detected)`);
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

const source = read(SERVICE_REL);
const failures = checkSavepointIsolationAndRegistry(source);

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK — SAVEPOINT isolation real, every exported check function is registered in runLedgerIntegrityTick`);
process.exit(0);
