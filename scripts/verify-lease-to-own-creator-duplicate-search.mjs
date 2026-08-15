#!/usr/bin/env node
/**
 * LEG-F3502 — LeaseToOwnCreatorModal fleet picker must not mount page-local free-text
 * search; ParityTable toolbar owns search.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "LeaseToOwnCreatorModal: must use ParityTable");
  assert(!/\[search,\s*setSearch\]/.test(src), "LeaseToOwnCreatorModal: must not keep page-local unit search state");
  assert(!/Search unit #, VIN/.test(src), "LeaseToOwnCreatorModal: must not mount page-local unit search input");
  assert(!/filteredUnits/.test(src), "LeaseToOwnCreatorModal: must not keep filteredUnits helper");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad =
    good.replace(/const \[selected/, `const [search, setSearch] = useState("");\n  const [selected`) +
    `\n<input placeholder="Search unit #, VIN, make, model…" value={search} />\nconst filteredUnits = units;\n`;
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL with page-local search restored");
  console.log("verify-lease-to-own-creator-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
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
