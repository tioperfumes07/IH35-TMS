#!/usr/bin/env node
/**
 * RPT-F3488 — ProfitPerTruckPage must not mount page-local free-text search;
 * ParityTable toolbar owns search. Flag filter may remain page-local.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/reports/ProfitPerTruckPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "ProfitPerTruckPage: must use ParityTable");
  assert(!/\[search,\s*setSearch\]/.test(src), "ProfitPerTruckPage: must not keep page-local search state");
  assert(!/Search truck\/driver/.test(src), "ProfitPerTruckPage: must not mount Search truck/driver input");
  assert(/flagFilter/.test(src), "ProfitPerTruckPage: must keep flag filter");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad =
    good.replace(
      /const \[flagFilter/,
      `const [search, setSearch] = useState("");\n  const [flagFilter`,
    ) +
    `\n<label>Search truck/driver<input value={search} onChange={() => {}} /></label>\n`;
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL with page-local search restored");
  console.log("verify-profit-per-truck-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-profit-per-truck-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log("verify-profit-per-truck-duplicate-search PASS — ProfitPerTruck ParityTable-owned search");
  } catch (e) {
    console.error(`verify-profit-per-truck-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
