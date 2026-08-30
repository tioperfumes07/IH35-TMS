#!/usr/bin/env node
/**
 * Cross-company master-data copy integrity (CURSOR-CORRECTION 2026-08-30).
 *
 * FAIL when source allows:
 *   - dest copy of qbo_customer_id / qbo_vendor_id
 *   - factoring.customer_factor_assignment INSERT without operating_company_id
 *   - missing approved survivor allowlist
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COPY = "scripts/run-mdata-copy-04-transp-to-usmca-once.mts";
const ASSIGN_SVC = "apps/backend/src/factoring/factor.service.ts";
const ALLOW = "docs/lockdown/USMCA-COPY-SURVIVOR-ALLOWLIST.md";
const SELFTEST = process.argv.includes("--selftest");

function analyze({ copySrc, assignSrc, allowExists }) {
  const failures = [];
  if (!/Never copies qbo_customer_id/.test(copySrc)) {
    failures.push(`${COPY}: must document never-copy of qbo_customer_id / qbo_vendor_id`);
  }
  const insertBlock = copySrc.match(/INSERT INTO mdata\.customers\s*\(([\s\S]*?)\)\s*(?:VALUES|SELECT)/i);
  if (insertBlock && /qbo_customer_id/.test(insertBlock[1])) {
    failures.push(`${COPY}: customer INSERT must not copy qbo_customer_id`);
  }
  const vendInsert = copySrc.match(/INSERT INTO mdata\.vendors\s*\(([\s\S]*?)\)\s*(?:VALUES|SELECT)/i);
  if (vendInsert && /qbo_vendor_id/.test(vendInsert[1])) {
    failures.push(`${COPY}: vendor INSERT must not copy qbo_vendor_id`);
  }

  const asg = assignSrc.match(
    /INSERT INTO factoring\.customer_factor_assignment \(([\s\S]*?)\)\s*VALUES/
  );
  if (!asg) {
    failures.push(`${ASSIGN_SVC}: missing customer_factor_assignment INSERT`);
  } else {
    const cols = asg[1].replace(/--[^\n]*/g, "");
    if (!/\boperating_company_id\b/.test(cols)) {
      failures.push(`${ASSIGN_SVC}: assignment INSERT must stamp operating_company_id (NULL opco is a copy defect)`);
    }
  }
  if (!allowExists) {
    failures.push(`${ALLOW}: approved survivor list missing`);
  }
  return failures;
}

function readAll() {
  return {
    copySrc: fs.readFileSync(path.join(ROOT, COPY), "utf8"),
    assignSrc: fs.readFileSync(path.join(ROOT, ASSIGN_SVC), "utf8"),
    allowExists: fs.existsSync(path.join(ROOT, ALLOW)),
  };
}

function selftest() {
  const real = readAll();
  const good = analyze(real);
  if (good.length) {
    console.error("verify-intercompany-copy-integrity --selftest FAIL on real files:");
    for (const f of good) console.error("  -", f);
    process.exit(1);
  }
  const plantedCopy = real.copySrc.replace(
    "customer_name, billing_email, billing_phone",
    "qbo_customer_id, customer_name, billing_email, billing_phone"
  );
  const qboIns = analyze({ ...real, copySrc: plantedCopy });
  if (!qboIns.some((x) => x.includes("qbo_customer_id"))) {
    console.error("selftest: qbo INSERT plant not caught");
    process.exit(1);
  }
  const noOpco = analyze({
    ...real,
    assignSrc: real.assignSrc.replace(/\n\s*operating_company_id\n/, "\n"),
  });
  if (!noOpco.some((x) => x.includes("operating_company_id"))) {
    console.error("selftest: omitted operating_company_id plant not caught");
    process.exit(1);
  }
  const noAllow = analyze({ ...real, allowExists: false });
  if (!noAllow.some((x) => x.includes("survivor"))) {
    console.error("selftest: missing allowlist plant not caught");
    process.exit(1);
  }
  console.log("verify-intercompany-copy-integrity --selftest: PASS");
}

if (SELFTEST) selftest();
else {
  const fails = analyze(readAll());
  if (fails.length) {
    console.error("verify-intercompany-copy-integrity: FAIL");
    for (const f of fails) console.error("  -", f);
    process.exit(1);
  }
  console.log("verify-intercompany-copy-integrity: PASS");
}
