#!/usr/bin/env node
/**
 * verify-vendor-ap-aging-money-cells — ROUND 8.20 board10.
 * Vendor profile AP aging open amounts must be MoneyCell drills (not plain formatUsdCents).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-vendor-ap-aging-money-cells";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/vendors/VendorApAgingSection.tsx";

export function check(src) {
  const f = [];
  if (!src) {
    f.push("VendorApAgingSection.tsx missing");
    return f;
  }
  if (!/MoneyCell/.test(src)) {
    f.push("MoneyCell not imported/used");
  }
  if (/formatUsdCents\(bill\.open_cents\)/.test(src)) {
    f.push("open_cents still plain formatUsdCents");
  }
  if (!/drill=\{\{\s*entity:\s*\{\s*kind:\s*"bill"/.test(src)) {
    f.push("per-bill open amount must MoneyCell→bill");
  }
  if (!/target:\s*"bills"/.test(src) || !/hasBalance:\s*true/.test(src)) {
    f.push("cleared total must AmountLink bills hasBalance for vendor");
  }
  return f;
}

function selftest(live) {
  const cases = [
    ["plain open", live.replace(/<MoneyCell[\s\S]*?open[\s\S]*?\/>/, "{formatUsdCents(bill.open_cents)} open")],
    ["no MoneyCell", live.replace(/MoneyCell/g, "PlainMoney")],
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

const src = fs.existsSync(path.join(ROOT, FILE)) ? fs.readFileSync(path.join(ROOT, FILE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — vendor AP aging amounts are MoneyCells`);
}
