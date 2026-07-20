#!/usr/bin/env node
/**
 * verify-form425c-tabs-url-sync.mjs — Ops F: Form 425C tabs use ?tab=.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/form425c/Form425CHome.tsx";

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  for (const needle of [
    "useSearchParams",
    'searchParams.get("tab")',
    "parseForm425CTab",
    'params.set("tab", next)',
  ]) {
    if (!source.includes(needle)) throw new Error(`${LABEL}: missing ${JSON.stringify(needle)} in ${PAGE}`);
  }
  if (source.includes('useState<TabId>("profile")')) {
    throw new Error(`${LABEL}: local tab useState still present in ${PAGE}`);
  }
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) console.log(`${LABEL}: selftest PASS`);
else run();
