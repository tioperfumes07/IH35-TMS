#!/usr/bin/env node
/**
 * LEAD 443.184 item 2 — BILL PROVENANCE. Measured on prod USMCA before this step: 159 of 159 bills had source NULL and 0
 * carried linked_work_order_uuid (all 157 live bills are driver bills). No bill writer stamped source.
 *   1. insertBillHeaderOnClient (the one bill header INSERT) refuses a bill whose source is not in BILL_SOURCES.
 *   2. createBillRowInClientTx writes input.source; CreateBillInput.source is required.
 *   3. Every backend call of createBill / createBillInClientTx / writeBillDocumentOnClient / insertBillHeaderOnClient
 *      names its source within the call.
 *   4. The work-order bill writers carry linked_work_order_uuid.
 * --selftest plants each regression.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ENGINE = "apps/backend/src/accounting/bills.service.ts";
const WO = ["apps/backend/src/maintenance/two-section-service.ts", "apps/backend/src/accounting/maintenance-posting/poster.service.ts"];

function backendFiles(dir = resolve(ROOT, "apps/backend/src"), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") backendFiles(abs, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(abs);
  }
  return out;
}

export function check(files = backendFiles().map((a) => [relative(ROOT, a), readFileSync(a, "utf8")])) {
  const p = [];
  const engine = files.find(([r]) => r === ENGINE)?.[1] ?? "";
  if (!/if \(!\(BILL_SOURCES as readonly unknown\[\]\)\.includes\(sourceValue\)\) throw new BillSourceRequiredError\(sourceValue\);/.test(engine))
    p.push(`${ENGINE}: insertBillHeaderOnClient must refuse a bill without a known source (1)`);
  if (!/\["source", \{ value: input\.source \}\],/.test(engine) || !/\n  source: BillSource;/.test(engine)) p.push(`${ENGINE}: createBillRowInClientTx must write a required input.source (2)`);
  for (const [rel, raw] of files) {
    if (rel === ENGINE) continue;
    // comments name these functions too — scan code only (line numbers kept: comment text is blanked, not removed)
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
    const re = /\b(createBill|createBillInClientTx|writeBillDocumentOnClient|insertBillHeaderOnClient)\s*(<[^>]*>)?\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 30), m.index);
      if (/function\s+$|import[^;]*$/.test(before)) continue;
      const window = src.slice(m.index, m.index + 2500);
      if (!/\bsource: "[a-z_]+"|\["source", \{ value: "[a-z_]+" \}\]/.test(window)) {
        const line = src.slice(0, m.index).split("\n").length;
        p.push(`${rel}:${line}: ${m[1]}(…) names no bill source (3)`);
      }
    }
  }
  for (const rel of WO) {
    const src = files.find(([r]) => r === rel)?.[1] ?? "";
    if (!/\["linked_work_order_uuid", \{ value:/.test(src)) p.push(`${rel}: a work-order bill must carry linked_work_order_uuid (4)`);
  }
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const files = backendFiles().map((a) => [relative(ROOT, a), readFileSync(a, "utf8")]);
  const base = check(files);
  if (base.length) {
    console.error("SELFTEST FAIL: baseline not clean", base);
    process.exit(1);
  }
  const swap = (rel, fn) => files.map(([r, s]) => [r, r === rel ? fn(s) : s]);
  const plants = [
    ["engine stops refusing", swap(ENGINE, (s) => s.replace("throw new BillSourceRequiredError(sourceValue);", "void 0;"))],
    ["new writer without source", [...files, ["apps/backend/src/x.ts", "const b = await createBillInClientTx(client, {\n  operatingCompanyId: co,\n  vendorId: v,\n});\n"]]],
    ["WO link dropped", swap(WO[0], (s) => s.replaceAll('["linked_work_order_uuid", { value:', '["x_wo", { value:'))],
  ];
  for (const [n, f] of plants) {
    if (!check(f).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-every-bill-writer-stamps-source FAIL (${p.length}):`);
    for (const x of p) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log("verify-every-bill-writer-stamps-source PASS: the one bill header INSERT refuses a bill without its writer; every writer names it (443.184)");
}
