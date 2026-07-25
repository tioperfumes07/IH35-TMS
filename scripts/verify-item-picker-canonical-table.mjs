#!/usr/bin/env node
/**
 * GUARD (LST-PICKER-02): an item picker must READ the same canonical table the inline create WRITES.
 *
 * ROOT CAUSE it exists for: the WO/Bill item picker read `mdata.qbo_items` (the QBO mirror) while the
 * inline "+ Add new item" quick-create wrote `catalogs.items` (canonical). An item created from the
 * picker was invisible in that same picker after reload — VERIFY-2 clause 5, "writes the same
 * canonical table the picker reads". The mirror is also known-stale (memory: qbo-live-parity-ground-truth).
 *
 * Substance, not shape: this asserts the actual FROM clause of the picker endpoints, and that the
 * create path still targets catalogs.items — so the pair can never drift apart again.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-item-picker-canonical-table";

const READERS = [
  "apps/backend/src/accounting/items.routes.ts",
  "apps/backend/src/maintenance/wo-cost-context.routes.ts",
];
const CREATOR = "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx";

/** Strip comments so a comment naming the mirror (to explain the fix) is not a violation. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

export function assertItemPicker(readerSources, creatorSource) {
  const problems = [];

  for (const [rel, src] of Object.entries(readerSources)) {
    const c = code(src);
    // The item query must come FROM the canonical catalog.
    if (/FROM\s+mdata\.qbo_items\b/i.test(c)) {
      problems.push(
        `${rel}: item picker reads FROM mdata.qbo_items (the QBO MIRROR). It must read ` +
          `catalogs.items — the same canonical table the inline create writes, or a created item is ` +
          `invisible in the picker that created it. See DEFINITION-OF-DONE.md VERIFY-2 clause 5.`
      );
    }
    if (!/FROM\s+catalogs\.items\b/i.test(c)) {
      problems.push(`${rel}: no "FROM catalogs.items" item query found — did the picker query move?`);
    }
  }

  if (creatorSource !== null) {
    const cc = code(creatorSource);
    // The create path must still target the canonical items catalog.
    if (!/itemsCatalogClient|catalogs\.items|\/catalogs\/accounting\/items/i.test(cc)) {
      problems.push(
        `${CREATOR}: the item quick-create no longer targets the canonical items catalog. ` +
          `If the create moves, the readers above must move with it — that pairing IS the guard.`
      );
    }
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (IS_MAIN && process.argv.includes("--selftest")) {
  const failures = [];
  const real = Object.fromEntries(READERS.map((r) => [r, read(r)]));
  const realCreator = read(CREATOR);

  const mutate = (name, rel, fn, needle) => {
    const mutated = { ...real, [rel]: fn(real[rel]) };
    if (mutated[rel] === real[rel]) {
      failures.push(`${name}: mutation did not change ${rel} — INERT case, fix the mutation`);
      return;
    }
    if (!assertItemPicker(mutated, realCreator).some((p) => p.includes(needle))) {
      failures.push(`${name}: planted defect NOT caught (expected "${needle}")`);
    }
  };

  // Regress each reader back to the mirror — the exact pre-fix defect.
  for (const rel of READERS) {
    mutate(`regress-to-mirror:${rel}`, rel, (s) => s.replace(/FROM\s+catalogs\.items\b/i, "FROM mdata.qbo_items"), "QBO MIRROR");
  }
  // Remove the query entirely.
  mutate("query-removed", READERS[0], (s) => s.replace(/FROM\s+catalogs\.items\b/i, "FROM some_other.table"), "no \"FROM catalogs.items\"");
  // Creator drifting away from the canonical catalog must also fail.
  {
    const brokenCreator = realCreator.replace(/itemsCatalogClient/g, "someOtherClient");
    if (brokenCreator === realCreator) {
      failures.push("creator-drift: mutation did not change the creator — INERT case");
    } else if (!assertItemPicker(real, brokenCreator).some((p) => p.includes("no longer targets the canonical"))) {
      failures.push("creator-drift: planted defect NOT caught");
    }
  }
  // The corrected shape must NOT be flagged (comments naming the mirror are legitimate).
  const clean = assertItemPicker(real, realCreator);
  if (clean.length) failures.push(`false positive on the fixed source: ${clean.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 defects planted in REAL source caught; fixed source not flagged`);
  process.exit(0);
}

if (IS_MAIN) {
  for (const rel of [...READERS, CREATOR]) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      console.error(`${LABEL} FAILED — ${rel} is missing`);
      process.exit(1);
    }
  }
  const problems = assertItemPicker(Object.fromEntries(READERS.map((r) => [r, read(r)])), read(CREATOR));
  if (problems.length) {
    console.error(`${LABEL} FAILED — item picker does not read the table the create writes:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — item pickers read catalogs.items, the same canonical table the inline create writes`);
}
