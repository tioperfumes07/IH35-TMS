#!/usr/bin/env node
// VC-08 / MD-WIDTH-0 (owner 2026-09-06, "CANNOT OPEN THE VENDORS OR CUSTOMERS... LIST VIEW OR
// MASTER DETAIL"): the Vendors/Customers list sidebar's <aside> rendered at 0px width live
// (CERT-01's xl:min-w/max-w classes didn't take effect while w-full+shrink-0 consumed the whole
// flex row), so clicking a row fired the detail fetch but nothing ever appeared -- the pane was
// in the DOM with no width. Fixed in commit d4ab9a67 (#20910) by giving the aside an explicit
// `xl:w-[440px]` alongside the existing min/max bounds. C-16 (2026-09-30) moved the pin into
// MASTER_DETAIL.masterPaneClass (`xl:w-[min(40%,640px)]`) — same invariant, shared token.
// This guard exists because that fix shipped with no regression guard (IN-CODE-NO-GUARD on the
// board) -- a future CSS class edit could silently drop the explicit width and reopen the exact
// "cannot open" bug with zero test coverage catching it.
import fs from "node:fs";

const LABEL = "verify-md-width-0-vendors-customers";
const TOKEN_FILE = "apps/frontend/src/design/master-detail.ts";
const TARGETS = [
  { file: "apps/frontend/src/pages/customers/CustomerListSidebar.tsx", marker: 'data-customer-list-sidebar="true"' },
  { file: "apps/frontend/src/pages/vendors/VendorListSidebar.tsx", marker: 'data-vendor-list-sidebar="true"' },
];

/** Finds the <aside ...> opening that carries the marker (may span multiple lines). */
export function findAsideLine(src, marker) {
  const idx = src.indexOf(marker);
  if (idx < 0) return null;
  const before = src.lastIndexOf("<aside", idx);
  if (before < 0) return null;
  const end = src.indexOf(">", idx);
  if (end < 0) return null;
  return src.slice(before, end + 1).replace(/\s+/g, " ");
}

/** Extracts className from a quoted string OR a template literal containing MASTER_DETAIL.masterPaneClass. */
export function extractAsideClassName(src, marker) {
  const line = findAsideLine(src, marker);
  if (!line) return null;
  const quoted = line.match(/className="([^"]*)"/);
  if (quoted) return quoted[1];
  if (line.includes("MASTER_DETAIL.masterPaneClass")) return "TOKEN";
  const tmpl = line.match(/className=\{`([^`]*)`\}/);
  return tmpl ? tmpl[1] : null;
}

export function asideHasExplicitWidth(className) {
  if (!className) return false;
  if (className === "TOKEN") return true; // pin owned by MASTER_DETAIL.masterPaneClass token check
  return (
    /\bw-full\b/.test(className) &&
    /\bshrink-0\b/.test(className) &&
    (/\bxl:w-\[\d+px\]/.test(className) || /\bxl:w-\[min\(/.test(className))
  );
}

export function masterPaneTokenHasExplicitWidth(tokenSrc) {
  // MASTER_DETAIL.masterPaneClass must keep w-full + shrink-0 + an xl:w-[...] pin.
  const m = tokenSrc.match(/masterPaneClass:\s*\n?\s*"([^"]+)"/);
  if (!m) return false;
  return asideHasExplicitWidth(m[1]);
}

function asideUsesMasterDetailToken(line) {
  return Boolean(line && line.includes("MASTER_DETAIL.masterPaneClass"));
}

function violations(sources) {
  const errors = [];
  const tokenSrc = sources[TOKEN_FILE];
  if (tokenSrc == null) {
    errors.push(`${TOKEN_FILE}: not found`);
  } else if (!masterPaneTokenHasExplicitWidth(tokenSrc)) {
    errors.push(
      `${TOKEN_FILE}: MASTER_DETAIL.masterPaneClass lost its explicit xl:w-[...] pin — MD-WIDTH-0 regression`
    );
  }

  for (const { file, marker } of TARGETS) {
    const src = sources[file];
    if (src == null) {
      errors.push(`${file}: not found`);
      continue;
    }
    const line = findAsideLine(src, marker);
    if (!line) {
      errors.push(`${file}: could not find the <aside ${marker}> element`);
      continue;
    }
    if (asideUsesMasterDetailToken(line)) {
      // Token file check above owns the pin; sidebar must keep using it.
      continue;
    }
    const className = extractAsideClassName(src, marker);
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

const realSources = Object.fromEntries(
  [...TARGETS.map(({ file }) => file), TOKEN_FILE].map((file) => [file, fs.readFileSync(file, "utf8")])
);

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    // Drop the MASTER_DETAIL.masterPaneClass reference (regression: sidebar no longer uses the pin).
    {
      ...realSources,
      "apps/frontend/src/pages/vendors/VendorListSidebar.tsx": realSources[
        "apps/frontend/src/pages/vendors/VendorListSidebar.tsx"
      ].replaceAll("MASTER_DETAIL.masterPaneClass", "w-full shrink-0"),
    },
    {
      ...realSources,
      "apps/frontend/src/pages/customers/CustomerListSidebar.tsx": realSources[
        "apps/frontend/src/pages/customers/CustomerListSidebar.tsx"
      ].replaceAll("MASTER_DETAIL.masterPaneClass", "w-full shrink-0"),
    },
    // Strip the pin from the shared token itself.
    {
      ...realSources,
      [TOKEN_FILE]: realSources[TOKEN_FILE]
        .replace("xl:w-[min(40%,640px)]", "")
        .replace("xl:w-[520px]", "")
        .replace("xl:w-[640px]", ""),
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
  console.log(
    `${LABEL} PASS -- Vendors/Customers list-sidebar asides keep MASTER_DETAIL.masterPaneClass (or an explicit xl:w-[...] pin) — MD-WIDTH-0, #20910 / C-16`
  );
}
