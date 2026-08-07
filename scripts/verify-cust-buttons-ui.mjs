#!/usr/bin/env node
/**
 * CUST-buttons.ui / CUST-CHROME-01 — Customers header Edit must share Button chrome with
 * "New transaction" (secondary + primary), not ActionButton text-link. Primary uses navy §7
 * (#1f2a44 via Button component); no blue utility classes in the action row.
 *
 *   node scripts/verify-cust-buttons-ui.mjs
 *   node scripts/verify-cust-buttons-ui.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-cust-buttons-ui";

const CUSTOMERS = "apps/frontend/src/pages/Customers.tsx";
const TEST = "apps/frontend/src/pages/customers/__tests__/CustomersPage.action-button.test.tsx";

const BLUE_UTILITY = /\b(bg|text|border|ring|from|to|via|outline|decoration|fill|stroke)-(blue|sky|indigo)-\d{2,3}\b/;

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function sliceBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) return "";
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return src.slice(start, start + 600);
  return src.slice(start, end + endMarker.length);
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

function editIsSecondaryButton(src, testId) {
  const re = new RegExp(
    `variant="secondary"[\\s\\S]{0,400}data-testid="${testId}"[\\s\\S]{0,80}>\\s*Edit\\s*<\\/Button>`,
  );
  const reRev = new RegExp(
    `data-testid="${testId}"[\\s\\S]{0,400}variant="secondary"[\\s\\S]{0,80}>\\s*Edit\\s*<\\/Button>`,
  );
  return re.test(src) || reRev.test(src);
}

function sliceAround(src, marker, before = 220, after = 80) {
  const i = src.indexOf(marker);
  if (i < 0) return "";
  return src.slice(Math.max(0, i - before), i + marker.length + after);
}

export function collectProblems(sources = { customers: read(CUSTOMERS), test: read(TEST) }) {
  const problems = [];
  const cust = stripComments(sources.customers);

  const actionsWin = sliceBetween(cust, 'data-testid="customer-header-actions"', "</div>");
  if (!actionsWin) {
    problems.push(`${CUSTOMERS}: missing data-testid=customer-header-actions`);
  } else {
    if (BLUE_UTILITY.test(actionsWin)) {
      problems.push(`${CUSTOMERS}: customer-header-actions must not use blue/sky/indigo utilities (§7 navy)`);
    }
    if (!actionsWin.includes('data-testid="customer-header-edit"')) {
      problems.push(`${CUSTOMERS}: missing data-testid=customer-header-edit in header actions`);
    }
    if (!actionsWin.includes('data-testid="customer-header-new-transaction"')) {
      problems.push(`${CUSTOMERS}: missing data-testid=customer-header-new-transaction in header actions`);
    }
  }

  const editWin = sliceAround(cust, 'data-testid="customer-header-edit"', 120, 80);
  if (!editIsSecondaryButton(cust, "customer-header-edit")) {
    problems.push(`${CUSTOMERS}: header Edit must be <Button variant="secondary">`);
  } else if (editWin && /<ActionButton\b/.test(editWin)) {
    problems.push(`${CUSTOMERS}: header Edit must not use ActionButton text-link`);
  } else if (editWin && !/\bh-8\b/.test(editWin)) {
    problems.push(`${CUSTOMERS}: header Edit must use h-8 to match primary New transaction height`);
  }

  const newWin = sliceAround(cust, 'data-testid="customer-header-new-transaction"');
  if (!newWin) {
    problems.push(`${CUSTOMERS}: missing customer-header-new-transaction`);
  } else {
    if (/<ActionButton\b/.test(newWin)) {
      problems.push(`${CUSTOMERS}: New transaction must not use ActionButton`);
    }
    if (!/<Button\b/.test(newWin)) {
      problems.push(`${CUSTOMERS}: New transaction must use shared Button component`);
    }
    if (/variant="secondary"/.test(newWin)) {
      problems.push(`${CUSTOMERS}: New transaction must stay primary Button (not secondary)`);
    }
  }

  const detailsWin = sliceAround(cust, 'data-testid="customer-details-edit"', 120, 40);
  if (!editIsSecondaryButton(cust, "customer-details-edit")) {
    problems.push(`${CUSTOMERS}: customer-details-edit must be Button variant=secondary (CUST-CHROME-02)`);
  } else if (detailsWin && /<ActionButton\b/.test(detailsWin)) {
    problems.push(`${CUSTOMERS}: customer-details-edit must not use ActionButton`);
  }

  const testSrc = sources.test;
  if (!testSrc.includes('customer-header-edit')) {
    problems.push(`${TEST}: must assert customer-header-edit Button chrome`);
  }
  if (!testSrc.includes("bg-[#1f2a44]")) {
    problems.push(`${TEST}: must assert navy §7 primary token on New transaction`);
  }
  if (!/toMatch\(\/border-gray-300\|bg-white\//.test(testSrc)) {
    problems.push(`${TEST}: must assert secondary Edit chrome (border-gray-300|bg-white)`);
  }

  return problems;
}

if (SELFTEST) {
  const real = { customers: read(CUSTOMERS), test: read(TEST) };
  const broken = {
    customers: real.customers.replace(
      /data-testid="customer-header-edit"[\s\S]*?<\/Button>/,
      '<ActionButton data-testid="customer-header-edit">Edit</ActionButton>',
    ),
    test: real.test,
  };
  const caught = collectProblems(broken);
  if (!caught.some((p) => p.includes("ActionButton") || p.includes("secondary"))) {
    console.error(`${LABEL} SELFTEST FAIL — ActionButton regression not caught`, caught);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL on real sources:\n${good.map((p) => "  - " + p).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = collectProblems();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — Customers Edit/New transaction share Button chrome; navy §7; no blue in action row`);
process.exit(0);
