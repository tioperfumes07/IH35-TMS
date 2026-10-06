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

// LST-F413: both bulk routes now post INSIDE the categorize transaction through postBankCategorizationOnClient (owner law
// 2026-10-02: a categorized line and its GL commit together, or neither does). The fire-after-commit
// maybePostBankCategorizationToGl + `const bankFeedGl` shape this guard used to require is the pattern that was removed.
function analyzeBulkRoute(label, bulkRoute, companyIdExpr) {
  const failures = [];
  if (!bulkRoute) {
    failures.push(`could not isolate ${label}`);
    return failures;
  }
  const posterRe = new RegExp(
    String.raw`await\s+postBankCategorizationOnClient\s*\(\s*client\s*,\s*\{[\s\S]*?companyId:\s*${companyIdExpr}[\s\S]*?actorUserUuid:\s*String\(user\.uuid\)[\s\S]*?bankTransactionId:\s*id[\s\S]*?\}\s*\)`
  );
  if (!posterRe.test(bulkRoute)) {
    failures.push(`${label}: must await the bank-feed GL poster on the categorize transaction for each categorized row`);
  }
  if (!/bankFeedGl\.push\(\{\s*bank_transaction_id:\s*id,\s*\.\.\.posting\s*\}\)/.test(bulkRoute)) {
    failures.push(`${label}: must record the per-row bank_feed_gl outcome`);
  }
  if (!/bank_feed_gl:\s*(?:result\.)?bankFeedGl/.test(bulkRoute)) {
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
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verify-banking-bulk-categorize-je-"));
  const routePath = path.join(process.cwd(), ROUTE_PATH);
  const tmpCopiedPath = path.join(tmpRoot, ROUTE_PATH);
  fs.mkdirSync(path.dirname(tmpCopiedPath), { recursive: true });
  fs.writeFileSync(tmpCopiedPath, fs.readFileSync(routePath, "utf8"));

  if (run(tmpRoot).length) throw new Error(`PASS case failed: ${run(tmpRoot).join("; ")}`);

  const original = fs.readFileSync(tmpCopiedPath, "utf8");
  const bulkStart = original.indexOf('app.post("/api/v1/banking/transactions/categorize-bulk"');
  const awaitedPoster = original.indexOf("await postBankCategorizationOnClient", bulkStart);
  if (awaitedPoster < 0) throw new Error("could not locate categorize-bulk poster for selftest");
  const mutated = `${original.slice(0, awaitedPoster)}void postBankCategorizationOnClient${original.slice(
    awaitedPoster + "await postBankCategorizationOnClient".length
  )}`;
  fs.writeFileSync(tmpCopiedPath, mutated);
  if (!run(tmpRoot).length) throw new Error("FAIL case was not detected after removing categorize-bulk awaited poster");

  // Legacy dual-path: strip poster from /bulk-categorize while leaving categorize-bulk OK.
  fs.writeFileSync(tmpCopiedPath, original);
  const legacyStart = original.indexOf('app.post("/api/v1/banking/transactions/bulk-categorize"');
  const legacyPoster = original.indexOf("await postBankCategorizationOnClient", legacyStart);
  if (legacyPoster < 0) throw new Error("could not locate bulk-categorize poster for selftest");
  const legacyMutated = `${original.slice(0, legacyPoster)}/*removed*/${original.slice(
    legacyPoster + "await postBankCategorizationOnClient".length
  )}`;
  fs.writeFileSync(tmpCopiedPath, legacyMutated);
  const legacyFails = run(tmpRoot);
  if (!legacyFails.some((f) => f.includes("bulk-categorize"))) {
    throw new Error(`FAIL case was not detected for legacy bulk-categorize: ${legacyFails.join("; ")}`);
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true });
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
