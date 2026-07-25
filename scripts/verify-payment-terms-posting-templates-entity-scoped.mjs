#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202608000000_payment_terms_posting_templates_per_entity.sql";
const INDEX = "apps/backend/src/catalogs/accounting/index.ts";
const LABEL = "verify-payment-terms-posting-templates-entity-scoped";

export function assert(migSrc, indexSrc) {
  const problems = [];
  for (const tbl of ["payment_terms", "posting_templates"]) {
    if (!migSrc.includes(`catalogs.${tbl}`) && !new RegExp(`ALTER TABLE catalogs\\.${tbl}`).test(migSrc)) {
      problems.push(`${MIG}: missing ${tbl} conversion`);
    }
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(migSrc) || !/company_scope/.test(migSrc)) {
    problems.push(`${MIG}: must FORCE RLS + company_scope`);
  }
  if (!/REVOKE DELETE ON catalogs\.payment_terms/.test(migSrc) || !/REVOKE DELETE ON catalogs\.posting_templates/.test(migSrc)) {
    problems.push(`${MIG}: must REVOKE DELETE on both tables`);
  }
  if (/91e0bf0a-133f-4ce8-a734-2586cfa66d96/.test(migSrc)) {
    problems.push(`${MIG}: hardcoded UUID forbidden`);
  }
  if (!/code\s*=\s*'TRANSP'/.test(migSrc)) {
    problems.push(`${MIG}: resolve primary via org.companies.code='TRANSP'`);
  }
  // Factory must mark both entityScoped:true near their tableName registrations.
  const ptBlock = indexSrc.match(/tableName:\s*"payment_terms"[\s\S]{0,400}?registerLegacy|tableName:\s*"payment_terms"[\s\S]{0,400}?entityScoped:\s*true/);
  if (!/tableName:\s*"payment_terms"[\s\S]{0,500}?entityScoped:\s*true/.test(indexSrc)) {
    problems.push(`${INDEX}: payment_terms must set entityScoped: true`);
  }
  if (!/tableName:\s*"posting_templates"[\s\S]{0,500}?entityScoped:\s*true/.test(indexSrc)) {
    problems.push(`${INDEX}: posting_templates must set entityScoped: true`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN && process.argv.includes("--selftest")) {
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const idx = fs.readFileSync(path.join(ROOT, INDEX), "utf8");
  const broken = idx.replace(/entityScoped:\s*true/g, "entityScoped: false");
  if (assert(mig, broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: unscoped factory not flagged`);
    process.exit(1);
  }
  const good = assert(mig, idx);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}
if (IS_MAIN) {
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const idx = fs.readFileSync(path.join(ROOT, INDEX), "utf8");
  const problems = assert(mig, idx);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}
