#!/usr/bin/env node
/**
 * WAVE 2 maintenance money — Box 3 Built for `parts_inventory.record_purchase` × `gl_je`.
 *
 * @matrix-built {"modules":["maintenance"],"cols":["gl_je"],"task":"WAVE2-MAINT-PARTS-PURCHASE-GL-BUILT","vertical":"column-wave","leafRe":"^parts_inventory\\.record_purchase$"}
 *
 * LINK-F5186 already did this work: the backend returns gl_posting on every parts-purchase create,
 * and PartsInventoryTable.tsx surfaces it (posted + journal_entry_id) with a reverse EntityLink to
 * the created journal entry — the wiring was real, only the Box-3 credit was never claimed.
 *
 * Self-test: node scripts/verify-parts-inventory-record-purchase-gl-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-parts-inventory-record-purchase-gl-wired";

const CHECKS = [
  {
    name: "PartsInventoryTable renders the purchase's gl_posting result (depth, not just success/fail)",
    file: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
    pattern: /lastGlPosting\.posted\s*&&\s*lastGlPosting\.journal_entry_id/,
  },
  {
    name: "the GL result drills via EntityLink kind=\"journal_entry\" (reverse nav)",
    file: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
    pattern: /<EntityLink[\s\S]{0,60}kind="journal_entry"[\s\S]{0,60}id=\{lastGlPosting\.journal_entry_id\}/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx": `
      {lastGlPosting.posted && lastGlPosting.journal_entry_id ? (
        <EntityLink
          kind="journal_entry"
          id={lastGlPosting.journal_entry_id}
          label="View journal entry →"
        />
      ) : null}
    `,
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — parts-purchase GL posting result + reverse journal_entry EntityLink present`);
