#!/usr/bin/env node
/**
 * Locks the Legal Template detail history grids to the shared ParityTable grammar.
 * Version history and append-only audit evidence must retain their existing columns,
 * while API outages must use the retryable shared ListErrorState.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-template-detail-uses-paritytable";
const PAGE = "apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx";
const REQUIRED_LABELS = ["Version", "Status", "Updated", "When", "Event", "Actor"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from the shared parity component`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState for template-detail query failures`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ParityTable for version history and audit log`);
  }
  if (/<table[\s>]/.test(src) || /<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not retain hand-rolled table markup`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing preserved column label: ${label}`);
    }
  }
  for (const storageKey of ["legal-template-version-history", "legal-template-audit-log"]) {
    if (!src.includes(`storageKey="${storageKey}"`)) {
      errors.push(`${PAGE}: must set storageKey="${storageKey}"`);
    }
  }
  if (!src.includes("renderExpanded")) {
    errors.push(`${PAGE}: audit evidence must retain an expandable event payload`);
  }
  if (!src.includes("Couldn't load template detail")) {
    errors.push(`${PAGE}: ListErrorState must name the template-detail outage`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable } from "../../../components/parity/ParityTable";
    const VERSION_COLUMNS = [
      { key: "version", label: "Version" },
      { key: "status", label: "Status" },
      { key: "updated_at", label: "Updated" },
    ];
    const AUDIT_LOG_COLUMNS = [
      { key: "created_at", label: "When" },
      { key: "event_type", label: "Event" },
      { key: "actor_name", label: "Actor" },
    ];
    <ListErrorState title="Couldn't load template detail" status={0} onRetry={() => {}} />
    <ParityTable storageKey="legal-template-version-history" />
    <ParityTable storageKey="legal-template-audit-log" renderExpanded={() => <pre />} />
  `;
  const bad = `
    export function LegalTemplateDetailPage() {
      return <table><thead><tr><th>Version</th></tr></thead></table>;
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

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const errors = assertMigrated(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: legal template detail uses ParityTable + ListErrorState.`);
}
