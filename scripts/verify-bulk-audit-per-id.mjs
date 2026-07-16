#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const bulkDir = path.join(repoRoot, "apps/backend/src/bulk");

function readTsFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`[verify-bulk-audit-per-id] missing directory: ${dir}`);
    process.exit(1);
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readTsFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

const bulkFiles = readTsFiles(bulkDir);
const routeFiles = bulkFiles.filter((file) => file.includes("bulk-update") || file.includes("factory"));

if (routeFiles.length === 0) {
  console.error("[verify-bulk-audit-per-id] no bulk route/factory sources found");
  process.exit(1);
}

const perIdMarkers = ["appendBulkCrudAudit", "appendLegacyFleetBulkAudit", "appendCrudAudit"];
const perIdLoopMarkers = ["processBulkPerId", "for (const updatedRow", "for (const"];

for (const file of routeFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("registerBulkRoute") && !source.includes("appendLegacyFleetBulkAudit")) {
    continue;
  }
  const hasAudit = perIdMarkers.some((marker) => source.includes(marker));
  const hasPerIdLoop = perIdLoopMarkers.some((marker) => source.includes(marker));
  if (!hasAudit || !hasPerIdLoop) {
    console.error(
      `[verify-bulk-audit-per-id] ${path.relative(repoRoot, file)} must emit audit per affected ID`
    );
    process.exit(1);
  }
}

const mdataRoutes = [
  path.join(repoRoot, "apps/backend/src/mdata/unit-bulk-update.routes.ts"),
  path.join(repoRoot, "apps/backend/src/mdata/equipment-bulk-update.routes.ts"),
];

for (const file of mdataRoutes) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("appendLegacyFleetBulkAudit")) {
    console.error(`[verify-bulk-audit-per-id] ${path.relative(repoRoot, file)} missing per-ID bulk audit helper`);
    process.exit(1);
  }
  if (!source.includes("for (const updatedRow")) {
    console.error(`[verify-bulk-audit-per-id] ${path.relative(repoRoot, file)} missing per-row audit loop`);
    process.exit(1);
  }
}

// Banking bulk categorize (#2585 review follow-up): POST /banking/transactions/categorize-bulk must
// emit the SAME per-ID CRUD audit + spine event as the single-row categorize route — a bulk path that
// mutates banking.bank_transactions silently is an audit hole.
const categorizationRoutes = path.join(repoRoot, "apps/backend/src/banking/categorization.routes.ts");
{
  const source = fs.readFileSync(categorizationRoutes, "utf8");
  const rel = path.relative(repoRoot, categorizationRoutes);
  const start = source.indexOf('"/api/v1/banking/transactions/categorize-bulk"');
  if (start === -1) {
    console.error(`[verify-bulk-audit-per-id] ${rel} missing categorize-bulk route`);
    process.exit(1);
  }
  // `start` sits inside the categorize-bulk `app.post(` call, so the next `app.post(` is the
  // following route registration — the slice covers this whole handler (loop + post-commit spine emits).
  const nextRoute = source.indexOf("app.post(", start);
  const block = source.slice(start, nextRoute === -1 ? undefined : nextRoute);
  if (!block.includes("for (const id of body.data.transaction_ids)")) {
    console.error(`[verify-bulk-audit-per-id] ${rel} categorize-bulk missing per-ID loop`);
    process.exit(1);
  }
  if (!block.includes("appendCrudAudit(")) {
    console.error(`[verify-bulk-audit-per-id] ${rel} categorize-bulk must appendCrudAudit per affected ID`);
    process.exit(1);
  }
  if (!block.includes("emitBankingSpineEvent(")) {
    console.error(`[verify-bulk-audit-per-id] ${rel} categorize-bulk must emit transaction.categorized spine event per affected ID`);
    process.exit(1);
  }
}

console.log("[verify-bulk-audit-per-id] OK");
