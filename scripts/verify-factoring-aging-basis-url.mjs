#!/usr/bin/env node
/**
 * verify-factoring-aging-basis-url — ROUND 8.20 board18.
 * Aging Invoice/Purchase/Fund Date toggle must persist in ?aging_basis= URL SoT.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-factoring-aging-basis-url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const BASIS = "apps/frontend/src/pages/factoring/agingDateBasis.ts";

export function check(home, basis) {
  const f = [];
  if (!home) f.push("FactoringHome.tsx missing");
  if (!basis) f.push("agingDateBasis.ts missing");
  if (!basis) return f;
  if (!/export function parseAgingDateBasisParam/.test(basis) || !/export function buildAgingDateBasisParam/.test(basis)) {
    f.push("URL helpers missing in agingDateBasis.ts");
  }
  if (!home) return f;
  if (!/parseAgingDateBasisParam\(searchParams\.get\("aging_basis"\)\)/.test(home)) {
    f.push("FactoringHome does not read aging_basis from URL");
  }
  if (/useState<AgingDateBasis>\("fund"\)/.test(home)) {
    f.push("agingDateBasis still local useState only");
  }
  if (!/p\.set\("aging_basis"/.test(home)) {
    f.push("FactoringHome does not write aging_basis to URL");
  }
  return f;
}

function selftest(liveHome, liveBasis) {
  const cases = [
    ["local state", liveHome.replace(/parseAgingDateBasisParam\(searchParams\.get\("aging_basis"\)\)/, '"fund" as AgingDateBasis').replace(/p\.set\("aging_basis"/g, 'p.set("x"')],
    ["no helpers", liveBasis.replace(/export function parseAgingDateBasisParam[\s\S]*?\n\}/, "")],
    ["file deleted", "", ""],
  ];
  let pass = check(liveHome, liveBasis).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(liveHome, liveBasis));
  for (const [name, h, b] of cases) {
    const home = h === undefined ? liveHome : h;
    const basis = b === undefined ? liveBasis : b === "" && name === "file deleted" ? "" : b || liveBasis;
    if (check(home, basis).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const home = fs.existsSync(path.join(ROOT, HOME)) ? fs.readFileSync(path.join(ROOT, HOME), "utf8") : "";
const basis = fs.existsSync(path.join(ROOT, BASIS)) ? fs.readFileSync(path.join(ROOT, BASIS), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(home, basis);
else {
  const f = check(home, basis);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Factoring aging_basis is URL SoT`);
}
