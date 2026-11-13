#!/usr/bin/env node
/**
 * verify-safety-dq-calendar-cohort — ROUND 8.20 board24 / N24.
 * Driver Files matrix must:
 *   1. format expiry columns with formatCalendarDateUS (not formatDateUS) so midnight-UTC
 *      timestamps keep the stored calendar day (ROW 167 / profile parity);
 *   2. keep cohort in URL (?cohort=) so profile/register Back restores the filtered matrix.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-safety-dq-calendar-cohort";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/safety/components/DriverQualificationMatrix.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["DriverQualificationMatrix.tsx missing"];
  if (!/formatCalendarDateUS/.test(src)) f.push("missing formatCalendarDateUS import/use");
  if (/\bformatDateUS\s*\(/.test(src)) f.push("still calls formatDateUS (expiry must be calendar-only)");
  if (!/searchParams\.get\("cohort"\)/.test(src)) f.push("cohort is not read from URL");
  if (!/p\.set\("cohort"/.test(src)) f.push("cohort is not written to URL");
  if (!/useSearchParams/.test(src)) f.push("missing useSearchParams (URL SoT)");
  return f;
}

function selftest(live) {
  const cases = [
    ["no calendar formatter", live.replace(/formatCalendarDateUS/g, "formatDateUS")],
    ["no cohort read", live.replace(/searchParams\.get\("cohort"\)/g, 'searchParams.get("x")')],
    ["no cohort write", live.replace(/p\.set\("cohort"/g, 'p.set("x"')],
    ["file deleted", ""],
  ];
  let pass = check(live).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(live));
  for (const [name, src] of cases) {
    if (check(src).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const abs = path.join(ROOT, FILE);
const live = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
if (process.argv.includes("--selftest")) selftest(live);
else {
  const f = check(live);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — DQ matrix uses formatCalendarDateUS + ?cohort= URL SoT`);
}
