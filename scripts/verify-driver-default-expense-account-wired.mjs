#!/usr/bin/env node
/**
 * Guard 1509 — ACCT-F18 / banking-b4: driver default_expense_account_id is WIRED
 * (API read/write + banking categorize Option-B prefill). Column already on Neon
 * (mig 202607680000 applied_held). This guard fails if the active path regresses.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-default-expense-account-wired";

const ROUTES = "apps/backend/src/mdata/drivers.routes.ts";
const BANKING = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const AUTO = "apps/frontend/src/components/factoring/DriverAutocomplete.tsx";
const TYPES = "apps/frontend/src/types/api.ts";

export function check({ routes, banking, auto, types }) {
  const f = [];
  if (!routes) f.push(`${ROUTES}: missing`);
  else {
    if (!/default_expense_account_id:\s*z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/.test(routes)) {
      f.push(`${ROUTES}: updateDriverBodySchema must accept default_expense_account_id`);
    }
    if (!/if\s*\(\s*"default_expense_account_id"\s+in\s+b\s*\)\s*add\(\s*"default_expense_account_id"/.test(routes)) {
      f.push(`${ROUTES}: PATCH must write default_expense_account_id`);
    }
    if ((routes.match(/default_expense_account_id/g) || []).length < 5) {
      f.push(`${ROUTES}: SELECT/RETURNING lists must project default_expense_account_id`);
    }
    if (!/RECOMMENDATION ONLY/.test(routes)) {
      f.push(`${ROUTES}: must document Option-B RECOMMENDATION ONLY`);
    }
    // List SELECT must keep entity predicate IN the template (not only in ${whereClause}) —
    // verify-mdata-entity-scope fails when the hash changes without a visible predicate.
    const canonicalListScopes = routes.match(/WHERE \(operating_company_id = \$\$\{ociIdx\}::uuid OR EXISTS \([\s\S]{0,360}?canonical_list_dca\.company_id = \$\$\{ociIdx\}::uuid[\s\S]{0,180}?canonical_list_dca\.is_authorized = true[\s\S]{0,120}?canonical_list_dca\.deactivated_at IS NULL/g) ?? [];
    if (canonicalListScopes.length !== 2) {
      f.push(`${ROUTES}: count + list SELECTs must carry canonical ownership/active-authorization scope`);
    }
  }
  if (!banking) f.push(`${BANKING}: missing`);
  else {
    if (!/ACCT-F18|default_expense_account_id/.test(banking)) {
      f.push(`${BANKING}: must reference driver default_expense_account_id`);
    }
    if (!/accountId:\s*draft\.accountId\s*\|\|\s*driverAcct/.test(banking)) {
      f.push(`${BANKING}: DriverAutocomplete onChange must Option-B prefill accountId from driverAcct`);
    }
  }
  if (!auto) f.push(`${AUTO}: missing`);
  else if (!/default_expense_account_id:\s*driver\.default_expense_account_id/.test(auto)) {
    f.push(`${AUTO}: must pass default_expense_account_id in onChange meta`);
  }
  if (!types) f.push(`${TYPES}: missing`);
  else if (!/default_expense_account_id\?:/.test(types)) {
    f.push(`${TYPES}: Driver must include default_expense_account_id`);
  }
  return f;
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

export function run() {
  return check({
    routes: read(ROUTES),
    banking: read(BANKING),
    auto: read(AUTO),
    types: read(TYPES),
  });
}

function selftest() {
  const good = {
    routes: `// RECOMMENDATION ONLY
default_expense_account_id: z.string().uuid().nullable().optional(),
if ("default_expense_account_id" in b) add("default_expense_account_id", b.default_expense_account_id ?? null);
default_expense_account_id,
default_expense_account_id,
default_expense_account_id,
default_expense_account_id,
FROM mdata.drivers
WHERE (operating_company_id = $\${ociIdx}::uuid OR EXISTS (
  SELECT 1 FROM mdata.driver_company_authorizations canonical_list_dca
  WHERE canonical_list_dca.company_id = $\${ociIdx}::uuid
    AND canonical_list_dca.is_authorized = true
    AND canonical_list_dca.deactivated_at IS NULL
))
FROM mdata.drivers
WHERE (operating_company_id = $\${ociIdx}::uuid OR EXISTS (
  SELECT 1 FROM mdata.driver_company_authorizations canonical_list_dca
  WHERE canonical_list_dca.company_id = $\${ociIdx}::uuid
    AND canonical_list_dca.is_authorized = true
    AND canonical_list_dca.deactivated_at IS NULL
))`,
    banking: `// ACCT-F18
accountId: draft.accountId || driverAcct || "",
default_expense_account_id`,
    auto: `default_expense_account_id: driver.default_expense_account_id ?? null,`,
    types: `default_expense_account_id?: string | null;`,
  };
  const checks = [
    ["healthy wiring passes", check(good).length === 0],
    [
      "missing PATCH write caught",
      check({ ...good, routes: good.routes.replace(/if \("default_expense_account_id".*/, "") }).some((x) =>
        x.includes("PATCH"),
      ),
    ],
    [
      "missing banking prefill caught",
      check({ ...good, banking: "// nothing" }).some((x) => x.includes("DriverAutocomplete")),
    ],
    [
      "missing active authorization scope caught",
      check({ ...good, routes: good.routes.replaceAll("canonical_list_dca.is_authorized = true", "true") }).some((x) => x.includes("count + list")),
    ],
  ];
  const bad = checks.filter(([, ok]) => !ok);
  if (bad.length) {
    console.error(`${LABEL}: selftest FAIL`);
    for (const [n] of bad) console.error(" ", n);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const f = run();
  if (f.length) {
    console.error(`${LABEL}: FAIL`);
    for (const x of f) console.error(" -", x);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — driver default_expense_account_id API + banking Option-B prefill wired`);
}
