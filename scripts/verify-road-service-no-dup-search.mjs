#!/usr/bin/env node
/**
 * LV-ROAD-SERVICE-DUPLICATE-SEARCH
 * RoadServiceList must not add a search-shaped filterBar alongside ParityTable toolbar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/maintenance/RoadServiceList.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkSource(src, label = "RoadServiceList.tsx") {
  assert(src.includes("ParityTable"), `${label}: must use ParityTable`);
  assert(!/filterBar=\{/.test(src), `${label}: must not pass filterBar (duplicate search chrome)`);
  assert(
    !/placeholder=["']Search ticket \/ unit \/ vendor \/ driver \/ location/.test(src),
    `${label}: page-local Search ticket input forbidden`,
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
      /exportFilename="road-service-tickets"\n\s*\/>/,
      `exportFilename="road-service-tickets"
        filterBar={
          <input
            placeholder="Search ticket / unit / vendor / driver / location…"
            value={search}
            onChange={() => undefined}
          />
        }
      />`,
    )
    .replace(
      "// Search is ONLY ParityTable UniversalListToolbar (LV-ROAD-SERVICE-DUPLICATE-SEARCH).",
      'const [search, setSearch] = useState("");\n  // Search is ONLY ParityTable UniversalListToolbar (LV-ROAD-SERVICE-DUPLICATE-SEARCH).',
    );

  let failed = false;
  try {
    checkSource(bad, "mut-dup-search");
  } catch {
    failed = true;
  }
  assert(failed, "selftest mut-dup-search: expected FAIL");
  console.log("verify-road-service-no-dup-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-road-service-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkSource(fs.readFileSync(TARGET, "utf8"));
    console.log("verify-road-service-no-dup-search PASS — single ParityTable search only");
  } catch (e) {
    console.error(`verify-road-service-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
