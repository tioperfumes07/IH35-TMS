#!/usr/bin/env node
/**
 * verify-sidebar-contract.mjs
 * CI guard: asserts SIDEBAR_ITEM_IDS in sidebar-config.ts matches the locked 21-item array.
 * Fails with a descriptive error if length, specific indexes, or full order drift.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const sidebarPath = path.join(
  ROOT,
  "apps/frontend/src/components/layout/sidebar-config.ts"
);

const LOCKED_ORDER = [
  "home",
  "maintenance",
  "fuel",
  "dispatch",
  "drivers",
  "safety",
  "accounting",
  "insurance",
  "bank",
  "factoring",
  "customers",
  "vendors",
  "lists",
  "reports",
  "legal",
  "docs",
  "eld",
  "form_425",
  "drv_app",
  "users",
  "help",
];

const EXPECTED_LENGTH = 21;
const EXPECTED_INSURANCE_INDEX = 7;
const EXPECTED_FACTORING_INDEX = 9;

const src = fs.readFileSync(sidebarPath, "utf8");

// Extract SIDEBAR_ITEM_IDS array from the TypeScript source.
// Matches: export const SIDEBAR_ITEM_IDS = [ ... ] as const;
const arrayMatch = src.match(
  /export\s+const\s+SIDEBAR_ITEM_IDS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/
);
if (!arrayMatch) {
  console.error(
    "verify-sidebar-contract FAIL: could not find SIDEBAR_ITEM_IDS export in sidebar-config.ts"
  );
  process.exit(1);
}

const rawItems = arrayMatch[1]
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const m = line.match(/^"([^"]+)"/);
    return m ? m[1] : null;
  })
  .filter(Boolean);

const errors = [];

// Assertion 1: length === 21
if (rawItems.length !== EXPECTED_LENGTH) {
  errors.push(
    `length mismatch: found ${rawItems.length}, expected ${EXPECTED_LENGTH}`
  );
}

// Assertion 2: index 7 === 'insurance'
if (rawItems[EXPECTED_INSURANCE_INDEX] !== "insurance") {
  errors.push(
    `index ${EXPECTED_INSURANCE_INDEX} mismatch: found "${rawItems[EXPECTED_INSURANCE_INDEX]}", expected "insurance"`
  );
}

// Assertion 3: index 9 === 'factoring'
if (rawItems[EXPECTED_FACTORING_INDEX] !== "factoring") {
  errors.push(
    `index ${EXPECTED_FACTORING_INDEX} mismatch: found "${rawItems[EXPECTED_FACTORING_INDEX]}", expected "factoring"`
  );
}

// Assertion 4: full exact ordered array
for (let i = 0; i < LOCKED_ORDER.length; i++) {
  if (rawItems[i] !== LOCKED_ORDER[i]) {
    errors.push(
      `position ${i} mismatch: found "${rawItems[i]}", expected "${LOCKED_ORDER[i]}"`
    );
  }
}
// Also catch any extra items beyond locked length
if (rawItems.length > LOCKED_ORDER.length) {
  for (let i = LOCKED_ORDER.length; i < rawItems.length; i++) {
    errors.push(`unexpected extra item at position ${i}: "${rawItems[i]}"`);
  }
}

if (errors.length > 0) {
  console.error("verify-sidebar-contract FAIL — SIDEBAR_ITEM_IDS has drifted from the locked 21-item array:");
  for (const e of errors) {
    console.error(`  • ${e}`);
  }
  console.error(
    "\nLocked array: " + JSON.stringify(LOCKED_ORDER)
  );
  console.error("Found array:  " + JSON.stringify(rawItems));
  process.exit(1);
}

console.log(
  `verify-sidebar-contract OK — SIDEBAR_ITEM_IDS has ${rawItems.length} items, insurance at index ${EXPECTED_INSURANCE_INDEX}, factoring at index ${EXPECTED_FACTORING_INDEX}.`
);
