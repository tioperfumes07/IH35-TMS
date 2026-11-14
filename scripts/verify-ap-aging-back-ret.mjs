#!/usr/bin/env node
/**
 * verify-ap-aging-back-ret — ROUND 8.20 board25/10.
 * A/P aging Back must resolveBackHref so Vendors/Reports ret restores origin.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-ap-aging-back-ret";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/reports/APAgingPage.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["APAgingPage.tsx missing"];
  if (!/resolveBackHref/.test(src)) f.push("must import/use resolveBackHref");
  if (!/backHref=\{reportsBackHref\}/.test(src)) f.push("backHref must be reportsBackHref");
  if (/backHref="\/reports"/.test(src)) f.push("still hardcodes backHref=/reports");
  return f;
}

function selftest(src) {
  const cases = [
    ["bare", src.replace(/backHref=\{reportsBackHref\}/, 'backHref="/reports"')],
    ["no resolve", src.replace(/resolveBackHref/g, "resolveX")],
    ["missing", ""],
  ];
  let pass = check(src).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(src));
  for (const [name, s] of cases) {
    if (check(s).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const src = fs.existsSync(path.join(ROOT, PAGE)) ? fs.readFileSync(path.join(ROOT, PAGE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — A/P aging Back resolves ret`);
}
