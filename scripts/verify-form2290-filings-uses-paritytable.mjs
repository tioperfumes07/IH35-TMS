#!/usr/bin/env node
/**
 * verify-form2290-filings-uses-paritytable — Compliance Form 2290 HVUT filings grid
 *
 * The Form 2290 filings list must use shared ParityTable grammar
 * (sort/resize/gear/CSV export), not a hand-rolled table. The three columns
 * (Tax period / Status / Total tax), the "No filings yet." empty state, and the
 * Generate draft action preserve the pre-migration HVUT filing behavior.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form2290-filings-uses-paritytable";
const PAGE = "apps/frontend/src/pages/compliance/Form2290Filings.tsx";
const REQUIRED_LABELS = ["Tax period", "Status", "Total tax"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="compliance-form-2290-filings"')) {
    errors.push(`${PAGE}: must set storageKey="compliance-form-2290-filings"`);
  }
  if (!src.includes('exportFilename="form-2290-filings"')) {
    errors.push(`${PAGE}: must enable Form 2290 filings CSV export`);
  }
  if (!src.includes('emptyText="No filings yet."')) {
    errors.push(`${PAGE}: must keep the "No filings yet." empty state`);
  }
  if (!src.includes("Generate draft")) {
    errors.push(`${PAGE}: must keep the Generate draft action`);
  }
  if (!src.includes('title="Form 2290 filings"')) {
    errors.push(`${PAGE}: must keep PageHeader title="Form 2290 filings"`);
  }
  if (/<h2[^>]*>Form 2290 filings<\/h2>/.test(src)) {
    errors.push(`${PAGE}: must not duplicate PageHeader with an inner h2 (Safety Permits embed)`);
  }
  if (!src.includes('from "../../components/layout/PageHeader"') && !src.includes("from '../../components/layout/PageHeader'")) {
    errors.push(`${PAGE}: full /compliance/form-2290 route must import layout PageHeader`);
  }
  if (!src.includes('backHref={showModuleHeader ? "/compliance" : "/safety"}')) {
    errors.push(`${PAGE}: PageHeader must set backHref /compliance (standalone) vs /safety (Permits embed)`);
  }
  if (!src.includes('showModuleHeader={false}')) {
    // Permits.tsx holds the embed flag; this file must still accept the prop so Safety does not get a second ←.
    if (!src.includes("showModuleHeader")) {
      errors.push(`${PAGE}: must accept showModuleHeader so Safety Permits can hide the standalone ←`);
    }
  }
  return errors;
}

function selftest() {
  const good = `
    import { PageHeader } from "../../components/layout/PageHeader";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    export function Form2290Filings({ showModuleHeader = true } = {}) {
    <div>
      <PageHeader backHref={showModuleHeader ? "/compliance" : "/safety"} title="Form 2290 filings" />
      <button>Generate draft</button>
      <ParityTable>
        emptyText="No filings yet."
        storageKey="compliance-form-2290-filings"
        exportFilename="form-2290-filings"
        columns={[
          { key: "tax_period_start", label: "Tax period" },
          { key: "filing_status", label: "Status" },
          { key: "total_tax_due", label: "Total tax" },
        ]}
      />
    </div>
  `;
  const bad = `
    export function Form2290Filings() {
      return <table><thead><tr><th>Tax period</th></tr></thead></table>;
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  const dupH2 = good.replace(
    '<PageHeader backHref={showModuleHeader ? "/compliance" : "/safety"} title="Form 2290 filings" />',
    '<PageHeader backHref={showModuleHeader ? "/compliance" : "/safety"} title="Form 2290 filings" />\n      <h2 className="text-sm font-semibold text-slate-900">Form 2290 filings</h2>'
  );
  const dupErrors = assertMigrated(dupH2);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  if (!dupErrors.some((e) => e.includes("must not duplicate PageHeader"))) {
    console.error(`${LABEL} --selftest FAIL duplicate inner h2 should fail:`, dupErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable; Tax period/Status/Total tax columns, empty state, and Generate draft preserved.`
  );
}

main();
