#!/usr/bin/env node
// BANKING-MATCH-JE-DENSITY — BOTH bulk categorization routes must invoke the same existing CHAIN-05
// bank-feed poster as the single-row categorize route. Otherwise rows reach `categorized` while
// the enabled bank-feed GL path is silently skipped and no matched_journal_entry_id is stamped.
//
// Routes covered:
//   POST …/categorize-bulk   (active For Review UI)
//   POST …/bulk-categorize   (legacy/spec body — dual-path parity)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROUTE_PATH = "apps/backend/src/banking/categorization.routes.ts";

function isolateRoute(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function analyzeBulkRoute(label, bulkRoute, companyIdExpr) {
  const failures = [];
  if (!bulkRoute) {
    failures.push(`could not isolate ${label}`);
    return failures;
  }
  if (!/const bankFeedGl/.test(bulkRoute)) {
    failures.push(`${label}: must report per-row bank_feed_gl outcomes`);
  }
  if (!/for\s*\(\s*const id of result\.categorizedIds\s*\)/.test(bulkRoute)) {
    failures.push(`${label}: must process only rows successfully categorized`);
  }
  const posterRe = new RegExp(
    String.raw`await\s+maybePostBankCategorizationToGl\s*\(\s*\{[\s\S]*?companyId:\s*${companyIdExpr}[\s\S]*?actorUserUuid:\s*String\(user\.uuid\)[\s\S]*?bankTransactionId:\s*id[\s\S]*?\}\s*\)`
  );
  if (!posterRe.test(bulkRoute)) {
    failures.push(`${label}: must await the existing bank-feed GL poster for each categorized row`);
  }
  if (!/bank_feed_gl:\s*bankFeedGl/.test(bulkRoute)) {
    failures.push(`${label}: response must expose bank_feed_gl posting outcomes`);
  }
  return failures;
}

export function run(root = process.cwd()) {
  const failures = [];
  const routePath = path.join(root, ROUTE_PATH);
  if (!fs.existsSync(routePath)) {
    return [`missing ${ROUTE_PATH}`];
  }

  const source = fs.readFileSync(routePath, "utf8");
  const categorizeBulk = isolateRoute(
    source,
    'app.post("/api/v1/banking/transactions/categorize-bulk"',
    'app.post("/api/v1/banking/transactions/:id/transfer"'
  );
  failures.push(...analyzeBulkRoute("POST …/categorize-bulk", categorizeBulk, String.raw`body\.data\.operating_company_id`));

  const legacyBulk = isolateRoute(
    source,
    'app.post("/api/v1/banking/transactions/bulk-categorize"',
    'app.post("/api/v1/banking/transactions/bulk-post-as-bills"'
  );
  failures.push(...analyzeBulkRoute("POST …/bulk-categorize", legacyBulk, String.raw`query\.data\.operating_company_id`));

  return failures;
}

if (process.argv.includes("--selftest")) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-banking-bulk-categorize-je-"));
  const routePath = path.join(process.cwd(), ROUTE_PATH);
  const copiedPath = path.join(root, ROUTE_PATH);
  fs.mkdirSync(path.dirname(copiedPath), { recursive: true });
  fs.writeFileSync(copiedPath, fs.readFileSync(routePath, "utf8"));

  if (run(root).length) throw new Error(`PASS case failed: ${run(root).join("; ")}`);

  const original = fs.readFileSync(copiedPath, "utf8");
  const bulkStart = original.indexOf('app.post("/api/v1/banking/transactions/categorize-bulk"');
  const awaitedPoster = original.indexOf("await maybePostBankCategorizationToGl", bulkStart);
  if (awaitedPoster < 0) throw new Error("could not locate categorize-bulk poster for selftest");
  const mutated = `${original.slice(0, awaitedPoster)}void maybePostBankCategorizationToGl${original.slice(
    awaitedPoster + "await maybePostBankCategorizationToGl".length
  )}`;
  fs.writeFileSync(copiedPath, mutated);
  if (!run(root).length) throw new Error("FAIL case was not detected after removing categorize-bulk awaited poster");

  // Legacy dual-path: strip poster from /bulk-categorize while leaving categorize-bulk OK.
  fs.writeFileSync(copiedPath, original);
  const legacyStart = original.indexOf('app.post("/api/v1/banking/transactions/bulk-categorize"');
  const legacyPoster = original.indexOf("await maybePostBankCategorizationToGl", legacyStart);
  if (legacyPoster < 0) throw new Error("could not locate bulk-categorize poster for selftest");
  const legacyMutated = `${original.slice(0, legacyPoster)}/*removed*/${original.slice(
    legacyPoster + "await maybePostBankCategorizationToGl".length
  )}`;
  fs.writeFileSync(copiedPath, legacyMutated);
  const legacyFails = run(root);
  if (!legacyFails.some((f) => f.includes("bulk-categorize"))) {
    throw new Error(`FAIL case was not detected for legacy bulk-categorize: ${legacyFails.join("; ")}`);
  }

  fs.rmSync(root, { recursive: true, force: true });
  console.log("verify-banking-bulk-categorize-posts-je --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify:banking-bulk-categorize-posts-je — FAILED");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("verify:banking-bulk-categorize-posts-je — OK");
}
