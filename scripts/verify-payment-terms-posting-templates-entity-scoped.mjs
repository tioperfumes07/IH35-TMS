#!/usr/bin/env node
/**
 * LST-F03 — payment_terms + posting_templates per-entity: HELD mig + factory entityScoped
 * + writable dedicated routes must require operating_company_id / set GUC (route finish).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202608000000_payment_terms_posting_templates_per_entity.sql";
const REMAP = "db/migrations/202608040000_payment_terms_consumer_remap_same_entity.sql";
const INDEX = "apps/backend/src/catalogs/accounting/index.ts";
const PT_ROUTES = "apps/backend/src/catalogs/payment-terms.routes.ts";
const TMPL_ROUTES = "apps/backend/src/catalogs/posting-templates.routes.ts";
const LABEL = "verify-payment-terms-posting-templates-entity-scoped";

export function assert(migSrc, indexSrc, ptRoutesSrc, tmplRoutesSrc, remapSrc) {
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
  if (/91e0bf0a-133f-4ce8-a734-2586cfa66d96/.test(migSrc) || /91e0bf0a-133f-4ce8-a734-2586cfa66d96/.test(remapSrc)) {
    problems.push(`${MIG}/${REMAP}: hardcoded UUID forbidden`);
  }
  if (!/code\s*=\s*'TRANSP'/.test(migSrc)) {
    problems.push(`${MIG}: resolve primary via org.companies.code='TRANSP'`);
  }
  if (!/tableName:\s*"payment_terms"[\s\S]{0,500}?entityScoped:\s*true/.test(indexSrc)) {
    problems.push(`${INDEX}: payment_terms must set entityScoped: true`);
  }
  if (!/tableName:\s*"posting_templates"[\s\S]{0,500}?entityScoped:\s*true/.test(indexSrc)) {
    problems.push(`${INDEX}: posting_templates must set entityScoped: true`);
  }

  // Dedicated writable routes (not only Lists factory) must be entity-scoped.
  for (const [label, src] of [
    [PT_ROUTES, ptRoutesSrc],
    [TMPL_ROUTES, tmplRoutesSrc],
  ]) {
    if (!/set_config\(['"]app\.operating_company_id['"]/.test(src)) {
      problems.push(`${label}: must set_config app.operating_company_id`);
    }
    if (!/operating_company_id_required/.test(src)) {
      problems.push(`${label}: must require operating_company_id`);
    }
    if (!/INSERT INTO catalogs\.(payment_terms|posting_templates)[\s\S]{0,400}?operating_company_id/.test(src)) {
      problems.push(`${label}: INSERT must write operating_company_id`);
    }
  }

  if (!/payment_terms_consumer_remap/.test(remapSrc) && !/UPDATE mdata\.customers/.test(remapSrc)) {
    problems.push(`${REMAP}: must remap customers/vendors payment_terms_id to same-entity clone`);
  }
  if (!/DO NOT RUN ON PROD/.test(remapSrc)) {
    problems.push(`${REMAP}: must carry DO NOT RUN ON PROD held marker`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN && process.argv.includes("--selftest")) {
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const idx = fs.readFileSync(path.join(ROOT, INDEX), "utf8");
  const pt = fs.readFileSync(path.join(ROOT, PT_ROUTES), "utf8");
  const tmpl = fs.readFileSync(path.join(ROOT, TMPL_ROUTES), "utf8");
  const remap = fs.readFileSync(path.join(ROOT, REMAP), "utf8");
  const brokenIdx = idx.replace(/entityScoped:\s*true/g, "entityScoped: false");
  const brokenPt = pt.replace(/set_config\(['"]app\.operating_company_id['"]/g, "set_config('app.other'");
  if (assert(mig, brokenIdx, pt, tmpl, remap).length === 0) {
    console.error(`${LABEL} --selftest FAIL: unscoped factory not flagged`);
    process.exit(1);
  }
  if (assert(mig, idx, brokenPt, tmpl, remap).length === 0) {
    console.error(`${LABEL} --selftest FAIL: unscoped payment-terms route not flagged`);
    process.exit(1);
  }
  const good = assert(mig, idx, pt, tmpl, remap);
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
  const pt = fs.readFileSync(path.join(ROOT, PT_ROUTES), "utf8");
  const tmpl = fs.readFileSync(path.join(ROOT, TMPL_ROUTES), "utf8");
  const remap = fs.readFileSync(path.join(ROOT, REMAP), "utf8");
  const problems = assert(mig, idx, pt, tmpl, remap);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}
