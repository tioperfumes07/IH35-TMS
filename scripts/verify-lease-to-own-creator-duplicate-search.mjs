#!/usr/bin/env node
/**
 * LEG-F3502 — LeaseToOwnCreatorModal fleet picker must not mount page-local free-text
 * search; ParityTable toolbar owns search.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "LeaseToOwnCreatorModal: must use ParityTable");
  assert(!/\[search,\s*setSearch\]/.test(src), "LeaseToOwnCreatorModal: must not keep page-local unit search state");
  assert(!/Search unit #, VIN/.test(src), "LeaseToOwnCreatorModal: must not mount page-local unit search input");
  assert(!/filteredUnits/.test(src), "LeaseToOwnCreatorModal: must not keep filteredUnits helper");
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it
// to a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  let failed = false;
  await withMutatedCopy(
    realPath,
    (good) => {
  const bad =
    good.replace(/const \[selected/, `const [search, setSearch] = useState("");\n  const [selected`) +
    `\n<input placeholder="Search unit #, VIN, make, model…" value={search} />\nconst filteredUnits = units;\n`;
      return bad;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL with page-local search restored");
  console.log("verify-lease-to-own-creator-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    await selftest();
  } catch (e) {
    console.error(`verify-lease-to-own-creator-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log("verify-lease-to-own-creator-duplicate-search PASS — LeaseToOwn ParityTable-owned search");
  } catch (e) {
    console.error(`verify-lease-to-own-creator-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
