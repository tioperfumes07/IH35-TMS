#!/usr/bin/env node
/** @matrix-built {"modules":["banking"],"cols":["qbo_chrome"],"leafRe":"^banking\\.panel\\.bank_accounts$","task":"BANKING-BARE-PLUS-ACCESSIBLE-LABEL-CHROME-LAW-8","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law): BankingHome.tsx's compact "Bank accounts" panel-header "+"
 * button (a redundant trigger for the same Manage Accounts modal as the labeled "+ Create Account
 * / Manage Accounts" button) had zero accessible text — no aria-label, no visible label beyond the
 * glyph. Added aria-label="Manage bank accounts" so it identifies itself to screen readers / a11y
 * tooling while keeping the compact glyph visually (tight panel-header space).
 */
import fs from "node:fs";
const LABEL = "verify-banking-bare-plus-accessible-label";
const FILE = "apps/frontend/src/pages/banking/BankingHome.tsx";

function audit(src) {
  const failures = [];
  const m = src.match(/onClick=\{\(\) => setManageOpen\(true\)\}[\s\S]{0,120}/g) || [];
  const panelHeaderButton = m.find((s) => /aria-label|>\s*\+\s*</.test(s));
  if (!panelHeaderButton) {
    failures.push("could not find the panel-header + button near setManageOpen(true)");
    return failures;
  }
  if (!/aria-label="Manage bank accounts"/.test(panelHeaderButton)) failures.push("panel-header + button must carry aria-label=\"Manage bank accounts\"");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(FILE, "utf8");
  const mutations = [
    ["strip-aria-label", (s) => s.replace('aria-label="Manage bank accounts"', "")],
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
console.log(`${LABEL} PASS — banking's bare "+" panel-header button carries an accessible aria-label`);
