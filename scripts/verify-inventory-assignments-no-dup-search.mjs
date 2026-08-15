#!/usr/bin/env node
/**
 * LV-INVENTORY-ASSIGNMENTS-DUPLICATE-SEARCH
 * ParityTable hosts must not add a second search-shaped filterBar input.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkSource(src, label = "InventoryAssignmentsPage.tsx") {
  assert(src.includes("ParityTable"), `${label}: must use ParityTable`);
  assert(!/filterBar=\{/.test(src), `${label}: must not pass filterBar (duplicate search chrome)`);
  assert(
    !/aria-label=["']Search assignment trail["']/.test(src),
    `${label}: page-local Search assignment trail input forbidden`,
  );
  assert(
    !/const \[search,\s*setSearch\]/.test(src),
    `${label}: page-local search state forbidden — use ParityTable toolbar`,
  );
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  checkSource(good, "real");

  const bad = good.replace(
    /exportFilename="inventory-assignments"\n\s*\/>/,
    `exportFilename="inventory-assignments"
            filterBar={
              <input
                aria-label="Search assignment trail"
                value={search}
                onChange={() => undefined}
              />
            }
          />`,
  ).replace(
    "const rows = assignmentsQuery.data ?? [];",
    'const [search, setSearch] = useState("");\n  const rows = assignmentsQuery.data ?? [];',
  );

  let failed = false;
  try {
    checkSource(bad, "mut-dup-search");
  } catch {
    failed = true;
  }
  assert(failed, "selftest mut-dup-search: expected FAIL");
  console.log("verify-inventory-assignments-no-dup-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-inventory-assignments-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkSource(fs.readFileSync(TARGET, "utf8"));
    console.log("verify-inventory-assignments-no-dup-search PASS — single ParityTable search only");
  } catch (e) {
    console.error(`verify-inventory-assignments-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
