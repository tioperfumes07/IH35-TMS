#!/usr/bin/env node
// ROUND 321 item 6 (Lead ruling, money lane CC-2; owner may reverse): a signed POD is delivery evidence like a signed BOL
// (McLeod / Alvys / Faro accept either as the billing document). Auto-invoice fires on dfc.code IN ('bol','pod') — ONE
// shared list (BILLING_EVIDENCE_DOC_CODES) used by the existence check, the awaiting queue and the upload trigger.
//
// static: the list is exactly ['bol','pod']; every billing-doc predicate in the two files reads it; no 'bol'-only check left.
// live (read-only): delivered loads waiting on a billing document vs. loads that already have BOL or POD on file (report).
import pg from "pg";
import { readFileSync } from "node:fs";

const LABEL = "verify-auto-invoice-on-bol-or-pod";
const ROOT = new URL("../../", import.meta.url);
const svc = readFileSync(new URL("apps/backend/src/accounting/auto-invoice-on-bol.service.ts", ROOT), "utf8");
const trig = readFileSync(new URL("apps/backend/src/docs/maybe-fire-auto-invoice-after-bol.ts", ROOT), "utf8");

function selftest() {
  const problems = [];
  if (!/export const BILLING_EVIDENCE_DOC_CODES = \["bol", "pod"\] as const;/.test(svc)) problems.push("BILLING_EVIDENCE_DOC_CODES must be exactly ['bol','pod']");
  if ((svc.match(/dfc\.code = ANY\(\$2::text\[\]\)/g) ?? []).length < 2) problems.push("existence check AND awaiting queue must read the shared list");
  if (/dfc\.code = 'bol'/.test(svc) || /category_code !== "bol"/.test(trig)) problems.push("a 'bol'-only billing-doc check remains");
  if (!/BILLING_EVIDENCE_DOC_CODES as readonly string\[\]\)\.includes\(row\.category_code/.test(trig)) problems.push("upload trigger must fire on the shared list");
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (4/4)`);
}

selftest();
if (process.argv.includes("--selftest")) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set (live guard fails closed).`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, statement_timeout: 30000 });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const cats = (await client.query(`SELECT array_agg(code ORDER BY code) codes FROM catalogs.file_categories WHERE code IN ('bol','pod')`)).rows[0].codes ?? [];
  const r = (await client.query(
    `SELECT count(*)::int delivered,
            count(*) FILTER (WHERE has_doc)::int with_bol_or_pod,
            count(*) FILTER (WHERE has_doc AND NOT has_inv)::int doc_but_no_invoice
       FROM (
         SELECT l.id,
                EXISTS (SELECT 1 FROM docs.files df JOIN docs.file_links dfl ON dfl.file_id = df.id
                          LEFT JOIN catalogs.file_categories dfc ON dfc.id = df.category_id
                         WHERE dfl.entity_type = 'load' AND dfl.entity_id = l.id AND dfl.deleted_at IS NULL
                           AND df.deleted_at IS NULL AND df.upload_completed_at IS NOT NULL AND dfc.code IN ('bol','pod')) has_doc,
                EXISTS (SELECT 1 FROM accounting.invoices i WHERE i.source_load_id = l.id AND i.voided_at IS NULL AND i.status NOT IN ('proforma')) has_inv
           FROM mdata.loads l
          WHERE l.soft_deleted_at IS NULL AND COALESCE(l.is_sample_data, false) = false
            AND l.status IN ('delivered_pending_docs','completed_docs_received')) x`
  )).rows[0];
  await client.query("ROLLBACK");
  if (cats.length !== 2) {
    console.error(`${LABEL}: LIVE FAIL — catalogs.file_categories must carry both 'bol' and 'pod' (found ${JSON.stringify(cats)})`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — categories bol+pod present; delivered loads ${r.delivered}, with BOL or POD ${r.with_bol_or_pod}, doc on file but no invoice ${r.doc_but_no_invoice} (the upload trigger releases those on the next BOL/POD save)`);
} finally {
  await client.end();
}
