#!/usr/bin/env node
/** Generate BOTH real receipt SQL branches inside the strip's actual aggregate.
 * TypeScript transpilation is in-memory; never writes sources or database rows.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";
const RECEIPTS = "apps/backend/src/cash-flow/cash-flow-receipts.sql.ts";
function receiptFunction(receipts) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const source = file === path.resolve(RECEIPTS) ? receipts : fs.readFileSync(file, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = spec => {
      if (!spec.startsWith(".")) throw Error(`unexpected non-leaf dependency: ${spec}`);
      return load(path.resolve(path.dirname(file), spec.replace(/\.js$/, ".ts")));
    };
    new Function("require", "module", "exports", compiled)(localRequire, module, module.exports);
    return module.exports;
  }
  return load(RECEIPTS).cashFlowReceiptsSql;
}
function audit(source, receipts) {
  const failures = [];
  const template = source.match(/const incomeSubquery\s*=\s*(`[^`]*`);/)?.[1];
  if (!template || !template.includes("${cashFlowReceiptsSql(cashFollowsEta)}")) return ["strip must embed actual shared receipt SQL"];
  if (!source.includes("COALESCE(${incomeSubquery}, 0)::int AS income_cents")) failures.push("strip outer income wrapper missing");
  try {
    const helper = receiptFunction(receipts);
    for (const flag of [true, false]) {
      const fragment = new Function("cashFlowReceiptsSql", "cashFollowsEta", `return ${template}`)(helper, flag);
      if (!/^COALESCE\(\(SELECT SUM\(amount_cents\)/.test(fragment) || !/\),\s*0\)$/.test(fragment)) failures.push(`ETA=${flag}: aggregate must COALESCE SUM to zero`);
      const sql = `SELECT COALESCE(${fragment}, 0)::int AS income_cents`;
      if (sql.includes("${")) failures.push(`ETA=${flag}: unevaluated SQL templates`);
      const tokens = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/'(?:''|[^'])*'/g, "''");
      let depth = 0;
      for (const c of tokens) {
        if (c === "(") depth++;
        if (c === ")" && --depth < 0) { failures.push(`ETA=${flag}: premature closing parenthesis`); break; }
      }
      if (depth !== 0) failures.push(`ETA=${flag}: unbalanced SQL parentheses (${depth})`);
      for (const stream of ["unbilled_receipts", "proforma_receipts", "invoice_receipts"]) {
        if (!sql.includes(`SELECT * FROM ${stream}`)) failures.push(`ETA=${flag}: missing ${stream} aggregate source`);
      }
    }
  } catch (error) { failures.push(`could not generate SQL: ${error.message}`); }
  return failures;
}
const source = fs.readFileSync(FILE, "utf8"), receipts = fs.readFileSync(RECEIPTS, "utf8");
const failures = audit(source, receipts);
if (failures.length) throw Error(failures.join("\n"));
if (process.argv.includes("--selftest")) {
  const plants = [
    ["source", "= $2::date), 0)`;", "= $2::date), 0))`;"],
    ["source", "COALESCE((SELECT SUM(amount_cents)", "((SELECT SUM(amount_cents)"],
    ["receipts", 'projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })', 'projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" }) + ")"'],
    ["receipts", 'rawDeliveryDateSql("fd.scheduled_arrival_at")', 'rawDeliveryDateSql("fd.scheduled_arrival_at") + ")"'],
    ["receipts", "UNION ALL SELECT * FROM proforma_receipts", "UNION ALL SELECT * FROM unbilled_receipts"],
  ];
  for (const [key, from, to] of plants) {
    const values = { source, receipts };
    if (!values[key].includes(from)) throw Error(`inert mutation: ${from}`);
    values[key] = values[key].replace(from, to);
    if (!audit(values.source, values.receipts).length) throw Error(`escaped mutation: ${from}`);
  }
  console.log(`verify-cashflow-seven-day-strip-sql-balanced SELFTEST PASS ${plants.length}/${plants.length}`);
}
console.log("verify-cashflow-seven-day-strip-sql-balanced PASS — both generated SQL branches balanced and aggregate NULL-safe");
