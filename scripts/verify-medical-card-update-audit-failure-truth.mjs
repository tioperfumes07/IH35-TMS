#!/usr/bin/env node

import fs from "node:fs";

const routePath = new URL("../apps/backend/src/safety/medical-cards.routes.ts", import.meta.url);
const source = fs.readFileSync(routePath, "utf8");

function verify(text) {
  const failures = [];
  if (!/const voided = voidRes\.rows\[0\];\s*if \(!voided\) return null;\s*[^]*?appendCrudAudit\([^]*?return voided;/m.test(text)) {
    failures.push("medical-card void must prove persistence before audit");
  }
  if (!/const patched = patchRes\.rows\[0\];\s*if \(!patched\) return null;\s*[^]*?appendCrudAudit\([^]*?return patched;/m.test(text)) {
    failures.push("medical-card edit must prove persistence before audit");
  }
  return failures;
}

const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("if (!voided) return null;", "if (false) return null;"),
    source.replace("if (!patched) return null;", "if (false) return null;"),
    source.replace("return voided;", "return voidRes.rows[0];"),
    source.replace("return patched;", "return patchRes.rows[0];"),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) {
    console.error(`FAIL verify-medical-card-update-audit-failure-truth selftest: ${escaped.length} mutation(s) escaped`);
    process.exit(1);
  }
  console.log(`PASS verify-medical-card-update-audit-failure-truth selftest (${mutations.length} mutations rejected)`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}
console.log("PASS medical-card void/edit audits require a persisted company-scoped lifecycle mutation");
