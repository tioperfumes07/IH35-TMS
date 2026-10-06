#!/usr/bin/env node
/**
 * ROUND 313 E-32: Samsara driver documents land in docs.files linked to load + stop + unit + driver, idempotent per
 * photo, filed as POD (never relabelled BOL -- the BOL category drives auto-invoicing, a money-lane rule).
 */
import { readFileSync } from "node:fs";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_samsara_documents_engine(); }
async function selftest_verify_samsara_documents_engine() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_samsara_documents_engine", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}
const svc = readFileSync("apps/backend/src/integrations/samsara/documents/samsara-documents.service.ts", "utf8");
const idx = readFileSync("apps/backend/src/index.ts", "utf8");
const link = readFileSync("apps/backend/src/telematics/telematics-linkage.service.ts", "utf8");
const mig = readFileSync("db/migrations/202615191000_engine_system_actor_and_stop_file_links.sql", "utf8");
const checks = [
  [/r2Key = `samsara\/documents\/\$\{docId\}\/\$\{i \+ 1\}`/.test(svc) && /SELECT 1 FROM docs\.files WHERE r2_key = \$1/.test(svc), "idempotent per document photo (r2_key)"],
  [/\["load", stop\?\.load_id/.test(svc) && /\["load_stop", stop\?\.stop_id/.test(svc) && /\["unit", unitId\]/.test(svc) && /\["driver", driverId\]/.test(svc), "links load + stop + unit + driver"],
  [/code = 'pod'/.test(svc) && !/code = 'bol'/.test(svc), "filed as POD, never as BOL"],
  [/ih35Stop/.test(svc), "stop resolved from the E-31 route stop externalIds.ih35Stop"],
  [/'load_stop'::text/.test(mig), "file_links accepts load_stop"],
  [/initializeSamsaraDocumentsCron\(app\)/.test(idx), "hourly documents cron registered"],
  [/documents: await q\(/.test(link), "load + unit reverse links list documents"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-samsara-documents-engine: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-samsara-documents-engine: OK (${checks.length})`);
