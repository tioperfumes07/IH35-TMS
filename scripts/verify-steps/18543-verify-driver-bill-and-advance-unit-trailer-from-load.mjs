#!/usr/bin/env node
/**
 * LEAD 443.183 G9 — a driver bill and a cash advance carry the truck and trailer OF THEIR LOAD, and an advance's overflow loan
 * is kept with the Settlement Creator post and voided on Edit.
 *
 *   (a) every writer that INSERTs driver_finance.driver_bills calls restampDriverBillUnitAndTrailer (the one rule:
 *       driver-finance/driver-bill-unit-trailer.ts — unit = the load's assigned unit, trailer = the load's company or
 *       customer trailer, never both).
 *   (b) cash-advances/cash-advance-create.ts takes unit / trailer from the load and refuses a request naming another one.
 *   (c) the Settlement Creator keeps the overflow loan id (overflow_loan_ids) and Edit reverses it with the advances.
 *
 * --selftest plants each regression; --against-main runs on origin/main's copies (red before 443.183 G9).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = "apps/backend/src";
const CA = `${SRC}/cash-advances/cash-advance-create.ts`;
const SC = `${SRC}/driver-finance/settlement-creator.service.ts`;

function backendFiles(dir = resolve(ROOT, SRC), out = []) {
  for (const n of readdirSync(dir)) {
    const a = join(dir, n);
    if (statSync(a).isDirectory()) { if (n !== "__tests__" && n !== "node_modules") backendFiles(a, out); }
    else if (n.endsWith(".ts") && !n.endsWith(".test.ts")) out.push(relative(ROOT, a));
  }
  return out;
}

export function check(files) {
  const out = [];
  for (const [rel, src] of Object.entries(files)) {
    if (/INSERT INTO driver_finance\.driver_bills\b/.test(src) && !/restampDriverBillUnitAndTrailer\(/.test(src)) {
      out.push(`${rel}: writes driver_finance.driver_bills without restampDriverBillUnitAndTrailer — the bill must carry its load's unit + trailer (a)`);
    }
  }
  const ca = files[CA] ?? "";
  if (!/advance_unit_differs_from_load/.test(ca) || !/unit_id:\s*load\.assigned_unit_id/.test(ca)) out.push(`${CA}: the advance does not take its unit from the load (b)`);
  if (!/advance_trailer_differs_from_load/.test(ca) || !/trailer_id:\s*load\.company_trailer_id/.test(ca)) out.push(`${CA}: the advance does not take its trailer from the load (b)`);
  const sc = files[SC] ?? "";
  if (!/overflowLoanIds\.push\(/.test(sc) || !/overflow_loan_ids:\s*overflowLoanIds/.test(sc)) out.push(`${SC}: the overflow loan id is not kept with the post (c)`);
  if (!/for \(const advanceId of advanceIdsUndoneOnEdit\(prior\)\)/.test(sc) || !/prior\.overflow_loan_ids/.test(sc)) out.push(`${SC}: Edit does not reverse the overflow loan (c)`);
  return out;
}

function load(fromMain) {
  const files = {};
  const list = fromMain
    ? spawnSync("git", ["ls-tree", "-r", "--name-only", "origin/main", SRC], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).stdout
        .split("\n").filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.includes("/__tests__/"))
    : backendFiles();
  for (const rel of list) {
    if (fromMain) {
      const r = spawnSync("git", ["show", `origin/main:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
      if (r.status === 0 && (/driver_finance\.driver_bills/.test(r.stdout) || rel === CA || rel === SC)) files[rel] = r.stdout;
    } else if (existsSync(resolve(ROOT, rel))) {
      const src = readFileSync(resolve(ROOT, rel), "utf8");
      if (/driver_finance\.driver_bills/.test(src) || rel === CA || rel === SC) files[rel] = src;
    }
  }
  return files;
}

if (process.argv.includes("--selftest")) {
  const files = load(false);
  const base = check(files);
  if (base.length) { console.error("SELFTEST FAIL: baseline not clean", base); process.exit(1); }
  const edit = (rel, a, b) => ({ ...files, [rel]: files[rel].replace(a, b) });
  const plants = [
    ["new bill writer without the stamp", { ...files, [`${SRC}/x.ts`]: "q(`INSERT INTO driver_finance.driver_bills (id) VALUES ($1)`)" }],
    ["advance unit from the body", edit(CA, /unit_id:\s*load\.assigned_unit_id/, "unit_id: body.unit_id")],
    ["advance trailer refusal dropped", edit(CA, /advance_trailer_differs_from_load/g, "x")],
    ["overflow loan not kept", edit(SC, /overflowLoanIds\.push\(/, "void (")],
    ["Edit skips the overflow loan", edit(SC, /for \(const advanceId of advanceIdsUndoneOnEdit\(prior\)\)/, "for (const advanceId of prior.advance_ids ?? [])")],
  ];
  for (const [name, f] of plants) if (!check(f).length) { console.error(`SELFTEST FAIL: plant "${name}" not caught`); process.exit(1); }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const findings = check(load(process.argv.includes("--against-main")));
if (findings.length) {
  console.error(`verify-driver-bill-and-advance-unit-trailer-from-load FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-driver-bill-and-advance-unit-trailer-from-load PASS — every driver-bill writer stamps the load's unit + trailer; the advance takes them from the load; the overflow loan is kept and voided on Edit");
