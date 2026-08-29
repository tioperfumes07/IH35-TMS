#!/usr/bin/env node
/** @matrix-built {"modules":["banking"],"cols":["transfers","connectivity"],"leaves":["banking.transfers.balance_update_verified"],"task":"BANK-TRANSFER-BALANCE-DUAL-WRITER-CONFLICT","vertical":"column-wave"} */
/**
 * BANK-TRANSFER-BALANCE-DUAL-WRITER-CONFLICT (GO-0027 drain, CC-1, 2026-08-28): the board finding's
 * larger design question (whether banking.transfers should even be allowed against Plaid-linked
 * accounts) is a domain/architecture call left open for a future pass, but the finding's own text
 * explicitly calls out one uncontroversial, independently-fixable half: "Also add the missing
 * zero-rows check to updateBankBalance() regardless of which design is chosen." Root-caused live:
 * apps/backend/src/banking/transfers.service.ts's updateBankBalance() ran a bare UPDATE with no
 * RETURNING/rowCount check — if the target account was deactivated between an earlier
 * validateAccountOwnership call and this call (revokeTransfer's path does not even re-validate
 * first), the balance adjustment silently no-oped with zero signal while the transfer itself was
 * still recorded as successful. Fixed to add RETURNING id + throw on zero rows. This guard holds
 * that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-transfer-bank-balance-update-zero-rows-check.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/banking/transfers.service.ts",
};
const LABEL = "verify-transfer-bank-balance-update-zero-rows-check";

export function audit(src) {
  const failures = [];
  const fnMatch = src.service.match(
    /async function updateBankBalance\([\s\S]*?\n\}/,
  );
  if (!fnMatch) {
    failures.push(`${FILES.service}: updateBankBalance() not found`);
    return failures;
  }
  const body = fnMatch[0];
  if (!/RETURNING id/.test(body)) {
    failures.push(
      `${FILES.service}: updateBankBalance()'s UPDATE must carry a RETURNING clause so the caller ` +
        `can detect a zero-row update`,
    );
  }
  if (!/rowCount[\s\S]{0,40}===\s*0/.test(body) && !/\(res\.rowCount \?\? 0\) === 0/.test(body)) {
    failures.push(
      `${FILES.service}: updateBankBalance() must check rowCount and throw on zero rows — otherwise ` +
        `a balance adjustment against a deactivated/missing account silently no-ops while the ` +
        `transfer itself is still recorded as successful`,
    );
  }
  if (!/throw new Error\("bank_balance_update_zero_rows"\)/.test(body)) {
    failures.push(
      `${FILES.service}: updateBankBalance() must throw a named error on the zero-row case, not swallow it`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const noReturning = {
    ...good,
    service: good.service.replace(
      "        AND operating_company_id = $2::uuid\n      RETURNING id\n    `,\n    [accountId, operatingCompanyId, deltaCents]",
      "        AND operating_company_id = $2::uuid\n    `,\n    [accountId, operatingCompanyId, deltaCents]",
    ),
  };
  if (noReturning.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — RETURNING-removal pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(noReturning).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — RETURNING removal escaped`);
    process.exit(1);
  }
  const noThrow = {
    ...good,
    service: good.service.replace(
      '  if ((res.rowCount ?? 0) === 0) {\n    throw new Error("bank_balance_update_zero_rows");\n  }\n',
      "",
    ),
  };
  if (noThrow.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — rowCount-check-removal pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(noThrow).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — rowCount check removal escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 2 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — updateBankBalance() detects and refuses a silent zero-row balance update`);
