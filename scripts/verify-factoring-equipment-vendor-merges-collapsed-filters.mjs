#!/usr/bin/env node
/**
 * verify-factoring-equipment-vendor-merges-collapsed-filters.mjs
 *
 * NEW-26 (owner 2026-09-07 raw findings): "QuickBooks-style filters (date range etc.) missing
 * across ALL Factoring tabs." NEW-20 already folded the Recourse Pipeline and Chargebacks & Fees
 * tabs' filter grids into the shared CollapsedListFilters chrome (see
 * verify-factoring-collapsed-filter-chrome.mjs). This guard extends the same requirement to the
 * remaining two tabs that had their own always-open filter grids: Equipment Loan (CCG)'s Lender
 * vendor filter, and Driver Vendor Merges' Driver/Vendor filter — both previously a bare
 * `grid sm:grid-cols-2 lg:grid-cols-3` div with Apply/Cancel/Reset always visible.
 *
 * WHAT IS ASSERTED:
 *  - The equipment_loans tab block renders a <CollapsedListFilters> (not a bespoke grid) around
 *    its Lender-vendor picker, used standalone (this list is a raw card list, not a ParityTable,
 *    so there is no filterBar slot to fold into).
 *  - The vendor_merges tab's "Recent merge history" ParityTable receives a <CollapsedListFilters>
 *    as its filterBar, wrapping the Driver/Vendor pickers.
 *
 * Usage:
 *   node scripts/verify-factoring-equipment-vendor-merges-collapsed-filters.mjs            # scan
 *   node scripts/verify-factoring-equipment-vendor-merges-collapsed-filters.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-equipment-vendor-merges-collapsed-filters";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest. */
export function checkBothTabs(src) {
  const failures = [];

  const equipStart = src.indexOf('tab === "equipment_loans"');
  const vendorMergesStart = src.indexOf('tab === "vendor_merges"');
  const equipSection =
    equipStart >= 0 && vendorMergesStart > equipStart ? src.slice(equipStart, vendorMergesStart) : "";
  if (!equipSection) {
    failures.push(`${HOME}: could not find the equipment_loans tab block.`);
  } else {
    if (!/<CollapsedListFilters/.test(equipSection)) {
      failures.push(`${HOME}: equipment_loans tab must use <CollapsedListFilters> for its Lender-vendor filter, not a bespoke grid.`);
    }
    if (/relative mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3/.test(equipSection)) {
      failures.push(`${HOME}: equipment_loans regression — the old always-open bespoke filter grid is back.`);
    }
  }

  const mergesSection = src.split('tab === "vendor_merges"')[1]?.slice(0, 8000) ?? "";
  if (!mergesSection) {
    failures.push(`${HOME}: could not find the vendor_merges tab block.`);
  } else {
    if (!/VENDOR_MERGE_COLUMNS[\s\S]{0,50}rows=\{vendorMergesQuery\.data\?\.rows/.test(mergesSection)) {
      failures.push(`${HOME}: vendor_merges tab must still render the VENDOR_MERGE_COLUMNS ParityTable.`);
    }
    if (!/filterBar=\{[\s\S]{0,800}<CollapsedListFilters/.test(mergesSection)) {
      failures.push(`${HOME}: vendor_merges tab's ParityTable must receive a <CollapsedListFilters> as filterBar.`);
    }
    if (/relative mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="factoring-home-vendor-merges-filters"/.test(mergesSection)) {
      failures.push(`${HOME}: vendor_merges regression — the old always-open bespoke filter grid is back.`);
    }
  }

  return failures;
}

export function run() {
  const failures = [];
  const { ok, src, err } = read(HOME);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  failures.push(...checkBothTabs(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodSrc = `
    tab === "equipment_loans" ? (
      <div>
        <CollapsedListFilters>
          <label>Lender vendor</label>
        </CollapsedListFilters>
      </div>
    ) : null

    tab === "vendor_merges" ? (
      <div>
        <ParityTable
          columns={VENDOR_MERGE_COLUMNS}
          rows={vendorMergesQuery.data?.rows ?? []}
          filterBar={
            <CollapsedListFilters>
              <label>Driver</label>
            </CollapsedListFilters>
          }
        />
      </div>
    ) : null
  `;
  const badEquipBespokeGrid = `
    tab === "equipment_loans" ? (
      <div>
        <div className="relative mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label>Lender vendor</label>
        </div>
      </div>
    ) : null

    tab === "vendor_merges" ? (
      <div>
        <ParityTable
          columns={VENDOR_MERGE_COLUMNS}
          rows={vendorMergesQuery.data?.rows ?? []}
          filterBar={<CollapsedListFilters><label>Driver</label></CollapsedListFilters>}
        />
      </div>
    ) : null
  `;
  const badMergesMissingFilterBar = `
    tab === "equipment_loans" ? (
      <div><CollapsedListFilters><label>Lender vendor</label></CollapsedListFilters></div>
    ) : null

    tab === "vendor_merges" ? (
      <div>
        <div className="relative mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="factoring-home-vendor-merges-filters">
          <label>Driver</label>
        </div>
        <ParityTable columns={VENDOR_MERGE_COLUMNS} rows={vendorMergesQuery.data?.rows ?? []} />
      </div>
    ) : null
  `;

  const checks = [
    ["clean source passes", checkBothTabs(goodSrc).length === 0],
    ["equipment bespoke grid regression fails", checkBothTabs(badEquipBespokeGrid).length > 0],
    ["merges missing filterBar regression fails", checkBothTabs(badMergesMissingFilterBar).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Equipment Loan + Driver Vendor Merges tabs use CollapsedListFilters (NEW-26)`);
process.exit(0);
