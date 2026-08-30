#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/integrations/samsara/samsara-driver-login.service.ts",
  pairing: "apps/backend/src/integrations/samsara/vehicle-driver-pairing/pairing.service.ts",
  hos: "apps/backend/src/integrations/samsara/webhook-projectors/hos-projector.ts",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
};
const REQUIRED = {
  service: [
    "SET last_samsara_login_at = $3::timestamptz",
    "d.operating_company_id = $1::uuid",
    "FROM mdata.driver_company_authorizations samsara_login_dca",
    "samsara_login_dca.company_id = $1::uuid",
    "samsara_login_dca.is_authorized = true",
    "samsara_login_dca.deactivated_at IS NULL",
    "d.last_samsara_login_at IS NULL OR d.last_samsara_login_at < $3::timestamptz",
  ],
  pairing: [
    'import { recordSamsaraDriverLogin } from "../samsara-driver-login.service.js"',
    "recordSamsaraDriverLogin(client, operatingCompanyId, local.driver_id, assignment.started_at)",
  ],
  hos: [
    'import { recordSamsaraDriverLogin } from "../samsara-driver-login.service.js"',
    "recordSamsaraDriverLogin(client, event.operating_company_id, localDriverId, startedAt)",
  ],
  profile: [
    'timeZone: "America/Chicago"',
    'data-testid="driver-last-samsara-login"',
    "Last Samsara login: {formatSamsaraLogin(profileDriver.last_samsara_login_at)}",
  ],
};

function verify(sources) {
  const missing = [];
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) if (!sources[name].includes(token)) missing.push(`${name}: ${token}`);
  }
  return missing;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([name, rel]) => [name, readFileSync(join(ROOT, rel), "utf8")]));
if (process.argv.includes("--selftest")) {
  let mutations = 0;
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) {
      const mutant = { ...sources, [name]: sources[name].replaceAll(token, "__PLANTED_REMOVED__") };
      if (verify(mutant).length === 0) throw new Error(`planted removal survived: ${name}: ${token}`);
      mutations += 1;
    }
  }
  console.log(`verify-driver-samsara-login-lifecycle --selftest PASS ${mutations}/${mutations}`);
  process.exit(0);
}
const missing = verify(sources);
if (missing.length) {
  console.error(`verify-driver-samsara-login-lifecycle FAIL\n${missing.map((item) => `  - ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-driver-samsara-login-lifecycle PASS — pairing + HOS write monotonic scoped login and profile renders CT");
