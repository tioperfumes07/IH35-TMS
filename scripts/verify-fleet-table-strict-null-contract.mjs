#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function problems(source) {
  const found = [];
  // LEAD 443.181 — the roster renders on ParityTable: its columns are mapped straight off the registry (never a
  // key lookup that can yield undefined); ParityTable owns order/visibility.
  if (!/const parityColumns: ParityColumn<FleetRow>\[\] = columns\.map\(\(column\) =>/.test(source) || /byKey\.get\(/.test(source)) {
    found.push("Fleet ParityTable columns must map straight off the column registry (no lookup that can yield undefined)");
  }
  if (/\{false && \(<\>/.test(source)) {
    found.push("dead fixed-order Fleet cells must not retain nullable field expressions");
  }
  return found;
}

function selftest() {
  const good = "const parityColumns: ParityColumn<FleetRow>[] = columns.map((column) => ({";
  if (problems(good).length) throw new Error("good fixture failed");
  const mutations = [
    `${good}\nconst x = byKey.get(key);`,
    `${good}\n{false && (<>legacy</>)}`,
  ];
  for (const source of mutations) {
    if (!problems(source).length) throw new Error("planted strict-null mutation escaped");
  }
  console.log("verify-fleet-table-strict-null-contract: selftest PASS 2/2");
}

function check() {
  const source = fs.readFileSync(
    path.join(ROOT, "apps/frontend/src/components/FleetTable.tsx"),
    "utf8",
  );
  const found = problems(source);
  if (found.length) throw new Error(found.join("; "));
  console.log("verify-fleet-table-strict-null-contract: PASS");
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else check();
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}
