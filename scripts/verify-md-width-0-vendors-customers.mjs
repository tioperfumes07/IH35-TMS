#!/usr/bin/env node
// VC-08 / MD-WIDTH-0 (owner 2026-09-06, "CANNOT OPEN THE VENDORS OR CUSTOMERS... LIST VIEW OR
// MASTER DETAIL"): the Vendors/Customers list sidebar's <aside> rendered at 0px width live
// (CERT-01's xl:min-w/max-w classes didn't take effect while w-full+shrink-0 consumed the whole
// flex row), so clicking a row fired the detail fetch but nothing ever appeared -- the pane was
// in the DOM with no width. Fixed in commit d4ab9a67 (#20910) by giving the aside an explicit
// `xl:w-[440px]` alongside the existing min/max bounds. This guard exists because that fix
// shipped with no regression guard (IN-CODE-NO-GUARD on the board) -- a future CSS class edit
// could silently drop the explicit width and reopen the exact "cannot open" bug with zero test
// coverage catching it.
import fs from "node:fs";

const LABEL = "verify-md-width-0-vendors-customers";
const TARGETS = [
  { file: "apps/frontend/src/pages/customers/CustomerListSidebar.tsx", marker: 'data-customer-list-sidebar="true"' },
  { file: "apps/frontend/src/pages/vendors/VendorListSidebar.tsx", marker: 'data-vendor-list-sidebar="true"' },
];

/** Extracts the <aside className="..."> string on the line carrying the given marker attribute. */
export function extractAsideClassName(src, marker) {
  const lines = src.split("\n");
  const line = lines.find((l) => l.includes("<aside") && l.includes(marker));
  if (!line) return null;
  const m = line.match(/className="([^"]*)"/);
  return m ? m[1] : null;
}

export function asideHasExplicitWidth(className) {
  if (!className) return false;
  // Must NOT be plain "w-full" with nothing pinning a real width at the breakpoint where the
  // detail pane needs to coexist with it -- xl:w-[...] is the exact fix; a bare shrink-0 with no
  // xl:w-[...] is the regression shape (relies on max-w alone, which measured-live did not apply).
  return /\bw-full\b/.test(className) && /\bshrink-0\b/.test(className) && /\bxl:w-\[\d+px\]/.test(className);
}

function violations(sources) {
  const errors = [];
  for (const { file, marker } of TARGETS) {
    const src = sources[file];
    if (src == null) {
      errors.push(`${file}: not found`);
      continue;
    }
    const className = extractAsideClassName(src, marker);
    if (className == null) {
      errors.push(`${file}: could not find the <aside ${marker}> element`);
      continue;
    }
    if (!asideHasExplicitWidth(className)) {
      errors.push(
        `${file}: aside lost its explicit xl:w-[...px] pin (className="${className}") — this is the exact MD-WIDTH-0 regression (0px master-detail pane, #20910)`
      );
    }
  }
  return errors;
}

function check(sources) {
  const errors = violations(sources);
  if (errors.length) throw new Error(errors.join("; "));
}

const realSources = Object.fromEntries(TARGETS.map(({ file }) => [file, fs.readFileSync(file, "utf8")]));

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    // Drop the xl:w-[440px] pin entirely (the exact live-measured regression shape).
    {
      ...realSources,
      "apps/frontend/src/pages/vendors/VendorListSidebar.tsx": realSources[
        "apps/frontend/src/pages/vendors/VendorListSidebar.tsx"
      ].replace("xl:w-[440px] ", ""),
    },
    {
      ...realSources,
      "apps/frontend/src/pages/customers/CustomerListSidebar.tsx": realSources[
        "apps/frontend/src/pages/customers/CustomerListSidebar.tsx"
      ].replace("xl:w-[440px] ", ""),
    },
    // Remove the marker attribute so the extractor can't find the element at all.
    {
      ...realSources,
      "apps/frontend/src/pages/vendors/VendorListSidebar.tsx": realSources[
        "apps/frontend/src/pages/vendors/VendorListSidebar.tsx"
      ].replace('data-vendor-list-sidebar="true"', ""),
    },
  ];
  for (const mutated of mutations) {
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  check(realSources);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(realSources);
  console.log(`${LABEL} PASS -- Vendors and Customers list-sidebar asides both keep their explicit xl:w-[...px] pin (MD-WIDTH-0, #20910)`);
}
