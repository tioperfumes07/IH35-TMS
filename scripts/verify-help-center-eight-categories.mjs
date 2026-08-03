#!/usr/bin/env node
/**
 * HELP-S01/S02/S03 — Help center 8 categories · Overview flyout · Runbooks wired.
 *
 *   node scripts/verify-help-center-eight-categories.mjs
 *   node scripts/verify-help-center-eight-categories.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-help-center-eight-categories";

const CONTENT = "apps/frontend/src/help/helpCenterContent.ts";
const CENTER = "apps/frontend/src/pages/help/HelpCenterPage.tsx";
const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const RUNBOOKS = "apps/frontend/src/pages/help/RunbooksIndex.tsx";

const REQUIRED_CATS = [
  "Getting Started",
  "Dispatching Loads",
  "Driver Settlements",
  "Banking & Reconciliation",
  "Reports",
  "Account & Billing",
  "Module Guides",
  "Driver App",
];

function assert(files) {
  const problems = [];
  const content = files[CONTENT] ?? "";
  const center = files[CENTER] ?? "";
  const sidebar = files[SIDEBAR] ?? "";
  const manifest = files[MANIFEST] ?? "";
  const runbooks = files[RUNBOOKS] ?? "";

  for (const cat of REQUIRED_CATS) {
    if (!content.includes(`"${cat}"`) && !content.includes(`| "${cat}"`)) {
      problems.push(`${CONTENT}: HelpCategory missing "${cat}"`);
    }
    if (!center.includes(`"${cat}"`)) {
      problems.push(`${CENTER}: CATEGORY_ORDER missing "${cat}"`);
    }
  }
  const orderBlock = center.match(/const CATEGORY_ORDER[\s\S]*?\n\];/);
  if (orderBlock) {
    const count = REQUIRED_CATS.filter((c) => orderBlock[0].includes(`"${c}"`)).length;
    if (count !== 8) {
      problems.push(`${CENTER}: CATEGORY_ORDER must list all 8 categories (got ${count})`);
    }
  } else {
    problems.push(`${CENTER}: missing CATEGORY_ORDER`);
  }
  if (!/category:\s*"Driver App"/.test(content)) {
    problems.push(`${CONTENT}: module-driver-pwa (or Driver App article) must use category Driver App`);
  }

  // HELP-S02
  if (!/to:\s*"\/help\/overview"/.test(sidebar)) {
    problems.push(`${SIDEBAR}: flyout must link Overview → /help/overview`);
  }
  if (!/path="\/help\/overview"/.test(manifest)) {
    problems.push(`${MANIFEST}: must mount /help/overview`);
  }

  // HELP-S03
  if (!/path="\/help\/runbooks"/.test(manifest)) {
    problems.push(`${MANIFEST}: must mount /help/runbooks`);
  }
  if (!/data-testid="runbooks-index"/.test(runbooks) || !/RUNBOOKS\.map/.test(runbooks)) {
    problems.push(`${RUNBOOKS}: must render RUNBOOKS list (data-testid=runbooks-index)`);
  }
  if (!/to:\s*"\/help\/runbooks"/.test(sidebar)) {
    problems.push(`${SIDEBAR}: flyout must link Runbooks → /help/runbooks`);
  }

  return problems;
}

const files = Object.fromEntries(
  [CONTENT, CENTER, SIDEBAR, MANIFEST, RUNBOOKS].map((rel) => [
    rel,
    readFileSync(path.join(ROOT, rel), "utf8"),
  ]),
);

if (SELFTEST) {
  const planted = {
    ...files,
    [CENTER]: files[CENTER].replace(/"Driver App",?\n?/, ""),
  };
  const caught = assert(planted);
  if (!caught.some((p) => /Driver App|8 categor/i.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL`, caught);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — 8 help categories + Overview flyout + Runbooks wired`);
process.exit(0);
