#!/usr/bin/env node
/**
 * verify-qbo-parity-resizable-columns-everywhere — BANK-R-01
 *
 * Customers, Vendors, and Drivers are the three core master lists in the QBO-parity sweep.
 * Customers and Vendors already migrated their primary grids to the shared ParityTable
 * (sort/resize/gear/per-page persist — QBO-parity chrome). Drivers was the last of the three
 * still on the plain hand-configured `DataTable` for its roster grid (pages/Drivers.tsx,
 * `subnavTab === "drivers"` branch). This guard locks the ParityTable contract on the Drivers
 * roster so a regression cannot silently revert it. Columns Name / Phone / CDL # / CDL Expires /
 * Status / Hire Date are preserved 1:1, in order. The Teams grid (separate tab, separate table)
 * intentionally still uses DataTable — untouched (Rule 07: additive, not a rip-out). No tab count
 * change, no schema/posting change — internals-only pin.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-parity-resizable-columns-everywhere";
const PAGE = "apps/frontend/src/pages/Drivers.tsx";

// Drivers roster column order is part of the preserved contract — assert order, not just presence.
const ROSTER_LABELS_IN_ORDER = ["Name", "Phone", "CDL #", "CDL Expires", "Status", "Hire Date"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../components/parity/ParityTable"') &&
    !src.includes("from '../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable> (the Drivers roster grid)`);
  }
  // Forward-scan so shared labels elsewhere on the page don't false-positive: each roster label
  // must appear AFTER the previous one, in the locked order.
  let cursor = 0;
  for (const label of ROSTER_LABELS_IN_ORDER) {
    const idx = src.indexOf(`label: "${label}"`, cursor);
    if (idx === -1) {
      errors.push(`${PAGE}: missing (or out-of-order) Drivers roster column label: "${label}"`);
      continue;
    }
    cursor = idx + 1;
  }
  if (!src.includes('storageKey="drivers-roster"')) {
    errors.push(`${PAGE}: must set storageKey="drivers-roster" so column widths/density/per-page persist`);
  }
  if (!/\+\s*Create Driver/.test(src)) {
    errors.push(`${PAGE}: must keep the "+ Create Driver" action (§7 canonical verb)`);
  }
  if (/\+\s*(Add|New) Driver/.test(src)) {
    errors.push(`${PAGE}: create action uses "+ Add/New Driver" — §7 requires "+ Create"`);
  }
  // The Teams grid is a separate, unrelated table — it may keep DataTable. Only assert the roster
  // migrated, don't forbid DataTable existing in the file (Rule 07: additive migration, not a rip-out).
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../components/parity/ParityTable";
    <Button>+ Create Driver</Button>
    <ParityTable
      storageKey="drivers-roster"
      columns={[
        { key: "name", label: "Name" },
        { key: "phone", label: "Phone" },
        { key: "cdl_number", label: "CDL #" },
        { key: "cdl_expires_at", label: "CDL Expires" },
        { key: "status", label: "Status" },
        { key: "hire_date", label: "Hire Date" },
      ]}
    />
  `;
  const bad = `
    export function DriversPage() {
      return (
        <DataTable
          columns={[{ key: "name", label: "Name" }]}
        />
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
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ${PAGE} Drivers roster uses ParityTable; columns/storageKey/"+ Create Driver" preserved.`,
  );
}

main();
