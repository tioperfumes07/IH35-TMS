#!/usr/bin/env node
/**
 * Lane defect A / WO item 2 — cash_dip on PRIMARY CoA roles + DIP path must not JOIN legacy bindings.
 *
 * FAIL shapes:
 *  - resolveDipBankAccountId still JOINs catalogs.account_role_bindings for cash_dip
 *  - COA_ROLE_VALUES missing cash_dip (backend or frontend)
 *  - held migration 202607760000 missing cash_dip in CHECK or not registered in .held-migrations.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FILES = {
  dip: "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  resolver: "apps/backend/src/accounting/coa-roles/resolver.service.ts",
  feApi: "apps/frontend/src/api/accounting.ts",
  migration: "db/migrations/202607760000_cash_dip_coa_role.sql",
  held: "db/migrations/.held-migrations.json",
};

function extractCoaRoles(source) {
  const m = source.match(/export const COA_ROLE_VALUES\s*=\s*\[([\s\S]*?)\]\s*as const;/);
  if (!m) return null;
  return [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);
}

function extractDipFn(source) {
  const start = source.indexOf("async function resolveDipBankAccountId");
  if (start < 0) return "";
  const end = source.indexOf("\nasync function ", start + 10);
  return source.slice(start, end < 0 ? undefined : end);
}

export function run(root = ROOT) {
  const failures = [];
  const dipSrc = fs.readFileSync(path.join(root, FILES.dip), "utf8");
  const resolverSrc = fs.readFileSync(path.join(root, FILES.resolver), "utf8");
  const feSrc = fs.readFileSync(path.join(root, FILES.feApi), "utf8");
  const migPath = path.join(root, FILES.migration);
  const heldPath = path.join(root, FILES.held);

  const dipFn = extractDipFn(dipSrc);
  if (!dipFn) failures.push(`${FILES.dip}: missing resolveDipBankAccountId`);
  if (/account_role_bindings/.test(dipFn)) {
    failures.push(`${FILES.dip}: resolveDipBankAccountId must NOT JOIN/read account_role_bindings for cash_dip`);
  }
  if (!/resolveRoleAccountOptional/.test(dipFn) || !/"cash_dip"/.test(dipFn)) {
    failures.push(`${FILES.dip}: resolveDipBankAccountId must call resolveRoleAccountOptional(..., "cash_dip")`);
  }

  const beRoles = extractCoaRoles(resolverSrc) ?? [];
  if (!beRoles.includes("cash_dip")) {
    failures.push(`${FILES.resolver}: COA_ROLE_VALUES missing cash_dip`);
  }
  const feRoles = extractCoaRoles(feSrc) ?? [];
  if (!feRoles.includes("cash_dip")) {
    failures.push(`${FILES.feApi}: COA_ROLE_VALUES missing cash_dip`);
  }

  if (!fs.existsSync(migPath)) {
    failures.push(`${FILES.migration}: missing held migration`);
  } else {
    const mig = fs.readFileSync(migPath, "utf8");
    if (!/DO NOT RUN ON PROD/i.test(mig) && !/DO NOT MERGE TO APPLY ON PROD/i.test(mig)) {
      failures.push(`${FILES.migration}: must carry DO-NOT-RUN-ON-PROD hold marker`);
    }
    if (!/'cash_dip'/.test(mig)) {
      failures.push(`${FILES.migration}: CHECK must include 'cash_dip'`);
    }
    // Superset markers — must keep prior settlement roles
    for (const role of ["abandonment_chargeback_recovery", "driver_pay_expense", "ar_control"]) {
      if (!new RegExp(`'${role}'`).test(mig)) {
        failures.push(`${FILES.migration}: CHECK missing prior role '${role}' (not a true supersets)`);
      }
    }
  }

  if (!fs.existsSync(heldPath)) {
    failures.push(`${FILES.held}: missing`);
  } else {
    const held = JSON.parse(fs.readFileSync(heldPath, "utf8"));
    const files = (held.held ?? []).map((h) => h.file);
    if (!files.includes("202607760000_cash_dip_coa_role.sql")) {
      failures.push(`${FILES.held}: must register 202607760000_cash_dip_coa_role.sql`);
    }
  }

  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync("/tmp/verify-cash-dip-");
  for (const rel of Object.values(FILES)) {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
  }
  fs.writeFileSync(
    path.join(tmp, FILES.dip),
    `
async function resolveDipBankAccountId(client, opco) {
  await client.query(\`SELECT ba.id FROM banking.bank_accounts ba
    JOIN catalogs.account_role_bindings arb ON arb.role_key = 'cash_dip'\`);
}
`
  );
  fs.writeFileSync(path.join(tmp, FILES.resolver), `export const COA_ROLE_VALUES = ["ar_control"] as const;`);
  fs.writeFileSync(path.join(tmp, FILES.feApi), `export const COA_ROLE_VALUES = ["ar_control"] as const;`);
  fs.writeFileSync(path.join(tmp, FILES.migration), `-- no hold\nCHECK (role IN ('ar_control'));\n`);
  fs.writeFileSync(path.join(tmp, FILES.held), JSON.stringify({ held: [] }));
  if (!run(tmp).length) throw new Error("selftest: bug shape must FAIL");

  fs.writeFileSync(
    path.join(tmp, FILES.dip),
    `
import { resolveRoleAccountOptional } from "../coa-roles/resolver.service.js";
async function resolveDipBankAccountId(client, opco) {
  const id = await resolveRoleAccountOptional(client, opco, "cash_dip");
  await client.query(\`SELECT ba.id FROM banking.bank_accounts ba WHERE ba.ledger_account_id = $1\`, [id]);
}
`
  );
  fs.writeFileSync(
    path.join(tmp, FILES.resolver),
    `export const COA_ROLE_VALUES = ["ar_control", "cash_dip"] as const;`
  );
  fs.writeFileSync(path.join(tmp, FILES.feApi), `export const COA_ROLE_VALUES = ["ar_control", "cash_dip"] as const;`);
  fs.writeFileSync(
    path.join(tmp, FILES.migration),
    `-- DO NOT RUN ON PROD\nCHECK (role IN ('ar_control','driver_pay_expense','abandonment_chargeback_recovery','cash_dip'));\n`
  );
  fs.writeFileSync(
    path.join(tmp, FILES.held),
    JSON.stringify({ held: [{ file: "202607760000_cash_dip_coa_role.sql" }] })
  );
  const good = run(tmp);
  if (good.length) throw new Error("selftest: fixed shape must PASS: " + good.join("; "));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-cash-dip-coa-primary-role --selftest OK");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const f = run();
    if (f.length) {
      console.error(f.join("\n"));
      process.exit(1);
    }
    console.log("verify-cash-dip-coa-primary-role — OK");
  }
}
