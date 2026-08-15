#!/usr/bin/env node
/**
 * LV-SEVERE-REPAIR-OOS-DUPLICATE-SEARCH
 * SevereRepairOosTab must not add a search-shaped filterBar alongside ParityTable toolbar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkSource(src, label = "SevereRepairOosTab.tsx") {
  assert(src.includes("ParityTable"), `${label}: must use ParityTable`);
  assert(!/filterBar=\{/.test(src), `${label}: must not pass filterBar (duplicate search chrome)`);
  assert(
    !/placeholder=["']Search unit \/ issue \/ location \/ severity/.test(src),
    `${label}: page-local Search unit/issue input forbidden`,
  );
  assert(
    !/const \[search,\s*setSearch\]/.test(src),
    `${label}: page-local search state forbidden — use ParityTable toolbar`,
  );
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  checkSource(good, "real");

  const bad = good
    .replace(
      /rowActions=\{rowActions\}\n\s*\/>/,
      `rowActions={rowActions}
        filterBar={
          <input
            placeholder="Search unit / issue / location / severity…"
            value={search}
            onChange={() => undefined}
          />
        }
      />`,
    )
    .replace(
      "// Search is ONLY ParityTable UniversalListToolbar (LV-SEVERE-REPAIR-OOS-DUPLICATE-SEARCH).",
      'const [search, setSearch] = useState("");\n  // Search is ONLY ParityTable UniversalListToolbar (LV-SEVERE-REPAIR-OOS-DUPLICATE-SEARCH).',
    );

  let failed = false;
  try {
    checkSource(bad, "mut-dup-search");
  } catch {
    failed = true;
  }
  assert(failed, "selftest mut-dup-search: expected FAIL");
  console.log("verify-severe-repair-oos-no-dup-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-severe-repair-oos-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkSource(fs.readFileSync(TARGET, "utf8"));
    console.log("verify-severe-repair-oos-no-dup-search PASS — single ParityTable search only");
  } catch (e) {
    console.error(`verify-severe-repair-oos-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
