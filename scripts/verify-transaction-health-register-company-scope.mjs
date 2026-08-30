#!/usr/bin/env node
/** SYS-F7441 — company-scope the Transaction Health register's correlated GL checks. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/system/transaction-health.service.ts";
const source = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const anchors = [
  ["invoice posting", "p.operating_company_id = i.operating_company_id"],
  ["bill posting", "p.operating_company_id = b.operating_company_id"],
  ["bill-payment posting", "p.operating_company_id = bp.operating_company_id"],
  ["customer-payment posting", "p.operating_company_id = py.operating_company_id"],
  ["posting JE company", "je.operating_company_id = p.operating_company_id"],
  ["expense JE company", "je.operating_company_id = e.operating_company_id"],
  ["factoring advance company", "fa.operating_company_id = fi.operating_company_id"],
  ["factoring posting company", "p.operating_company_id = fa.operating_company_id"],
  ["factoring JE company", "jje.operating_company_id = p.operating_company_id"],
  ["factoring invoice company", "fi.operating_company_id = fb.operating_company_id"],
  ["settlement bill company", "sb.operating_company_id = s.operating_company_id"],
  ["settlement posting company", "p.operating_company_id = sb.operating_company_id"],
  ["settlement JE company", "sje.operating_company_id = p.operating_company_id"],
  ["invoice source company", "i.operating_company_id = ANY ($1::uuid[])"],
  ["bill source company", "b.operating_company_id = ANY ($1::uuid[])"],
  ["bill-payment source company", "bp.operating_company_id = ANY ($1::uuid[])"],
  ["customer-payment source company", "py.operating_company_id = ANY ($1::uuid[])"],
  ["expense source company", "e.operating_company_id = ANY ($1::uuid[])"],
  ["JE source company", "je.operating_company_id = ANY ($1::uuid[])"],
  ["factoring source company", "fb.operating_company_id = ANY ($1::uuid[])"],
  ["settlement source company", "s.operating_company_id = ANY ($1::uuid[])"],
];

const failures = (text) => anchors.filter(([, token]) => !text.includes(token)).map(([name]) => name);
if (process.argv.includes("--selftest")) {
  const baseline = failures(source);
  if (baseline.length) {
    console.error(`FAIL baseline: ${baseline.join(", ")}`);
    process.exit(1);
  }
  const escaped = [];
  for (const [name, token] of anchors) {
    const mutated = source.split(token).join(`/* planted ${name} scope regression */`);
    if (!failures(mutated).includes(name)) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`FAIL escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`PASS selftest: ${anchors.length}/${anchors.length} register-scope mutations caught`);
  process.exit(0);
}
const missing = failures(source);
if (missing.length) {
  console.error(`FAIL ${FILE}: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`PASS ${FILE}: ${anchors.length} document/GL company-scope anchors`);
