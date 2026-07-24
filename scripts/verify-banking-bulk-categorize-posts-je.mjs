#!/usr/bin/env node
// BANKING-MATCH-JE-DENSITY — bulk categorization must invoke the same existing CHAIN-05
// bank-feed poster as the single-row categorize route. Otherwise rows reach `categorized` while
// the enabled bank-feed GL path is silently skipped and no matched_journal_entry_id is stamped.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROUTE_PATH = "apps/backend/src/banking/categorization.routes.ts";

export function run(root = process.cwd()) {
  const failures = [];
  const routePath = path.join(root, ROUTE_PATH);
  if (!fs.existsSync(routePath)) {
    return [`missing ${ROUTE_PATH}`];
  }

  const source = fs.readFileSync(routePath, "utf8");
  const start = source.indexOf('app.post("/api/v1/banking/transactions/categorize-bulk"');
  const end = source.indexOf('app.post("/api/v1/banking/transactions/:id/transfer"', start);
  const bulkRoute = start >= 0 && end > start ? source.slice(start, end) : "";

  if (!bulkRoute) {
    failures.push("could not isolate POST /api/v1/banking/transactions/categorize-bulk");
    return failures;
  }
  if (!/const bankFeedGl/.test(bulkRoute)) {
    failures.push("bulk categorize route must report per-row bank_feed_gl outcomes");
  }
  if (!/for\s*\(\s*const id of result\.categorizedIds\s*\)/.test(bulkRoute)) {
    failures.push("bulk categorize route must process only rows successfully categorized");
  }
  if (!/await\s+maybePostBankCategorizationToGl\s*\(\s*\{[\s\S]*?companyId:\s*body\.data\.operating_company_id[\s\S]*?actorUserUuid:\s*String\(user\.uuid\)[\s\S]*?bankTransactionId:\s*id[\s\S]*?\}\s*\)/.test(bulkRoute)) {
    failures.push("bulk categorize route must await the existing bank-feed GL poster for each categorized row");
  }
  if (!/bank_feed_gl:\s*bankFeedGl/.test(bulkRoute)) {
    failures.push("bulk categorize response must expose bank_feed_gl posting outcomes");
  }
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
  if (awaitedPoster < 0) throw new Error("could not locate bulk poster invocation for selftest");
  const mutated = `${original.slice(0, awaitedPoster)}void maybePostBankCategorizationToGl${original.slice(
    awaitedPoster + "await maybePostBankCategorizationToGl".length
  )}`;
  fs.writeFileSync(copiedPath, mutated);
  if (!run(root).length) throw new Error("FAIL case was not detected after removing awaited poster invocation");

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
