#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.subnav\\.vendor_link$","task":"ACCOUNTING-VENDOR-LINK-NOT-MISLEADING-CREATE-CHROME-LAW-8","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law): the app-wide "+ X" convention means "opens a create flow" —
 * AccountingSubNavWrapper.tsx's link to /vendors was a plain navigation shortcut (no modal, no
 * form) but used "+ Vendor", implying a create action that doesn't exist there. Relabeled to
 * "Go to vendors", matching the established plain-navigation-link convention (QboStyleHomePage.tsx's
 * "Go to registers").
 */
import fs from "node:fs";
const LABEL = "verify-accounting-vendor-link-not-misleading-create";
const FILE = "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx";

function audit(src) {
  const failures = [];
  if (!/to="\/vendors"[\s\S]{0,200}>\s*Go to vendors\s*</.test(src)) failures.push("the /vendors link must read 'Go to vendors'");
  if (/to="\/vendors"[\s\S]{0,200}>\s*\+\s*Vendor\s*</.test(src)) failures.push("the /vendors link must not use the misleading '+ Vendor' create-style label");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(FILE, "utf8");
  const mutations = [
    ["revert-label", (s) => s.replace("Go to vendors", "+ Vendor")],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = mutate(src);
    if (candidate === src || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(FILE, "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting subnav's vendors link reads "Go to vendors", no misleading "+ " create-style label`);
