#!/usr/bin/env node
/**
 * verify-qbo-sync-health-card-uses-paritytable — qbo-parity-a1 (Lists hub QBO Sync Health card)
 *
 * The Lists hub QBO Sync Health card grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Financial surface — display-only
 * migration of a READ-ONLY sync-health count grid (no money write; TMS never
 * writes to QBO). Columns Entity / Local / QBO / Drift, the "QBO Sync Health"
 * heading, the Force QBO Sync button, and the driftClass severity coloring must
 * be preserved 1:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-sync-health-card-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/components/QboSyncHealthCard.tsx";

const REQUIRED_LABELS = ["Entity", "Local", "QBO", "Drift"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
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
  if (!src.includes('storageKey="lists-qbo-sync-health"')) {
    errors.push(`${PAGE}: must set storageKey="lists-qbo-sync-health"`);
  }
  if (!src.includes('tableTestId="lists-qbo-sync-health-table"')) {
    errors.push(`${PAGE}: must set tableTestId="lists-qbo-sync-health-table"`);
  }
  if (!src.includes("QBO Sync Health")) {
    errors.push(`${PAGE}: must keep the "QBO Sync Health" heading`);
  }
  if (!src.includes("Force QBO Sync")) {
    errors.push(`${PAGE}: must keep the "Force QBO Sync" button`);
  }
  if (!src.includes("driftClass")) {
    errors.push(`${PAGE}: must keep the driftClass severity coloring`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    function driftClass(value) { return "text-slate-700"; }
    const COLUMNS = [
      { key: "entity", label: "Entity" },
      { key: "local_count", label: "Local" },
      { key: "qbo_count", label: "QBO" },
      { key: "drift", label: "Drift", render: (row) => <span className={driftClass(row.drift)}>{row.drift}</span> },
    ];
    <div>QBO Sync Health</div>
    <button>Force QBO Sync</button>
    <ParityTable
      storageKey="lists-qbo-sync-health"
      tableTestId="lists-qbo-sync-health-table"
    />
  `;
  const bad = `
    export function QboSyncHealthCard() {
      return (
        <div>
          <table><thead><tr><th>Entity</th></tr></thead></table>
        </div>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns + heading + Force QBO Sync button preserved.`);
}

main();
