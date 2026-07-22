#!/usr/bin/env node
/**
 * Rule-17 guard: bill detail reverse drill-through (Law §9).
 * Mirrors verify-expense-detail-route — lines + JE + vendor/unit/WO/load links.
 *
 * Also locks the uuid/text join class. mdata.vendors.id is uuid while
 * accounting.bills.vendor_id and vendor_uuid are BOTH text (verified against the Neon prod branch
 * br-fancy-credit-akjnd07a, 2026-07-22, and reproduced there: the direct comparison raises
 * "operator does not exist: uuid = text"). That error fires inside the very first query of
 * getBillDetail, before the not-found check, so it 500s EVERY bill-detail request — the unknown-bill
 * 404 path included, which is how CI caught it.
 *
 * SELFTEST: assertions are pure functions of source text, so they run against a good fixture AND
 * deliberately-broken ones. The previous --selftest simply re-ran the real check against live
 * sources; that can only ever confirm today's tree, never that an assertion still bites. A typo'd
 * regex would have reported PASS forever and the block would have looked protected when it was not.
 *
 * Run: node scripts/verify-bill-detail-reverse.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-detail-reverse";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** All assertions, as a pure function of the five sources. */
export function computeFailures({ service, detailPage, api, manifest, entityLink }) {
  const errors = [];

  if (!/export async function getBillDetail\(/.test(service)) {
    errors.push("backend: getBillDetail must exist");
  }
  if (!/FROM accounting\.bill_lines/.test(service)) {
    errors.push("backend: getBillDetail must SELECT bill_lines");
  }
  if (!/source_transaction_type = 'bill'/.test(service) || !/journal_entry_uuid/.test(service)) {
    errors.push("backend: getBillDetail must resolve journal_entry via postings source_transaction_type='bill'");
  }
  // uuid = text class. The vendor join must cast the uuid side to text; the reverse cast
  // (COALESCE(...)::uuid) is NOT acceptable — vendor_id is free-form text and a non-uuid value
  // there makes ::uuid RAISE instead of simply failing to match.
  if (/v\.id\s*=\s*COALESCE\(/.test(service)) {
    errors.push(
      "backend: mdata.vendors.id (uuid) must not be compared directly to bills.vendor_id/vendor_uuid (text) — 'operator does not exist: uuid = text' 500s every bill-detail request. Use v.id::text = COALESCE(...)"
    );
  }
  if (/COALESCE\(b\.vendor_id, b\.vendor_uuid\)::uuid/.test(service)) {
    errors.push(
      "backend: do not cast COALESCE(b.vendor_id, b.vendor_uuid) to ::uuid — vendor_id is free-form text and a non-uuid value raises instead of not matching. Cast v.id::text instead"
    );
  }
  if (!/v\.id::text\s*=\s*COALESCE\(b\.vendor_id, b\.vendor_uuid\)/.test(service)) {
    errors.push("backend: the vendor join must be v.id::text = COALESCE(b.vendor_id, b.vendor_uuid)");
  }

  if (!/path=["']\/accounting\/bills\/:id["']/.test(manifest)) {
    errors.push("manifest: must mount /accounting/bills/:id");
  }
  if (!/BillDetailPage/.test(manifest)) {
    errors.push("manifest: BillDetailPage must be wired");
  }
  if (!/export function BillDetailPage/.test(detailPage)) {
    errors.push("BillDetailPage: exported component missing");
  }
  if (!/data-testid="bill-detail-lines"/.test(detailPage)) {
    errors.push("BillDetailPage: must declare bill-detail-lines reverse marker");
  }
  for (const needle of ['kind="vendor"', 'kind="journal_entry"', "chart-of-accounts/register"]) {
    if (!detailPage.includes(needle)) {
      errors.push(`BillDetailPage: must render clickable link for ${needle}`);
    }
  }
  if (!/export type BillDetailLine/.test(api)) {
    errors.push("api/accounting.ts: BillDetailLine type missing");
  }
  if (!/lines: BillDetailLine\[\]/.test(api)) {
    errors.push("api/accounting.ts: getVendorBill must return lines");
  }
  if (!/`\/accounting\/bills\/\$\{id\}`/.test(entityLink)) {
    errors.push("EntityLink: bill must resolve to /accounting/bills/${id}");
  }
  return errors;
}

/** A minimal source set that satisfies every assertion. */
function goodFixture() {
  return {
    service: `
export async function getBillDetail(userId, opco, billId) {
  const billRes = await client.query(\`
    SELECT b.*, v.vendor_name,
      (SELECT jep.journal_entry_uuid::text FROM accounting.journal_entry_postings jep
        WHERE jep.source_transaction_type = 'bill') AS journal_entry_id
    FROM accounting.bills b
    LEFT JOIN mdata.vendors v
      ON v.id::text = COALESCE(b.vendor_id, b.vendor_uuid)
     AND v.operating_company_id = b.operating_company_id
  \`);
  const linesRes = await client.query(\`SELECT bl.id FROM accounting.bill_lines bl\`);
}`,
    detailPage: `export function BillDetailPage() {
  return <div data-testid="bill-detail-lines">
    <EntityLink kind="vendor" /><EntityLink kind="journal_entry" />
    <a href="/accounting/chart-of-accounts/register">register</a>
  </div>;
}`,
    api: `export type BillDetailLine = { id: string };
export type BillDetail = { lines: BillDetailLine[] };`,
    manifest: `<Route path="/accounting/bills/:id" element={<BillDetailPage />} />`,
    entityLink: 'case "bill": return `/accounting/bills/${id}`;',
  };
}

function selftest() {
  const problems = [];

  const good = computeFailures(goodFixture());
  if (good.length !== 0) problems.push(`good fixture should pass, got: ${good.join(" | ")}`);

  const cases = [
    ["service", (f) => { f.service = f.service.replace("export async function getBillDetail(", "export async function other("); }, "getBillDetail must exist"],
    ["service", (f) => { f.service = f.service.replace("FROM accounting.bill_lines", "FROM accounting.other"); }, "must SELECT bill_lines"],
    ["service", (f) => { f.service = f.service.replace("source_transaction_type = 'bill'", "source_transaction_type = 'expense'"); }, "source_transaction_type='bill'"],
    // The regression this guard exists for: the uncast uuid = text join.
    ["service", (f) => { f.service = f.service.replace("v.id::text = COALESCE(b.vendor_id, b.vendor_uuid)", "v.id = COALESCE(b.vendor_id, b.vendor_uuid)"); }, "operator does not exist: uuid = text"],
    // ...and the wrong-direction fix, which raises on non-uuid vendor_id text.
    ["service", (f) => { f.service = f.service.replace("v.id::text = COALESCE(b.vendor_id, b.vendor_uuid)", "v.id = COALESCE(b.vendor_id, b.vendor_uuid)::uuid"); }, "do not cast COALESCE"],
    ["manifest", (f) => { f.manifest = f.manifest.replace('path="/accounting/bills/:id"', 'path="/accounting/bills"'); }, "must mount /accounting/bills/:id"],
    ["detailPage", (f) => { f.detailPage = f.detailPage.replace('data-testid="bill-detail-lines"', 'data-testid="other"'); }, "bill-detail-lines reverse marker"],
    ["detailPage", (f) => { f.detailPage = f.detailPage.replace('kind="journal_entry"', 'kind="other"'); }, 'kind="journal_entry"'],
    ["api", (f) => { f.api = f.api.replace("lines: BillDetailLine[]", "rows: BillDetailLine[]"); }, "must return lines"],
    ["entityLink", (f) => { f.entityLink = f.entityLink.replace("/accounting/bills/${id}", "/accounting/bill/${id}"); }, "bill must resolve to"],
  ];

  for (const [name, mutate, expectFragment] of cases) {
    const f = goodFixture();
    mutate(f);
    const failures = computeFailures(f);
    if (!failures.some((x) => x.includes(expectFragment))) {
      problems.push(`planted regression in ${name} ("${expectFragment}") was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — good fixture passes; ${cases.length} planted regressions all caught`);
}

function main() {
  const errors = computeFailures({
    service: read("apps/backend/src/accounting/bills.service.ts"),
    detailPage: read("apps/frontend/src/pages/accounting/BillDetailPage.tsx"),
    api: read("apps/frontend/src/api/accounting.ts"),
    manifest: read("apps/frontend/src/routes/manifest.tsx"),
    entityLink: read("apps/frontend/src/components/shared/EntityLink.tsx"),
  });
  if (errors.length) {
    console.error(`${LABEL} FAIL`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
