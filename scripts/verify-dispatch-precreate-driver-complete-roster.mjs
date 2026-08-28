#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","drivers"],"cols":["driver","connectivity","reverse_link","picker_law"],"leaves":["book_load.wizard","assign_driver_dropdown"],"task":"DSP-F6930-PRECREATE-DRIVER-FAKE-SEARCH-CAP","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = path.join(root, "apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx");
const source = fs.readFileSync(file, "utf8");

function failures(text) {
  const found = [];
  if (!text.includes('import { listAllDrivers } from "../../api/mdata"')) found.push("canonical exhaustive driver helper is not imported");
  if (!text.includes('listAllDrivers({ operating_company_id: operatingCompanyId, status: "Active" })')) found.push("pre-create query does not read the complete scoped active roster");
  if (text.includes("ROSTER_LIMIT") || text.includes("Type to search for a driver that is not listed.")) found.push("fake local-search cap/disclosure remains");
  if (!text.includes('allowAddNew={{') || !text.includes('label: "+ Create driver"')) found.push("canonical nested driver creator is missing");
  if (!text.includes('data-testid="assign-driver-selected-entitylink"')) found.push("selected driver forward drill is missing");
  return found;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("listAllDrivers({", "listDrivers({ limit: 200,"),
    source.replace('status: "Active"', 'status: "All"'),
    source.replace('label: "+ Create driver"', 'label: "Create"'),
    source.replace('data-testid="assign-driver-selected-entitylink"', 'data-testid="removed"'),
  ];
  const missed = mutations.filter((mutation) => failures(mutation).length === 0);
  if (missed.length) {
    console.error(`FAIL: selftest missed ${missed.length} pre-create driver regressions`);
    process.exit(1);
  }
  console.log(`PASS: selftest caught ${mutations.length} pre-create driver regressions`);
  process.exit(0);
}

const found = failures(source);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("PASS: pre-create dispatch assignment reads the complete scoped driver roster");
