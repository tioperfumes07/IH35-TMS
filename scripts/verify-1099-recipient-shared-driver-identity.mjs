#!/usr/bin/env node
/**
 * verify-1099-recipient-shared-driver-identity.mjs  (TAX-F6293)
 *
 * Root cause: the 1099-NEC batch generator aggregates settlement rows scoped by the SELECTED
 * company (driver_finance.driver_settlements.operating_company_id), which correctly includes an
 * authorized shared USMCA driver's rows. But the recipient-name writer then re-resolved the driver
 * via mdata.drivers WHERE id=$1 AND operating_company_id=$2 — home-company-only. For a shared
 * driver whose canonical mdata.drivers row lives on a different home company, that lookup returned
 * 0 rows and the draft 1099's recipient_name silently fell back to the literal string "Driver".
 *
 * Fix: admit the driver through home company OR an active canonical selected-company
 * authorization (mdata.driver_company_authorizations, is_authorized=true, deactivated_at IS NULL)
 * — the same predicate already used for this exact class of shared-driver identity resolution in
 * late-arrivals.service.ts / pre-dispatch-validator.service.ts.
 *
 * Usage:
 *   node scripts/verify-1099-recipient-shared-driver-identity.mjs            # scan
 *   node scripts/verify-1099-recipient-shared-driver-identity.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/tax-documents/tax-documents.routes.ts";
const LABEL = "verify-1099-recipient-shared-driver-identity";

const DRIVER_QUERY_RE =
  /SELECT d\.first_name, d\.last_name\s*FROM mdata\.drivers d\s*WHERE d\.id = \$1[\s\S]{0,400}?driver_company_authorizations[\s\S]{0,400}?is_authorized = true[\s\S]{0,200}?deactivated_at IS NULL/;
const HOME_COMPANY_RE = /d\.operating_company_id = \$2::uuid/;

export function check1099RecipientSharedDriverIdentity(src) {
  const offenders = [];
  if (!DRIVER_QUERY_RE.test(src)) {
    offenders.push(
      `${FILE}: 1099-NEC recipient-name driver lookup must admit home company OR an active ` +
        `mdata.driver_company_authorizations authorization for the selected company — a home-` +
        `company-only lookup silently falls back to the literal "Driver" for a shared driver.`,
    );
  }
  if (!HOME_COMPANY_RE.test(src)) {
    offenders.push(`${FILE}: 1099-NEC recipient-name driver lookup must still admit the driver's own home company.`);
  }
  return offenders;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const abs = path.join(ROOT, FILE);
  const good = fs.readFileSync(abs, "utf8");

  if (selftest) {
    let caught = 0;
    const goodOffenders = check1099RecipientSharedDriverIdentity(good);
    if (goodOffenders.length) {
      console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${goodOffenders.join("\n- ")}`);
      process.exit(1);
    }
    const homeOnlyMutated = `SELECT first_name, last_name FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`;
    if (!check1099RecipientSharedDriverIdentity(homeOnlyMutated).length) {
      console.error(`${LABEL} SELFTEST FAIL — home-company-only mutation escaped (real pre-fix shape not flagged)`);
      process.exit(1);
    }
    caught++;
    const dcaClauseRemoved = good.replace(
      /OR EXISTS \(\s*SELECT 1\s*FROM mdata\.driver_company_authorizations tax_1099_dca[\s\S]{0,300}?\)\s*\)/,
      "",
    );
    if (dcaClauseRemoved === good || !check1099RecipientSharedDriverIdentity(dcaClauseRemoved).length) {
      console.error(`${LABEL} SELFTEST FAIL — authorization-clause removal mutation escaped`);
      process.exit(1);
    }
    caught++;
    console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
    process.exit(0);
  }

  const offenders = check1099RecipientSharedDriverIdentity(good);
  if (offenders.length) {
    console.error(`${LABEL} FAIL\n- ${offenders.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — 1099-NEC recipient-name lookup admits home company OR active selected-company authorization`);
  process.exit(0);
}

main();
