#!/usr/bin/env node
/**
 * verify-my-accountant-page-uses-paritytable — MyAccountantPage surface
 *
 * The read-only accountant workspace (books-at-a-glance period status + CPA export
 * downloads) must use the shared ParityTable grammar (sort/resize/gear/pager), not
 * hand-rolled <table>s. Display-only migration: the six period columns, the two export
 * columns with their PDF/XLSX read-only download anchors, the no-periods empty state,
 * and the disabled invite-accountant affordance must all be preserved. This page is a
 * read-only surface — it must never gain a mutation (see MyAccountantPage.guard.test.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-my-accountant-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/MyAccountantPage.tsx";

const REQUIRED_LABELS = ["Period", "Fiscal Year", "Start", "End", "Status", "Closed", "Statement", "Download"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (periods table + CPA export table)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="my-accountant-periods"')) {
    errors.push(`${PAGE}: must set storageKey="my-accountant-periods" on the periods table`);
  }
  if (!src.includes('storageKey="my-accountant-export"')) {
    errors.push(`${PAGE}: must set storageKey="my-accountant-export" on the CPA export table`);
  }
  if (!src.includes("No accounting periods defined for this entity yet.")) {
    errors.push(`${PAGE}: must keep the no-periods empty state`);
  }
  if (!src.includes("buildStatementExportUrl")) {
    errors.push(`${PAGE}: must keep the read-only PDF/XLSX export anchors (buildStatementExportUrl)`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must surface query errors via ListErrorState`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only accountant workspace — must not add mutations`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { buildStatementExportUrl } from "../../api/my-accountant";
    const PERIOD_COLUMNS = [
      { key: "period_label", label: "Period" },
      { key: "fiscal_year", label: "Fiscal Year" },
      { key: "period_start", label: "Start" },
      { key: "period_end", label: "End" },
      { key: "status", label: "Status" },
      { key: "closed_at", label: "Closed" },
    ];
    const exportColumns = [
      { key: "label", label: "Statement" },
      { key: "download", label: "Download", render: (s) => <a href={buildStatementExportUrl(s.key, "pdf", id)}>PDF</a> },
    ];
    <p>No accounting periods defined for this entity yet.</p>
    <ListErrorState status={0} onRetry={() => {}} />
    <ParityTable columns={PERIOD_COLUMNS} storageKey="my-accountant-periods" />
    <ParityTable columns={exportColumns} storageKey="my-accountant-export" />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function MyAccountantPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Period</th></tr></thead>
        </table>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
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
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/export anchors/empty state preserved; read-only.`);
}

main();
