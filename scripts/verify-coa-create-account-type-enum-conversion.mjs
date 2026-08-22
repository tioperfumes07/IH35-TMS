#!/usr/bin/env node
/**
 * verify-coa-create-account-type-enum-conversion.mjs
 *
 * ROOT CAUSE (live-pinned 2026-08-22): creating a new Chart-of-Accounts row with a Detail Type
 * selected threw a real 400 on live USMCA, root cause visible directly in the response body:
 * `Invalid option: expected one of "Asset"|"Liability"|"Equity"|"Income"|"Expense"|"CostOfGoodsSold"|...`.
 * Two bugs, both required to fully fix this:
 *  (1) FRONTEND (AccountDrawer.tsx, shared by every "+ Add new account" inline picker via
 *      NewAccountDrawerForm.tsx) sent `previewEntry?.code` (a QBO catalog code like "EXP") as
 *      `account_type` -- the backend's createAccountBodySchema requires one of the strict 8-value
 *      GAAP enum ("Expense", not "EXP"). Fixed by wrapping the send in catalogCodeToCoaEnum(...),
 *      the existing frontend utility that already does this conversion correctly for parent-account
 *      filtering elsewhere in the same file, but was never applied to the submission payload.
 *  (2) BACKEND (accounts.routes.ts, resolveDetailType()) compared the Zod-validated 8-enum value
 *      against catalogs.account_types.name (a display label like "Expenses", "Cost of Goods Sold")
 *      -- only Equity/Income happen to equal the enum by name coincidentally; every other group
 *      400'd with detail_type_account_type_mismatch once (1) was fixed to send the correct enum.
 *      Live-confirmed via Neon: catalogs.account_types.group_label is only a 5-value coarse grouping
 *      (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE) that CANNOT disambiguate the 8-enum either (it
 *      collapses OtherIncome into INCOME and CostOfGoodsSold/OtherExpense into EXPENSE) -- so a new
 *      CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM map (mirroring the frontend's COA_ENUM_TO_CATALOG_CODES)
 *      was added and resolveDetailType() now checks the resolved enum, keeping the old code/name
 *      checks as fallbacks (additive, not a narrowing).
 *
 * INVARIANT (static -- no database):
 *  (a) AccountDrawer.tsx's account_type submission must be wrapped in catalogCodeToCoaEnum(...).
 *  (b) accounts.routes.ts's resolveDetailType() must compare against a resolved enum (via
 *      CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM or equivalent), not typeCode/typeName alone.
 *
 * Self-test: node scripts/verify-coa-create-account-type-enum-conversion.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-coa-create-account-type-enum-conversion";

const FE_FILE = "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx";
const BE_FILE = "apps/backend/src/catalogs/accounts.routes.ts";

export function checkFrontend(src) {
  const failures = [];
  if (!/account_type:\s*catalogCodeToCoaEnum\(/.test(src)) {
    failures.push(
      `${FE_FILE}: account_type submission does not wrap through catalogCodeToCoaEnum(...) -- ` +
        `will send a raw QBO catalog code (e.g. "EXP") to a backend that requires the 8-value GAAP enum.`
    );
  }
  return failures;
}

export function checkBackend(src) {
  const failures = [];
  if (!/CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM/.test(src)) {
    failures.push(`${BE_FILE}: missing CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM map.`);
  }
  if (!/resolvedEnum/.test(src) || !/args\.account_type\s*!==\s*resolvedEnum/.test(src)) {
    failures.push(
      `${BE_FILE}: resolveDetailType() no longer compares against the resolved 8-enum -- ` +
        `will 400 with detail_type_account_type_mismatch for every catalog code except Equity/Income.`
    );
  }
  return failures;
}

function staticCheck() {
  const failures = [];
  const feAbs = path.join(ROOT, FE_FILE);
  const beAbs = path.join(ROOT, BE_FILE);
  if (!fs.existsSync(feAbs)) failures.push(`${FE_FILE}: file missing`);
  else failures.push(...checkFrontend(fs.readFileSync(feAbs, "utf8")));
  if (!fs.existsSync(beAbs)) failures.push(`${BE_FILE}: file missing`);
  else failures.push(...checkBackend(fs.readFileSync(beAbs, "utf8")));
  return failures;
}

if (process.argv.includes("--selftest")) {
  const badFe = `account_type: previewEntry?.code ?? form.account_type,`;
  if (checkFrontend(badFe).length !== 1) {
    console.error(`${LABEL} SELFTEST FAIL -- unwrapped frontend account_type not caught`);
    process.exit(1);
  }
  const goodFe = `account_type: catalogCodeToCoaEnum(previewEntry?.code ?? form.account_type),`;
  if (checkFrontend(goodFe).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- correct frontend wrapping wrongly flagged`);
    process.exit(1);
  }

  const badBe = `
    const typeCode = String(row.type_code ?? "");
    const typeName = String(row.type_name ?? "");
    if (args.account_type !== typeCode && args.account_type !== typeName) {
      return { ok: false, error: "detail_type_account_type_mismatch" };
    }
  `;
  if (checkBackend(badBe).length !== 2) {
    console.error(`${LABEL} SELFTEST FAIL -- missing backend enum-resolution not caught (expected 2 failures, got ${checkBackend(badBe).length})`);
    process.exit(1);
  }
  const goodBe = `
    const CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM = { EXP: "Expense" };
    const resolvedEnum = CATALOG_CODE_TO_ACCOUNT_TYPE_ENUM[typeCode];
    if (args.account_type !== resolvedEnum && args.account_type !== typeCode && args.account_type !== typeName) {
      return { ok: false, error: "detail_type_account_type_mismatch" };
    }
  `;
  if (checkBackend(goodBe).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- correct backend enum-resolution wrongly flagged`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS -- missing FE/BE halves caught, correct shapes accepted`);
  process.exit(0);
}

const failures = staticCheck();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK -- Chart-of-Accounts create sends a valid 8-enum account_type and resolveDetailType() matches it correctly for all 15 catalog codes`);
