#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-sync-status-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/qbo/QBOSyncStatusDashboardPage.tsx";

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  for (const needle of ["useSearchParams", 'searchParams.get("tab")', 'setActiveTab("conflicts")', 'params.set("tab", next)']) {
    if (!source.includes(needle)) throw new Error(`${LABEL}: missing ${JSON.stringify(needle)}`);
  }
  if (source.includes('useState<"runs" | "conflicts">("runs")')) {
    throw new Error(`${LABEL}: local tab useState still present`);
  }
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) console.log(`${LABEL}: selftest PASS`);
else run();
