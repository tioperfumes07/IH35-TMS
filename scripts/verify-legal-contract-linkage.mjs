#!/usr/bin/env node
/**
 * verify-step 12081 -- ROUND 316 legal linkage (§10-B).
 * FAILS IF: contract creation stops writing the real FKs / link rows (applyContractLinkage) or the signer's own FK;
 * a link target loses its entity scope; the extended link types disappear from code or migration; matters lose
 * customer / vendor / load (schema, scope checks, update); the matter reserve stops posting through the shared JE
 * service sourced to the matter; a signed lease contract stops stamping its lease.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-legal-contract-linkage";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const P = {
  link: "apps/backend/src/legal/contract-linkage.service.ts",
  contracts: "apps/backend/src/legal/contracts.service.ts",
  matters: "apps/backend/src/legal/matters.service.ts",
  // LST-F418: ec4136ce9b (LEGAL-F32603, #23952) moved the matter's reserve money here — a bill linked to the matter.
  money: "apps/backend/src/legal/legal-money.service.ts",
  routes: "apps/backend/src/legal/matters.routes.ts",
  handoff: "apps/backend/src/legal/signed-finance-handoff.service.ts",
  mig: "db/migrations/202615190100_legal_contract_and_matter_linkage.sql",
};
export function check(s) {
  const p = [];
  if (!/await applyContractLinkage\(client as never, \{/.test(s.contracts) || !/mergeLinks\(signerLinks\(input\.signer_type, input\.signer_entity_id\), input\.links \?\? \{\}\)/.test(s.contracts)) p.push(`${P.contracts}: contract creation no longer writes its linkage + signer FK.`);
  for (const k of ["customer_id", "vendor_id", "driver_id", "unit_ids", "equipment_ids", "load_id", "lease_contract_id", "invoice_ids", "bill_ids"]) if (!new RegExp(`${k}: \\{ linkType:`).test(s.link)) p.push(`${P.link}: link target ${k} missing.`);
  if (/scope: "id = \$1::uuid"[^\n]*\n[^\n]*customer/.test(s.link)) p.push(`${P.link}: a target lost its entity scope.`);
  for (const t of ["vendor", "load", "invoice", "bill", "equipment", "lease_contract"]) if (!s.mig.includes(`'${t}'`)) p.push(`${P.mig}: link type ${t} missing.`);
  for (const f of ["customer_id", "vendor_id", "load_id"]) {
    if (!new RegExp(`  ${f}: z\\.string\\(\\)\\.uuid\\(\\)\\.optional\\(\\)\\.nullable\\(\\)`).test(s.matters)) p.push(`${P.matters}: matter ${f} missing from the schema.`);
    if (!new RegExp(`push\\("${f}", input\\.${f}\\)`).test(s.matters)) p.push(`${P.matters}: matter update ignores ${f}.`);
  }
  if ((s.matters.match(/assertMatterPartyInCompany\(client, "mdata\.(customers|vendors|loads)"/g) ?? []).length < 6) p.push(`${P.matters}: matter customer/vendor/load not scope-checked on create + update.`);
  // The reserve posts as a bill linked to its matter (createBill … legalMatterId → the bill poster), and the matter is
  // stamped with the entry it produced. A raw JE was the old shape; A/P is written only by documents (ROUND 393.1).
  if (!/createBill\([\s\S]{0,600}?legalMatterId:/.test(s.money) || !/SET reserve_journal_entry_id = COALESCE\(\$3::uuid/.test(s.money)) p.push(`${P.money}: the matter reserve must post as a bill linked to the matter (createBill … legalMatterId) and stamp legal.matters.reserve_journal_entry_id.`);
  if (!/"\/api\/v1\/legal\/matters\/:id\/reserve"/.test(s.routes)) p.push(`${P.routes}: reserve route missing.`);
  if (!/UPDATE accounting\.lease_contract lc SET contract_instance_id = ci\.id/.test(s.handoff)) p.push(`${P.handoff}: a signed lease contract no longer stamps its lease.`);
  return p;
}
const real = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));
if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, s, f) => { const pr = check(s); if ((pr.length > 0) !== f) { console.error(`SELFTEST FAIL: ${n}: ${JSON.stringify(pr)}`); ok = false; } };
  ex("real", real, false);
  ex("linkage dropped", { ...real, contracts: real.contracts.replace("await applyContractLinkage(client as never, {", "await noop({") }, true);
  ex("matter load dropped from update", { ...real, matters: real.matters.replace('push("load_id", input.load_id)', 'void 0') }, true);
  ex("reserve not linked to its matter", { ...real, money: real.money.replace(/legalMatterId: [^,\n]+,/g, "") }, true);
  ex("reserve entry not stamped on the matter", { ...real, money: real.money.replace(/SET reserve_journal_entry_id = COALESCE\(\$3::uuid/g, "SET updated_at = COALESCE($3::uuid") }, true);
  ex("handoff stamp dropped", { ...real, handoff: real.handoff.replace("UPDATE accounting.lease_contract lc SET contract_instance_id = ci.id", "SELECT 1") }, true);
  console.log(ok ? `${LABEL} --selftest PASS (5/5)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = check(real);
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- contracts carry real FKs + link rows (entity-scoped), matters link customer/vendor/load, matter reserve posts as a bill linked to its matter, signed leases stamp back.`);
