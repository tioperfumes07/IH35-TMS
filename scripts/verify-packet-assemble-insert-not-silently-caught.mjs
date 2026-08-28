#!/usr/bin/env node
// verify-packet-assemble-insert-not-silently-caught (BANK-F9519-PACKET-ASSEMBLE-SILENT-INSERT-CATCH)
//
// apps/backend/src/factoring/packet-assemble.service.ts's auto-create-invoice-from-load INSERT
// used to be wrapped in `.catch(() => ({ rows: [] }))`. The `ON CONFLICT (source_load_id) DO
// NOTHING` already produces a legitimate 0-rows outcome (invoice already exists, handled by a
// re-fetch) — a .catch() had nothing honest left to catch: it could only swallow a REAL error (bad
// load id, constraint violation, DB hiccup) and misreport it as "conflict, re-fetch", silently
// producing a null invoiceId with no trace of what actually failed.
//
// Removing the swallow only pushes the honesty requirement up one level: assembleFactoringPacket
// has TWO call sites (pod.routes.ts's fire-and-forget on POD approval, which already has its own
// .catch(); and sweepAndAssemblePackets' own loop, which processes up to 500 loads per company per
// run and must not let one bad row's now-propagating exception abort the whole sweep). Both must
// stay guarded, or fixing the inner swallow just moves the outage to "one bad load kills the daily
// sweep for every other load."
//
// Injectable core (`check(sources)`) so --selftest exercises the REAL assertions against synthetic
// file content instead of re-deriving the extraction logic — a duplicated inline check is a check
// that will silently drift from what actually runs (this guard's own first draft did exactly that:
// a bare `.includes("try")` substring check was fooled by the word "try" inside this file's own
// explanatory comment; caught only by mutation-testing against the real file, not the selftest).
//
// Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/factoring/packet-assemble.service.ts";
const POD_ROUTES = "apps/backend/src/dispatch/pod.routes.ts";

function readReal(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

/** Text from the INSERT INTO accounting.invoices statement up to its RETURNING id closing, plus a tail. */
function insertInvoiceBlock(src) {
  const start = src.indexOf("INSERT INTO accounting.invoices");
  if (start < 0) return "";
  const end = src.indexOf("RETURNING id", start);
  if (end < 0) return "";
  return src.slice(start, end + 200);
}

/** Body of `export async function sweepAndAssemblePackets(...)` up to the next top-level export. */
function sweepBody(src) {
  const start = src.search(/export\s+async\s+function\s+sweepAndAssemblePackets\s*\(/);
  if (start < 0) return "";
  const rest = src.slice(start + 8);
  const next = rest.search(/\nexport\s+(async\s+)?function\s/);
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * `sources`: { packetAssemble: string, podRoutes: string }. Defaults to the real files on disk —
 * the selftest overrides both with synthetic content so it exercises this exact function.
 */
export function check(sources) {
  const failures = [];
  let src, podRoutes;
  if (sources) {
    src = sources.packetAssemble;
    podRoutes = sources.podRoutes;
  } else {
    try { src = readReal(FILE); } catch { return [`${FILE} not found`]; }
    try { podRoutes = readReal(POD_ROUTES); } catch { return [`${POD_ROUTES} not found`]; }
  }

  const insertBlock = insertInvoiceBlock(src);
  if (!insertBlock) {
    failures.push(`${FILE}: INSERT INTO accounting.invoices ... RETURNING id not found`);
  } else if (/\.catch\s*\(/.test(insertBlock)) {
    failures.push(
      `${FILE}: the auto-create-invoice-from-load INSERT must NOT be wrapped in .catch() — ` +
        `ON CONFLICT DO NOTHING already handles the legitimate 0-rows case; a .catch() here can ` +
        `only swallow a real error and misreport it as a conflict (BANK-F9519 regression)`
    );
  }

  const sweep = sweepBody(src);
  if (!sweep) {
    failures.push(`${FILE}: sweepAndAssemblePackets() not found`);
  } else {
    const callIdx = sweep.search(/await\s+assembleFactoringPacket\s*\(/);
    if (callIdx < 0) {
      failures.push(`${FILE}: sweepAndAssemblePackets() must call assembleFactoringPacket per eligible load`);
    } else {
      // A real `try {` (a code keyword, not the word "try" anywhere — e.g. inside a comment) must
      // open after the `for (` and before the call, and a real `} catch (` must close it after.
      const before = sweep.slice(0, callIdx);
      const after = sweep.slice(callIdx);
      const forStart = before.lastIndexOf("for (");
      const sinceFor = forStart < 0 ? "" : before.slice(forStart);
      const hasTryBeforeCall = /\btry\s*\{/.test(sinceFor);
      const hasCatchAfter = /\}\s*catch\s*\(/.test(after.slice(0, 1500));
      if (forStart < 0 || !hasTryBeforeCall || !hasCatchAfter) {
        failures.push(
          `${FILE}: sweepAndAssemblePackets()'s per-load assembleFactoringPacket() call must be inside ` +
            `a real try { ... } catch (...) { ... } — since packet-assemble.service.ts's own INSERT no ` +
            `longer swallows errors, one bad load's exception would otherwise abort the sweep for every ` +
            `other load in the batch`
        );
      }
    }
  }

  if (!/void\s+assembleFactoringPacket\s*\([\s\S]{0,300}?\.catch\s*\(/.test(podRoutes)) {
    failures.push(
      `${POD_ROUTES}: the fire-and-forget assembleFactoringPacket(...) call must keep its own .catch() ` +
        `— packet assembly must never block or roll back the POD review transaction`
    );
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodSweep = `export async function sweepAndAssemblePackets(userId, opco) { return withCurrentUser(userId, async client => { for (const row of rows) { try { const result = await assembleFactoringPacket({loadId: row.id}); if (result.ok) assembled++; } catch (err) { errored++; } } }); }\nexport async function nextFn() {}`;
  // Regression fixture for this guard's own first-draft bug: a comment mentioning "try/catch"
  // sitting above a loop with NO real try block must still be caught.
  const sweepWithTryOnlyInComment = `export async function sweepAndAssemblePackets(userId, opco) { return withCurrentUser(userId, async client => { for (const row of rows) { // this needs its own try/catch, see BANK-F9519\n      const result = await assembleFactoringPacket({loadId: row.id}); if (result.ok) assembled++; } }); }\nexport async function nextFn() {}`;
  const badSweepNoTry = `export async function sweepAndAssemblePackets(userId, opco) { return withCurrentUser(userId, async client => { for (const row of rows) { const result = await assembleFactoringPacket({loadId: row.id}); if (result.ok) assembled++; } }); }\nexport async function nextFn() {}`;
  const insertOk = "\n          `,\n        [input.loadId, input.operatingCompanyId, input.userId],\n      );\n";
  const insertBad = "\n          `,\n        [input.loadId, input.operatingCompanyId, input.userId],\n      ).catch(() => ({ rows: [] }));\n";
  const podGood = `if (x) {\n      void assembleFactoringPacket({loadId: y}).catch((err) => { req.log.warn({err}, "assemble_factoring_packet_failed"); });\n    }`;
  const podBad = `if (x) {\n      void assembleFactoringPacket({loadId: y});\n    }`;

  const good = () =>
    check({
      packetAssemble: `INSERT INTO accounting.invoices (a,b) SELECT x FROM mdata.loads ON CONFLICT (source_load_id) DO NOTHING RETURNING id${insertOk}\n${goodSweep}`,
      podRoutes: podGood,
    });
  const badInsertCatch = () =>
    check({
      packetAssemble: `INSERT INTO accounting.invoices (a,b) SELECT x FROM mdata.loads ON CONFLICT (source_load_id) DO NOTHING RETURNING id${insertBad}\n${goodSweep}`,
      podRoutes: podGood,
    });
  const badSweepMissingTry = () =>
    check({
      packetAssemble: `INSERT INTO accounting.invoices (a,b) SELECT x FROM mdata.loads ON CONFLICT (source_load_id) DO NOTHING RETURNING id${insertOk}\n${badSweepNoTry}`,
      podRoutes: podGood,
    });
  const badSweepTryOnlyInComment = () =>
    check({
      packetAssemble: `INSERT INTO accounting.invoices (a,b) SELECT x FROM mdata.loads ON CONFLICT (source_load_id) DO NOTHING RETURNING id${insertOk}\n${sweepWithTryOnlyInComment}`,
      podRoutes: podGood,
    });
  const badPod = () =>
    check({
      packetAssemble: `INSERT INTO accounting.invoices (a,b) SELECT x FROM mdata.loads ON CONFLICT (source_load_id) DO NOTHING RETURNING id${insertOk}\n${goodSweep}`,
      podRoutes: podBad,
    });

  const checks = [
    ["fully wired sources produce zero failures", good().length === 0],
    [".catch() on the INSERT is caught", badInsertCatch().some((f) => f.includes("must NOT be wrapped in .catch()"))],
    ["sweep loop with no try/catch at all is caught", badSweepMissingTry().some((f) => f.includes("must be inside"))],
    ["sweep loop with \"try\" only inside a comment (no real try block) is caught — regression fixture for this guard's own first-draft bug", badSweepTryOnlyInComment().some((f) => f.includes("must be inside"))],
    ["pod.routes.ts missing its own .catch() is caught", badPod().some((f) => f.includes("must keep its own .catch()"))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:packet-assemble-insert-not-silently-caught --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:packet-assemble-insert-not-silently-caught --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error("verify:packet-assemble-insert-not-silently-caught FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:packet-assemble-insert-not-silently-caught PASS (INSERT propagates real errors; both call sites keep their own error handling)");
}
