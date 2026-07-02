#!/usr/bin/env node
// CODER-34 regression guard — keeps the factoring GL poster on the SECURED-BORROWING model and off the
// SALE model it was rebuilt from. Static analysis of the poster source + the COA/roles migration.
//
// FAILS when:
//   1. the factoring FUNDING poster emits a `customer_payment` source type (the sale-model defect) or routes
//      through postSourceTransaction (the sale-model path).
//   2. the FUNDING path credits `ar_control` at advance time (borrowing keeps A/R untouched at funding).
//   3. the FUNDING entry has no `factoring_advance_liability` CREDIT (the missing-liability defect).
//   4. `factor_fee_expense` is not parented under "Interest & Financing" (borrowing fee = interest, not
//      COGS/loss-on-sale) — checked in the migration (account parent + role binding).
//   5. a factoring role/account can resolve outside the invoice's operating company (resolver must pin
//      operating_company_id).
//
// Pure filesystem/string analysis — no DB, no network. Mirrors the other scripts/verify-*.mjs guards.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const POSTER = path.join(ROOT, "apps/backend/src/accounting/factoring-posting/poster.service.ts");
const RESOLVER = path.join(ROOT, "apps/backend/src/accounting/coa-roles/resolver.service.ts");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");

const failures = [];
function fail(msg) {
  failures.push(msg);
}
function read(file) {
  return fs.readFileSync(file, "utf8");
}

// Extract the body of an `export async function <name>(` block up to the next top-level `export ` or EOF.
function extractFn(src, name) {
  const startRe = new RegExp(`export async function ${name}\\b`);
  const m = startRe.exec(src);
  if (!m) return null;
  const rest = src.slice(m.index + m[0].length);
  const nextExport = /\nexport (?:async function|type|const|class)\b/.exec(rest);
  return rest.slice(0, nextExport ? nextExport.index : rest.length);
}

// ---------------------------------------------------------------------------------------------------
if (!fs.existsSync(POSTER)) {
  fail(`poster not found at ${POSTER}`);
} else {
  const poster = read(POSTER);

  // (1) no sale-model customer_payment / posting-engine routing anywhere in the poster.
  if (/["']customer_payment["']/.test(poster)) {
    fail("poster references a `customer_payment` source type — the sale model. Funding must post a secured-borrowing JE (Cr factoring_advance_liability), never a customer payment against A/R.");
  }
  if (/postSourceTransaction\s*\(/.test(poster)) {
    fail("poster calls postSourceTransaction — the sale-model path (Dr Cash / Cr A/R). Use createJournalEntry with the borrowing legs instead.");
  }

  const funding = extractFn(poster, "postFactoringAdvanceEvent");
  if (!funding) {
    fail("could not locate postFactoringAdvanceEvent (the funding poster) in poster.service.ts");
  } else {
    // (2) funding must not RESOLVE ar_control (A/R stays on the books at funding). Check the quoted role
    // argument (a resolveRoleAccount(..., "ar_control") call) — not prose in comments.
    if (/["']ar_control["']/.test(funding)) {
      fail("the funding poster (postFactoringAdvanceEvent) resolves ar_control — funding must NOT credit/clear A/R under secured borrowing (A/R clears only when the customer pays FARO).");
    }
    // (3) funding must credit factoring_advance_liability.
    if (!/factoring_advance_liability/.test(funding)) {
      fail("the funding poster does not resolve factoring_advance_liability — the advance MUST be recorded as a liability credit.");
    }
    const liabilityCreditRe = /factoring_advance_liability[\s\S]*?debit_or_credit:\s*["']credit["']/;
    const creditThenLiabilityRe = /debit_or_credit:\s*["']credit["'][\s\S]*?liabilityAccountId/;
    if (!liabilityCreditRe.test(funding) && !creditThenLiabilityRe.test(funding)) {
      fail("the funding poster does not credit the factoring_advance_liability account — the liability leg must be a CREDIT for the full net invoice.");
    }
  }

  // (5) every role resolution in the poster is pinned to input.operating_company_id (never a literal/other id).
  const resolveCalls = poster.match(/resolveRoleAccount\([^)]*\)/g) ?? [];
  for (const call of resolveCalls) {
    if (!/input\.operating_company_id/.test(call)) {
      fail(`a resolveRoleAccount call is not pinned to input.operating_company_id (cross-entity risk): ${call.replace(/\s+/g, " ")}`);
    }
  }
}

// (5 cont.) the resolver itself must pin operating_company_id when reading catalogs.accounts (entity isolation,
// even under lucia bypass). Assert the mapped + fallback queries carry an operating_company_id predicate.
if (!fs.existsSync(RESOLVER)) {
  fail(`resolver not found at ${RESOLVER}`);
} else {
  const resolver = read(RESOLVER);
  if (!/a\.operating_company_id\s*=\s*\$1::uuid/.test(resolver) && !/operating_company_id\s*=\s*\$2::uuid/.test(resolver)) {
    fail("resolver.service.ts does not pin catalogs.accounts.operating_company_id in its role resolution queries — a factoring role could resolve a foreign entity's account.");
  }
}

// (4) migration: Factoring Fees parented under Interest & Financing + role binding factor_fee_expense.
const migFiles = fs.existsSync(MIGRATIONS_DIR)
  ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.includes("factoring_secured_borrowing") && f.endsWith(".sql"))
  : [];
if (migFiles.length === 0) {
  fail("could not find the factoring secured-borrowing COA/roles migration (db/migrations/*factoring_secured_borrowing*.sql)");
} else {
  const mig = read(path.join(MIGRATIONS_DIR, migFiles[0]));
  const feesInsert = /'Factoring Fees'[\s\S]{0,300}?'Interest & Financing Expense'/;
  if (!feesInsert.test(mig)) {
    fail("migration does not create 'Factoring Fees' parented under 'Interest & Financing Expense' — the factoring fee must be an Interest & Financing expense (not COGS/loss-on-sale).");
  }
  const feeRoleBind = /'factor_fee_expense'[\s\S]{0,80}?'Factoring Fees'/;
  if (!feeRoleBind.test(mig)) {
    fail("migration does not bind role factor_fee_expense -> 'Factoring Fees'.");
  }
  if (!/'factoring_advance_liability'/.test(mig)) {
    fail("migration does not add the factoring_advance_liability role — the missing core liability account.");
  }
  if (!/'FACTORING_GL_POSTING_ENABLED'[\s\S]{0,400}?\bfalse\b/.test(mig)) {
    fail("migration must register FACTORING_GL_POSTING_ENABLED with default OFF (false).");
  }
}

if (failures.length) {
  console.error("verify-factoring-treatment FAILED — secured-borrowing invariants violated:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-factoring-treatment PASS — factoring poster is on the secured-borrowing model (no customer_payment, no A/R credit at funding, liability credit present, fee under Interest & Financing, per-entity pinned).");
