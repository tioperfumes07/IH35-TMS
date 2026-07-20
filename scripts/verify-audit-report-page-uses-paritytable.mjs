#!/usr/bin/env node
/**
 * Audit report UI is display-only and must retain the shared ParityTable grammar.
 * This prevents a hand-rolled audit-event table from returning while preserving
 * its five columns, CSV export, filter bar, and server-side pagination.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-audit-report-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/reports/audit/AuditReportPage.tsx";
const REQUIRED_LABELS = ["Date/Time", "Event Type", "Subject", "Actor", "Source"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length !== 1) {
    errors.push(`${PAGE}: expected exactly one shared <ParityTable>`);
  }
  if (/<table[\s>]/.test(src) || /<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled table`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing preserved column label "${label}"`);
    }
  }
  for (const required of ["filterBar=", "storageKey=\"audit-report-page\"", "handleCsvExport", "totalPages > 1"]) {
    if (!src.includes(required)) {
      errors.push(`${PAGE}: must preserve ${required}`);
    }
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable } from "../../../components/parity/ParityTable";
    const columns = [
      { key: "occurred_at", label: "Date/Time" },
      { key: "event_type", label: "Event Type" },
      { key: "subject_type", label: "Subject" },
      { key: "actor_email", label: "Actor" },
      { key: "source", label: "Source" },
    ];
    function handleCsvExport() {}
    <ParityTable storageKey="audit-report-page" filterBar={<div />} />
    {totalPages > 1 && null}
  `;
  const bad = `<table><thead><tr><th>Date/Time</th></tr></thead></table>`;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length || badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL`, { goodErrors, badErrors });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const errors = assertMigrated(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
