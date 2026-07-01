#!/usr/bin/env node
// CHAIN-04 static guard — locks the three gap-closure fixes so they can't regress (CLAUDE.md §2:
// every bug fix gets a static CI guard).
//
//   GAP #1  the bill-payment -> GL entrypoint is gated by BILL_PAYMENT_GL_POSTING_ENABLED (default
//           OFF), resolved per-entity via isEnabled() — never a global process.env read.
//   GAP #2  buildBillPaymentLines credits the REAL bank via banking.bank_accounts.ledger_account_id
//           and NEVER reads coa_account_id (the documented bug); A/P leg via ap_control resolver.
//   GAP #3  the poster refuses to post unless the bill's A/P leg is posted first (BILL_AP_NOT_POSTED).
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const enginePath = path.join(repoRoot, "apps/backend/src/accounting/posting-engine.service.ts");
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/bill-payment-gl.service.ts");
const routePath = path.join(repoRoot, "apps/backend/src/accounting/bill-payment-gl.routes.ts");
const migrationsDir = path.join(repoRoot, "db/migrations");

const failures = [];
function need(cond, msg) {
  if (!cond) failures.push(msg);
}

// ---- engine (buildBillPaymentLines) --------------------------------------------------------------
if (!fs.existsSync(enginePath)) {
  failures.push("missing apps/backend/src/accounting/posting-engine.service.ts");
} else {
  const src = fs.readFileSync(enginePath, "utf8");
  const start = src.indexOf("async function buildBillPaymentLines");
  const body = start >= 0 ? src.slice(start, src.indexOf("\n}\n", start) + 3) : "";
  need(start >= 0, "buildBillPaymentLines not found in posting-engine.service.ts");

  // Bank-leg resolver body (the only place the bill-payment CR bank is resolved).
  const rStart = src.indexOf("async function resolveBankLedgerAccountId");
  const rBody = rStart >= 0 ? src.slice(rStart, src.indexOf("\n}\n", rStart) + 3) : "";
  need(rStart >= 0, "resolveBankLedgerAccountId helper not found in posting-engine.service.ts");

  // GAP #2 — bank leg fix: resolve the REAL bank via banking.bank_accounts.ledger_account_id, never
  // via a coa_account_id column (which does not exist on banking.bank_accounts — the documented bug).
  need(
    /FROM\s+banking\.bank_accounts/.test(rBody) && /ledger_account_id/.test(rBody),
    "resolveBankLedgerAccountId must SELECT ledger_account_id FROM banking.bank_accounts"
  );
  need(
    !/coa_account_id/.test(rBody) && !/coa_account_id/.test(body),
    "the bill-payment bank leg must NOT read coa_account_id (does not exist on banking.bank_accounts — the CHAIN-04 bug)"
  );
  need(
    /resolveBankLedgerAccountId\(/.test(body),
    "buildBillPaymentLines must resolve the payment's from_bank_account_id via resolveBankLedgerAccountId()"
  );
  need(
    /resolveApAccountForCompany\(/.test(body),
    "buildBillPaymentLines must debit A/P via the ap_control resolver (resolveApAccountForCompany), never a hardcoded account"
  );

  // GAP #3 — bill-posted-first guard.
  need(
    /getPostingBySource\(\s*client\s*,\s*operatingCompanyId\s*,\s*"bill"/.test(body),
    "buildBillPaymentLines must verify the bill's A/P leg is posted first (getPostingBySource(..,'bill',..))"
  );
  need(
    /BILL_AP_NOT_POSTED/.test(body),
    "buildBillPaymentLines must throw BILL_AP_NOT_POSTED when the bill's A/P leg isn't posted (no negative A/P)"
  );
}

// ---- GAP #1 — flag-gated entrypoint --------------------------------------------------------------
for (const [p, name] of [
  [servicePath, "bill-payment-gl.service.ts"],
  [routePath, "bill-payment-gl.routes.ts"],
]) {
  need(fs.existsSync(p), `missing apps/backend/src/accounting/${name}`);
}
if (fs.existsSync(servicePath)) {
  const svc = fs.readFileSync(servicePath, "utf8");
  need(
    /BILL_PAYMENT_GL_POSTING_FLAG_KEY\s*=\s*"BILL_PAYMENT_GL_POSTING_ENABLED"/.test(svc),
    "service must define BILL_PAYMENT_GL_POSTING_FLAG_KEY = 'BILL_PAYMENT_GL_POSTING_ENABLED'"
  );
  need(/isEnabled\(/.test(svc), "service must gate posting via isEnabled() (per-entity flag resolution)");
  need(
    /posting_disabled/.test(svc),
    "service must NO-OP (return posting_disabled) when the flag is OFF for the entity"
  );
}
if (fs.existsSync(routePath)) {
  const route = fs.readFileSync(routePath, "utf8");
  need(/isBillPaymentGlPostingEnabled\(/.test(route), "route must resolve the flag before posting");
  need(/\.code\(409\)/.test(route), "route must return 409 when the flag is OFF");
}

// ---- migration registers the flag, default OFF ---------------------------------------------------
const flagMigration = fs
  .readdirSync(migrationsDir)
  .find((f) => /bill_payment_gl_posting_flag\.sql$/.test(f));
need(!!flagMigration, "missing db/migrations/*_bill_payment_gl_posting_flag.sql");
if (flagMigration) {
  const sql = fs.readFileSync(path.join(migrationsDir, flagMigration), "utf8");
  need(/BILL_PAYMENT_GL_POSTING_ENABLED/.test(sql), "flag migration must register BILL_PAYMENT_GL_POSTING_ENABLED");
  need(
    /lib\.feature_flags/.test(sql) && /false/.test(sql),
    "flag migration must insert into lib.feature_flags with default_enabled=false (OFF)"
  );
}

if (failures.length > 0) {
  console.error("verify:bill-payment-posting-uses-resolver — FAILED");
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log("verify:bill-payment-posting-uses-resolver — OK");
