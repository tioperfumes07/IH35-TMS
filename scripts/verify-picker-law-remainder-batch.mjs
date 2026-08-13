#!/usr/bin/env node
/**
 * Picker_law remainder batch — Built FactorAdmin / SubmitFactoring / AutoDeductionPolicies.
 *
 * @matrix-built {"modules":["factoring"],"cols":["picker_law"],"leafRe":"^(factors\\.admin|submit\\.queue|accounting\\.submit)$","task":"VERTICAL-PICKER-LAW-remainder-factoring","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["picker_law"],"leafRe":"^deductions$","task":"VERTICAL-PICKER-LAW-remainder-drivers","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-picker-law-remainder-batch.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-picker-law-remainder-batch";

const CHECKS = [
  { name: "FactorAdmin", file: "apps/frontend/src/pages/factoring/FactorAdmin.tsx", re: /EntityPicker|ReferenceSelect/ },
  { name: "SubmitFactoringModal", file: "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx", re: /EntityPicker|ReferenceSelect/ },
  { name: "AutoDeductionPolicies", file: "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx", re: /ReferenceSelect/ },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) { fails.push(`${c.name}: missing`); continue; }
    if (!c.re.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no picker`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".picker-rem-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) { console.error(`${LABEL} SELFTEST FAIL`); process.exit(1); }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) { console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`); process.exit(1); }
  process.exit(0);
}

const fails = run();
if (fails.length) { console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — picker_law remainder batch ratcheted`);
