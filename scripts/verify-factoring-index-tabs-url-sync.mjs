#!/usr/bin/env node
/**
 * verify-factoring-index-tabs-url-sync.mjs — Ops F: Factoring index shell tabs use ?tab=.
 * Note: FactoringHome.tsx is path-based; this guards the separate index.tsx shell.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-index-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/factoring/index.tsx";

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  for (const needle of [
    "useSearchParams",
    'searchParams.get("tab")',
    "parseFactoringIndexTab",
    'params.set("tab", next)',
  ]) {
    if (!source.includes(needle)) throw new Error(`${LABEL}: missing ${JSON.stringify(needle)} in ${PAGE}`);
  }
  if (source.includes('useState<TabId>("submit_to_factor")')) {
    throw new Error(`${LABEL}: local tab useState still present in ${PAGE}`);
  }
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) console.log(`${LABEL}: selftest PASS`);
else run();
