#!/usr/bin/env node
/**
 * U6-TIEOUT-SCOPE-MISSING-USMCA-PIN — launch scoreboard tieout scripts must pin to USMCA.
 * TRANSP references are allowed only in an explicitly labeled TRANSP-QBO comparative leg.
 *
 *   node scripts/verify-tieout-usmca-scope-pin.mjs
 *   node scripts/verify-tieout-usmca-scope-pin.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIEOUT_DIR = path.join(ROOT, "scripts/tieout");
const LABEL = "verify-tieout-usmca-scope-pin";

const USMCA_PIN =
  /operating_company_code:\s*["']USMCA["']|const USMCA_OPCO\b|(?:^|\W)o\.code\s*=\s*['"]USMCA['"]|oc\.code\s*=\s*['"]USMCA['"]|Scoped to USMCA/i;

const TRANSP_SCOPE = /(?:^|\W)(?:o|oc)\.code\s*=\s*['"]TRANSP['"]|code\s*=\s*['"]TRANSP['"]/;

const TRANSP_QBO_COMPARATIVE_LEG =
  /TRANSP-QBO comparative|qbo_comparative|Leg 2:.*TRANSP|TRANSP-only.*QBO/i;

function auditTieoutScript(relPath, raw) {
  const errors = [];
  if (!USMCA_PIN.test(raw)) {
    errors.push(`${relPath}: missing USMCA launch scoreboard pin`);
  }
  if (TRANSP_SCOPE.test(raw) && !TRANSP_QBO_COMPARATIVE_LEG.test(raw)) {
    errors.push(
      `${relPath}: TRANSP company scope without explicit TRANSP-QBO comparative leg label`
    );
  }
  return errors;
}

function run() {
  const failures = [];
  for (const name of fs.readdirSync(TIEOUT_DIR).sort()) {
    if (!name.endsWith(".mjs") || name === "_lib.mjs") continue;
    const rel = `scripts/tieout/${name}`;
    const raw = fs.readFileSync(path.join(TIEOUT_DIR, name), "utf8");
    failures.push(...auditTieoutScript(rel, raw));
  }
  return failures;
}

function selftest() {
  const good = `
export const EXPECTED = { operating_company_code: "USMCA" };
const USMCA_OPCO = "uuid";
WHERE oc.code = 'USMCA'
`;
  if (auditTieoutScript("scripts/tieout/good.mjs", good).length) {
    console.error(`${LABEL} --selftest FAIL: good fixture rejected`);
    process.exit(1);
  }

  const badNoPin = `export const EXPECTED = { tolerance_cents: 0 };`;
  if (!auditTieoutScript("scripts/tieout/bad.mjs", badNoPin).some((e) => e.includes("missing USMCA"))) {
    console.error(`${LABEL} --selftest FAIL: missing USMCA pin not caught`);
    process.exit(1);
  }

  const badTransp = `
export const EXPECTED = { operating_company_code: "USMCA" };
WHERE oc.code = 'TRANSP'
`;
  if (
    !auditTieoutScript("scripts/tieout/bad-transp.mjs", badTransp).some((e) =>
      e.includes("TRANSP-QBO comparative")
    )
  ) {
    console.error(`${LABEL} --selftest FAIL: unlabeled TRANSP scope not caught`);
    process.exit(1);
  }

  const allowedTransp = `
export const EXPECTED = { operating_company_code: "USMCA", qbo_comparative: "TRANSP-QBO comparative leg (read_only)" };
WHERE oc.code = 'TRANSP'
// Leg 2: TRANSP-QBO comparative leg
`;
  if (auditTieoutScript("scripts/tieout/allowed.mjs", allowedTransp).length) {
    console.error(`${LABEL} --selftest FAIL: labeled TRANSP-QBO comparative leg rejected`);
    process.exit(1);
  }

  const liveFails = run();
  if (liveFails.length) {
    console.error(`${LABEL} --selftest FAIL: live tree not green:\n  - ${liveFails.join("\n  - ")}`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest: PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS (${fs.readdirSync(TIEOUT_DIR).filter((n) => n.endsWith(".mjs") && n !== "_lib.mjs").length} tieout scripts USMCA-pinned)`);
}
