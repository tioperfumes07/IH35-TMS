#!/usr/bin/env node
/**
 * CI guard: Board 1 Accounting — R9.0 design parity census (6 fixes).
 * Source: docs/design/v3/Accounting.dc.html + Lead census 11-13-2026.
 *
 * Checks:
 * 1. Open Bills KPI tone is "ink" (not conditional red)
 * 2. HoverDropdownNav has hideChevron prop
 * 3. AccountingSubNavWrapper passes hideChevron
 * 4. Bills nav label is NOT mutated with $ amounts
 * 5. Invoices nav label has count only (no $ amount)
 * 6. ParityTable has suppressToolbar prop
 * 7. Receivables Aging uses suppressToolbar (not suppressToolbarSearch/Range)
 * 8. Settlements Open uses suppressToolbar
 * 9. Settlements Open "Open" column renders plain text (no Link underline)
 * 10. Reclassify top-level label is "Reclassify"
 * 11. Header uses items-baseline (inline baseline flex)
 * 12. Go to vendors is plain text link (not bordered button)
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = new URL("../apps/frontend/src", import.meta.url).pathname;
const LABEL = "verify-accounting-board1-census";

let passed = 0;
let failed = 0;
let quiet = false;
/** --selftest: a path → source override, so a planted defect is checked without touching the real file. */
let overrides = {};

function pass(msg) { if (!quiet) console.log(`PASS [${LABEL}]: ${msg}`); passed++; }
function fail(msg) { if (!quiet) console.error(`FAIL [${LABEL}]: ${msg}`); failed++; }

function read(relPath) {
  return overrides[relPath] ?? readFileSync(path.join(ROOT, relPath), "utf8");
}

function census() {
  // ─── 1. Open Bills KPI tone ────────────────────────────────────────────────
  {
    const src = read("pages/accounting/AccountingHubPage.tsx");
    if (/tone=\{openBills\.length.*["']red["']/.test(src)) {
      fail("Open Bills KPI must use tone=\"ink\" not conditional red (R9.0 Board 1 diff #4)");
    } else {
      pass("Open Bills KPI tone is not conditional red");
    }
    if (!src.includes('tone="ink"')) {
      fail("Open Bills KPI must have tone=\"ink\"");
    } else {
      pass("Open Bills KPI has tone=\"ink\"");
    }
  }

  // ─── 2. HoverDropdownNav hideChevron prop ─────────────────────────────────
  {
    const src = read("components/forms/shared/HoverDropdownNav.tsx");
    if (!src.includes("hideChevron")) {
      fail("HoverDropdownNav must have hideChevron prop (R9.0 Board 1 diff #3)");
    } else {
      pass("HoverDropdownNav has hideChevron prop");
    }
    if (!src.includes("!hideChevron && <ChevronDown")) {
      fail("HoverDropdownNav must conditionally render ChevronDown based on hideChevron");
    } else {
      pass("HoverDropdownNav conditionally renders ChevronDown");
    }
  }

  // ─── 3. AccountingSubNavWrapper passes hideChevron ────────────────────────
  {
    const src = read("pages/accounting/AccountingSubNavWrapper.tsx");
    if (!src.includes("hideChevron")) {
      fail("AccountingSubNavWrapper must pass hideChevron to HoverDropdownNav (R9.0 Board 1 diff #3)");
    } else {
      pass("AccountingSubNavWrapper passes hideChevron");
    }
  }

  // ─── 4. Bills nav label not mutated with $ ────────────────────────────────
  {
    const src = read("pages/accounting/AccountingSubNavWrapper.tsx");
    if (/item\.label === ["']Bills["'].*openAmountCents/.test(src.replace(/\n/g, " "))) {
      fail("Bills nav label must NOT include dollar amount (R9.0 Board 1 diff #3)");
    } else {
      pass("Bills nav label not mutated with dollar amount");
    }
  }

  // ─── 5. Invoices nav label count-only (no $) ─────────────────────────────
  {
    const src = read("pages/accounting/AccountingSubNavWrapper.tsx");
    if (/Invoices.*openAmountCents/.test(src.replace(/\n/g, " "))) {
      fail("Invoices nav label must NOT include dollar amount (R9.0 Board 1 diff #3)");
    } else {
      pass("Invoices nav label has no dollar amount");
    }
    if (!/Invoices.*invoices\.count/.test(src.replace(/\n/g, " "))) {
      fail("Invoices nav label must include count");
    } else {
      pass("Invoices nav label includes count");
    }
  }

  // ─── 6. ParityTable suppressToolbar prop ──────────────────────────────────
  {
    const src = read("components/parity/ParityTable.tsx");
    if (!src.includes("suppressToolbar")) {
      fail("ParityTable must have suppressToolbar prop (R9.0 Board 1 diff #5,#6)");
    } else {
      pass("ParityTable has suppressToolbar prop");
    }
    if (!src.includes("!suppressToolbar &&")) {
      fail("ParityTable must conditionally render toolbar based on suppressToolbar");
    } else {
      pass("ParityTable conditionally renders toolbar");
    }
  }

  // ─── 7. Receivables Aging suppressToolbar ─────────────────────────────────
  {
    const src = read("pages/accounting/AccountingHubPage.tsx");
    // Find the ParityTable definition for Receivables Aging by its unique type annotation
    const agingTableIdx = src.indexOf("agingBuckets.rows)[number]>");
    if (agingTableIdx < 0) {
      fail("Could not locate Receivables Aging ParityTable in AccountingHubPage");
    } else {
      const agingSection = src.slice(agingTableIdx, agingTableIdx + 1500);
      if (!agingSection.includes("suppressToolbar")) {
        fail("Receivables Aging ParityTable must use suppressToolbar (R9.0 Board 1 diff #5)");
      } else {
        pass("Receivables Aging uses suppressToolbar");
      }
    }
  }

  // ─── 8. Settlements Open suppressToolbar ──────────────────────────────────
  {
    const src = read("pages/accounting/AccountingHubPage.tsx");
    // Find the ParityTable definition for Settlements Open by its unique type annotation
    const settIdx = src.indexOf("settlementsOpen)[number]>");
    if (settIdx < 0) {
      fail("Could not locate Settlements Open ParityTable in AccountingHubPage");
    } else {
      const settSection = src.slice(settIdx, settIdx + 1500);
      if (!settSection.includes("suppressToolbar")) {
        fail("Settlements Open ParityTable must use suppressToolbar (R9.0 Board 1 diff #6)");
      } else {
        pass("Settlements Open uses suppressToolbar");
      }
    }
  }

  // ─── 9. Settlements Open "Open" column plain text ─────────────────────────
  {
    const src = read("pages/accounting/AccountingHubPage.tsx");
    const settIdx = src.indexOf("settlementsOpen");
    if (settIdx < 0) {
      fail("Could not locate Settlements Open in AccountingHubPage");
    } else {
      const settSection = src.slice(settIdx, settIdx + 2000);
      if (/className="underline".*formatUsdCents/.test(settSection.replace(/\n/g, " "))) {
        fail("Settlements Open 'Open' column must NOT render as underlined Link (R9.0 Board 1 diff #6)");
      } else {
        pass("Settlements Open 'Open' column is not an underlined Link");
      }
    }
  }

  // ─── 10. Reclassify top-level label is "Reclassify" ──────────────────────
  {
    const src = read("pages/accounting/subnav-manifest.ts");
    // The top-level ACCOUNTING_SUB_NAV_ITEMS entry for reclassify must have label "Reclassify"
    if (!src.includes('label: "Reclassify"')) {
      fail("subnav-manifest must override reclassify top-level label to \"Reclassify\" (R9.0 Board 1 diff #3)");
    } else {
      pass("subnav-manifest has Reclassify top-level label");
    }
  }

  // ─── 11. Header uses items-baseline (inline) ─────────────────────────────
  {
    const src = read("pages/accounting/AccountingSubNavWrapper.tsx");
    // The R9.1 v3parity rebuild (#29546) moved the row to inline styles: alignItems "baseline" is the same baseline row.
    if (!src.includes("items-baseline") && !/alignItems:\s*["']baseline["']/.test(src)) {
      fail("AccountingSubNavWrapper header must use items-baseline flex row (R9.0 Board 1 diff #1)");
    } else {
      pass("AccountingSubNavWrapper header uses items-baseline");
    }
  }

  // ─── 12. Go to vendors is plain text link ────────────────────────────────
  {
    const src = read("pages/accounting/AccountingSubNavWrapper.tsx");
    // Check the specific className on the Go to vendors Link (not surrounding divs)
    const gtvIdx = src.indexOf("Go to vendors");
    if (gtvIdx < 0) {
      fail("Could not locate 'Go to vendors' link in AccountingSubNavWrapper");
    } else {
      // Look back ~300 chars for the opening tag's className
      const gtvSection = src.slice(Math.max(0, gtvIdx - 300), gtvIdx + 50);
      if (/border border-gray/.test(gtvSection)) {
        fail("'Go to vendors' must NOT be a bordered button (R9.0 Board 1 diff #2)");
      } else {
        pass("'Go to vendors' is not a bordered button");
      }
    }
  }
}

// ─── --selftest: plant each defect the census exists to catch and prove it is caught ──────────
if (process.argv.includes("--selftest")) {
  const real = (p) => readFileSync(path.join(ROOT, p), "utf8");
  const HUB = "pages/accounting/AccountingHubPage.tsx", NAV = "components/forms/shared/HoverDropdownNav.tsx";
  const WRAP = "pages/accounting/AccountingSubNavWrapper.tsx", TABLE = "components/parity/ParityTable.tsx", MANI = "pages/accounting/subnav-manifest.ts";
  const run = (ov) => { overrides = ov; passed = 0; failed = 0; quiet = true; census(); return failed; };
  const mutations = [
    ["Open Bills KPI loses tone=\"ink\"", { [HUB]: real(HUB).split('tone="ink"').join('tone="red"') }],
    ["HoverDropdownNav loses hideChevron", { [NAV]: real(NAV).split("hideChevron").join("hideCaret") }],
    ["ParityTable always renders its toolbar", { [TABLE]: real(TABLE).split("!suppressToolbar &&").join("true &&") }],
    ["Reclassify label reverts", { [MANI]: real(MANI).split('label: "Reclassify"').join('label: "Reclassify transactions"') }],
    ["header drops its baseline row", { [WRAP]: real(WRAP).split("items-baseline").join("items-center").replace(/alignItems:\s*["']baseline["']/g, 'alignItems: "center"') }],
    ["Go to vendors becomes a bordered button", { [WRAP]: real(WRAP).replace("Go to vendors", '<span className="border border-gray-300">Go to vendors') }],
  ];
  let caught = 0;
  const clean = run({});
  if (clean !== 0) console.error(`SELFTEST: the live tree itself fails ${clean} check(s)`);
  for (const [name, ov] of mutations) {
    const n = run(ov);
    if (n > 0) caught++; else console.error(`SELFTEST MISSED: ${name}`);
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${mutations.length} planted defects caught${clean === 0 ? "" : " (live tree red)"}`);
  process.exit(caught === mutations.length && clean === 0 ? 0 : 1);
}

census();

// ─── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${LABEL}: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
