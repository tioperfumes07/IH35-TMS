#!/usr/bin/env node
/**
 * verify-sidebar-contract.mjs
 * CI guard: asserts SIDEBAR_ITEM_IDS in sidebar-config.ts matches the locked current array.
 * Fails with a descriptive error if length, specific indexes, full order, or additive ids drift.
 *
 * Last updated: SIDEBAR-V2-REORG-25 (25-item Owner default; drv_app removed from top rail;
 *   tasks/finance/inventory/cash-flow added; eld→cash-flow→accounting adjacency enforced).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const sidebarPath = path.join(
  ROOT,
  "apps/frontend/src/components/layout/sidebar-config.ts"
);

/** Locked Owner-default sidebar order — SIDEBAR-V3-SETTLEMENTS-26 (26 items). */
const LOCKED_ORDER = [
  "home",
  "tasks",
  "fuel",
  "dispatch",
  "driver-hub",
  "maintenance",
  "safety",
  "drivers",
  "insurance",
  "legal",
  "eld",
  "cash-flow",
  "settlements",
  "accounting",
  "bank",
  "factoring",
  "finance",
  "customers",
  "vendors",
  "inventory",
  "form_425",
  "lists",
  "reports",
  "docs",
  "users",
  "help",
];

/** All ids are shipped — nothing pending. */
const PENDING_IDS = new Set([]);

const EXPECTED_LENGTH = LOCKED_ORDER.length;
const EXPECTED_INSURANCE_INDEX = LOCKED_ORDER.indexOf("insurance");
const EXPECTED_FACTORING_INDEX = LOCKED_ORDER.indexOf("factoring");

const src = fs.readFileSync(sidebarPath, "utf8");

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
const rawSet = new Set(rawItems);

if (rawItems.length !== EXPECTED_LENGTH) {
  errors.push(
    `length mismatch: found ${rawItems.length}, expected ${EXPECTED_LENGTH}`
  );
}

if (rawItems[EXPECTED_INSURANCE_INDEX] !== "insurance") {
  errors.push(
    `index ${EXPECTED_INSURANCE_INDEX} mismatch: found "${rawItems[EXPECTED_INSURANCE_INDEX]}", expected "insurance"`
  );
}

if (rawItems[EXPECTED_FACTORING_INDEX] !== "factoring") {
  errors.push(
    `index ${EXPECTED_FACTORING_INDEX} mismatch: found "${rawItems[EXPECTED_FACTORING_INDEX]}", expected "factoring"`
  );
}

for (let i = 0; i < LOCKED_ORDER.length; i++) {
  if (rawItems[i] !== LOCKED_ORDER[i]) {
    errors.push(
      `position ${i} mismatch: found "${rawItems[i]}", expected "${LOCKED_ORDER[i]}"`
    );
  }
}

if (rawItems.length > LOCKED_ORDER.length) {
  for (let i = LOCKED_ORDER.length; i < rawItems.length; i++) {
    errors.push(`unexpected extra item at position ${i}: "${rawItems[i]}"`);
  }
}

for (const id of LOCKED_ORDER) {
  if (PENDING_IDS.has(id)) continue;
  if (!rawSet.has(id)) {
    errors.push(
      `additive-only violation: locked id "${id}" is missing from SIDEBAR_ITEM_IDS (never remove locked sidebar entries)`
    );
  }
}

if (!PENDING_IDS.has("cash-flow") && rawSet.has("cash-flow")) {
  const eldIdx = rawItems.indexOf("eld");
  const cashFlowIdx = rawItems.indexOf("cash-flow");
  const settlementsIdx = rawItems.indexOf("settlements");
  const accountingIdx = rawItems.indexOf("accounting");
  if (eldIdx === -1 || cashFlowIdx === -1 || settlementsIdx === -1 || accountingIdx === -1) {
    errors.push("cash-flow position: eld, cash-flow, settlements, and accounting must all be present");
  } else if (cashFlowIdx !== eldIdx + 1 || settlementsIdx !== cashFlowIdx + 1 || accountingIdx !== settlementsIdx + 1) {
    errors.push(
      `cash-flow position: expected eld → cash-flow → settlements → accounting; found eld@${eldIdx}, cash-flow@${cashFlowIdx}, settlements@${settlementsIdx}, accounting@${accountingIdx}`
    );
  }
}

if (errors.length > 0) {
  console.error(
    `verify-sidebar-contract FAIL — SIDEBAR_ITEM_IDS has drifted from the locked ${EXPECTED_LENGTH}-item array:`
  );
  for (const e of errors) {
    console.error(`  • ${e}`);
  }
  console.error("\nLocked array: " + JSON.stringify(LOCKED_ORDER));
  console.error("Found array:  " + JSON.stringify(rawItems));
  process.exit(1);
}

console.log(
  `verify-sidebar-contract OK — SIDEBAR_ITEM_IDS has ${rawItems.length} items, insurance at index ${EXPECTED_INSURANCE_INDEX}, factoring at index ${EXPECTED_FACTORING_INDEX}.`
);
console.log(
  `  additive check: ${LOCKED_ORDER.length - PENDING_IDS.size}/${LOCKED_ORDER.length} locked ids present (${PENDING_IDS.size} pending: ${[...PENDING_IDS].join(", ")})`
);
