#!/usr/bin/env node
// ACCT-F11104 guard — the QuickBooks bill-payment evidence proposal stays READ-ONLY and honest.
//
// Asserts on the live tree:
//   1. The evidence service/route/matcher contain no SQL write (INSERT/UPDATE/DELETE/TRUNCATE), no write to a
//      mdata.qbo_* mirror, no feature-flag / blocked-flag write, and no QuickBooks write call — the mirror pull
//      stays blocked by the owner's ROUND 195 ruling and nothing here works around it by writing.
//   2. A row is postable ONLY when the bank side is unique AND the QBO payment is fully mapped.
//   3. QBO Bills and BillPayments dated before the cutover are filtered out (Transportation history), and an
//      app bill dated before the cutover is flagged in its own group.
//   4. The service refuses any company other than USMCA; the route is Owner/Administrator only and checks
//      company membership.
// --selftest plants each defect in an in-memory copy and requires the check to fail.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:qbo-bill-payment-evidence-readonly";
const FILES = {
  match: "apps/backend/src/accounting/qbo-bill-payment-evidence.match.ts",
  service: "apps/backend/src/accounting/qbo-bill-payment-evidence.service.ts",
  route: "apps/backend/src/accounting/qbo-bill-payment-evidence.routes.ts",
};

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

export function check(sources) {
  const errors = [];
  for (const [key, raw] of Object.entries(sources)) {
    const code = stripComments(raw);
    if (/\b(INSERT\s+INTO|UPDATE\s+[a-z_]+\.[a-z_]+\s+SET|DELETE\s+FROM|TRUNCATE)\b/i.test(code)) {
      errors.push(`${key}: contains a SQL write — the evidence proposal must be read-only`);
    }
    if (/mdata\.qbo_[a-z_]+/i.test(code)) errors.push(`${key}: touches a mdata.qbo_* mirror table`);
    if (/feature_flag_overrides|blocked_feature_flags/i.test(code)) errors.push(`${key}: touches feature-flag tables`);
    if (/\bqbo(Create|Update|Post|Delete|Write|Push|Send)[A-Za-z]*\s*\(/.test(code) || /method:\s*["']POST["']/.test(code)) {
      errors.push(`${key}: calls a QuickBooks write`);
    }
  }
  const match = stripComments(sources.match ?? "");
  if (!/r\.postable\s*=\s*r\.bank_status\s*===\s*"unique"\s*&&\s*r\.qbo_payment_fully_mapped\s*===\s*true/.test(match)) {
    errors.push("match: postable is not gated on bank_status === \"unique\" && qbo_payment_fully_mapped === true");
  }
  if (!/input\.qboBills\.filter\(\(b\)\s*=>\s*b\.txn_date\.slice\(0,\s*10\)\s*>=\s*cutover\)/.test(match)) {
    errors.push("match: QBO bills dated before the cutover are not filtered out");
  }
  if (!/input\.qboBillPayments\.filter\(\(p\)\s*=>\s*p\.txn_date\.slice\(0,\s*10\)\s*>=\s*cutover\)/.test(match)) {
    errors.push("match: QBO bill payments dated before the cutover are not filtered out");
  }
  if (!/group:\s*"pre_cutover_flagged"/.test(match)) errors.push("match: pre-cutover app bills are not flagged in their own group");
  const service = stripComments(sources.service ?? "");
  if (!/operating_company_id\s*!==\s*USMCA_COMPANY_ID[\s\S]{0,80}throw new QboEvidenceScopeError/.test(service)) {
    errors.push("service: does not refuse a non-USMCA company");
  }
  const route = stripComments(sources.route ?? "");
  if (!/assertCompanyMembership\(/.test(route)) errors.push("route: no company membership check");
  if (!/forbidden_owner_only/.test(route) || !/role === "Owner" \|\| role === "Administrator"/.test(route)) {
    errors.push("route: not Owner/Administrator only");
  }
  return errors;
}

function load() {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.error(`${LABEL} FAIL: missing ${rel}`);
      process.exit(1);
    }
    out[k] = fs.readFileSync(abs, "utf8");
  }
  return out;
}

function selftest() {
  const live = load();
  const base = check(live);
  if (base.length) {
    console.error(`${LABEL} SELFTEST FAIL: live tree not clean:\n- ${base.join("\n- ")}`);
    process.exit(1);
  }
  const plants = [
    ["service SQL write", (s) => ({ ...s, service: s.service + "\nawait client.query(`INSERT INTO accounting.bill_payments (id) VALUES ($1)`);\n" })],
    ["mirror write", (s) => ({ ...s, service: s.service + "\nconst t = 'mdata.qbo_ap_bill_payments';\n" })],
    ["flag unblock", (s) => ({ ...s, service: s.service + "\nconst t = 'catalogs.blocked_feature_flags';\n" })],
    ["QBO write call", (s) => ({ ...s, service: s.service + "\nawait qboCreateBillPayment(ctx, {});\n" })],
    ["postable without bank", (s) => ({ ...s, match: s.match.replace('r.postable = r.bank_status === "unique" && r.qbo_payment_fully_mapped === true', "r.postable = true") })],
    ["pre-cutover QBO bills kept", (s) => ({ ...s, match: s.match.replace("input.qboBills.filter((b) => b.txn_date.slice(0, 10) >= cutover)", "input.qboBills") })],
    ["pre-cutover QBO payments kept", (s) => ({ ...s, match: s.match.replace("input.qboBillPayments.filter((p) => p.txn_date.slice(0, 10) >= cutover)", "input.qboBillPayments") })],
    ["pre-cutover group dropped", (s) => ({ ...s, match: s.match.replace(/group: "pre_cutover_flagged"/g, 'group: "no_qbo_payment"') })],
    ["non-USMCA allowed", (s) => ({ ...s, service: s.service.replace("input.operating_company_id !== USMCA_COMPANY_ID", "false") })],
    ["membership check removed", (s) => ({ ...s, route: s.route.replace(/await assertCompanyMembership\([^)]*\);/, "") })],
    ["any role allowed", (s) => ({ ...s, route: s.route.replace('role === "Owner" || role === "Administrator"', "true") })],
  ];
  let failed = 0;
  for (const [name, plant] of plants) {
    const errs = check(plant(live));
    if (errs.length === 0) {
      console.error(`${LABEL} SELFTEST FAIL: planted defect "${name}" was NOT detected`);
      failed += 1;
    } else {
      console.log(`${LABEL} selftest: "${name}" detected (${errs[0]})`);
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS (${plants.length} planted defects detected)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const errs = check(load());
  if (errs.length) {
    console.error(`${LABEL} FAIL:\n- ${errs.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (3 files read-only, postable gated on unique bank + fully-mapped payment, pre-cutover excluded, USMCA-only, owner/admin only)`);
}
