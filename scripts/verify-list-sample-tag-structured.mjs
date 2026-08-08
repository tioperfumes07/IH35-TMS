#!/usr/bin/env node
/**
 * LV-LIST-SAMPLE-TAG-IN-NAME-ONLY — Gate-B sample rows must be findable by a STRUCTURED column
 * (notes/description), not only by ILIKE on the display name.
 *
 * Root fix lives in apps/backend/src/catalogs/accounting/factory.ts:
 *   resolveCatalogDescriptionFromName copies USMCA_GATEB_SAMPLE_YYYY-MM-DD from display_name
 *   into the description column (accounts.notes / items.description) when description is omitted,
 *   and fills metadata.notes when that key exists and is empty.
 *
 *   node scripts/verify-list-sample-tag-structured.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FACTORY = "apps/backend/src/catalogs/accounting/factory.ts";
const LABEL = "verify-list-sample-tag-structured";

function assert(src) {
  const problems = [];
  if (!/export function resolveCatalogDescriptionFromName/.test(src)) {
    problems.push(`${FACTORY}: missing resolveCatalogDescriptionFromName export`);
  }
  if (!/GATE_B_SAMPLE_TAG_RE/.test(src)) {
    problems.push(`${FACTORY}: missing GATE_B_SAMPLE_TAG_RE`);
  }
  if (!/resolveCatalogDescriptionFromName\(\s*body\.display_name/.test(src)) {
    problems.push(`${FACTORY}: create path must call resolveCatalogDescriptionFromName(body.display_name, …)`);
  }
  if (!/extra\.notes\s*=\s*resolvedDescription/.test(src)) {
    problems.push(`${FACTORY}: must stamp extra.notes from resolvedDescription when notes key is empty`);
  }
  return problems;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, FACTORY), "utf8");
  if (assert(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — live factory does not satisfy assertions`, assert(good));
    process.exit(1);
  }
  const planted = good
    .replace(/export function resolveCatalogDescriptionFromName/, "function resolveCatalogDescriptionFromName_REMOVED")
    .replace(/resolveCatalogDescriptionFromName\(\s*body\.display_name/g, "String(body.description ?? null /* removed */");
  if (!assert(planted).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted breakage not detected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = fs.readFileSync(path.join(ROOT, FACTORY), "utf8");
  const problems = assert(src);
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — Gate-B sample tag copies into structured notes/description on catalog create`);
}
