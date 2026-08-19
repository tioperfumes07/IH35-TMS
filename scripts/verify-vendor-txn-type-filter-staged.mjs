#!/usr/bin/env node
/**
 * verify-vendor-txn-type-filter-staged
 * LV-VENDOR-TXN-FILTER-INLINE-NO-APPLY — Type must stage in txnFilters draft until Apply (not immediate setTypeFilter).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-vendor-txn-type-filter-staged";
const FILE = "apps/frontend/src/pages/Vendors.tsx";
const NEEDLES = [
  "value={txnFilters.draft.typeFilter}",
  "setTypeFilter(next.typeFilter)",
  "typeFilter,",
];

function assertFile(rel) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const missing = NEEDLES.filter((n) => !src.includes(n)).map((n) => `missing ${n}`);
  if (/onChange=\{\(event\) => setTypeFilter\(/.test(src)) {
    missing.push("immediate setTypeFilter onChange still present");
  }
  return missing;
}

function selftest() {
  const bad = `const [typeFilter, setTypeFilter] = useState("");
<SelectCombobox value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-vendor-txn-type-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-vendor-txn-type-selftest.tsx").length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-vendor-txn-type-selftest.tsx").length > 0) {
      console.error(`${LABEL} SELFTEST FAIL good`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (!fs.existsSync(path.join(process.cwd(), FILE))) {
  console.error(`${LABEL} FAIL: missing ${FILE}`);
  process.exit(1);
}
const errors = assertFile(FILE);
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — vendor txn Type stages until Apply`);
