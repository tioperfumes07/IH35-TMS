#!/usr/bin/env node
/**
 * ENG-07 — Book Load refuses a city-only pickup/delivery stop.
 * A live booking must carry address_line1 (street) OR google_place_id. Drafts exempt.
 * Server: bookLoadInputPrecheck + create schema superRefine. Never weaken to optional.
 *
 *   node scripts/verify-book-stop-street-or-place-required.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-stop-street-or-place-required";
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";

function assert(files) {
  const book = files[BOOK] ?? "";
  const routes = files[ROUTES] ?? "";
  const problems = [];
  if (!/stop_street_or_google_place_required/.test(book)) {
    problems.push(`${BOOK}: bookLoadInputPrecheck must refuse with stop_street_or_google_place_required`);
  }
  if (!/source === "live_feed"/.test(book) || !/!street && !place/.test(book)) {
    problems.push(`${BOOK}: live_feed path must require street or google_place_id on pickup/delivery`);
  }
  if (!/street address or Google place is required — city-only is refused/.test(routes)) {
    problems.push(`${ROUTES}: create schema superRefine must refuse city-only stops on book_dispatch`);
  }
  if (!/save_mode !== "draft"/.test(routes.slice(routes.indexOf("ENG-07"))) && !/ENG-07[\s\S]*save_mode !== "draft"/.test(routes)) {
    // softer: the refine block near ENG-07 must gate on draft
    if (!/ENG-07:[\s\S]{0,200}save_mode !== "draft"/.test(routes)) {
      problems.push(`${ROUTES}: ENG-07 refine must exempt drafts`);
    }
  }
  return problems;
}

const files = Object.fromEntries([BOOK, ROUTES].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const plants = [
    ["precheck error code removed", { ...files, [BOOK]: files[BOOK].replace(/stop_street_or_google_place_required/g, "stop_ok") }],
    ["schema message removed", { ...files, [ROUTES]: files[ROUTES].replace("street address or Google place is required — city-only is refused", "ok") }],
  ];
  for (const [name, planted] of plants) {
    if (!assert(planted).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted "${name}" escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${plants.length}/${plants.length} planted breaks caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Book Load refuses city-only pickup/delivery (street or Google place)`);
process.exit(0);
