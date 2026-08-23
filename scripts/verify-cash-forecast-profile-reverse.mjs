#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow","vendors","customers","drivers","fleet"],"cols":["connectivity","reverse_link"],"leafRe":"^cash-flow\\.panel\\.projection$","task":"VERTICAL-REVERSE-LINK-CASH-FORECAST-PROFILES"} */
import fs from "node:fs";

const LABEL = "verify-cash-forecast-profile-reverse";
const paths = {
  route: "apps/backend/src/forecast/cash-forecast-manual.routes.ts",
  api: "apps/frontend/src/api/forecast.ts",
  panel: "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
  reverse: "apps/frontend/src/components/cash-flow/CashForecastReverseSection.tsx",
  driver: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  unit: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  customer: "apps/frontend/src/pages/CustomerDetail.tsx",
  vendor: "apps/frontend/src/pages/VendorDetail.tsx",
};
const source = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

const checks = [
  ["route accepts party UUID filter", "route", /party_ref_id: z\.string\(\)\.uuid\(\)\.optional\(\)/],
  ["route binds validated party identity to the canonical TEXT snapshot column", "route", /values\.push\(q\.data\.party_ref_id\)[\s\S]{0,260}party_ref_id = \$\$\{values\.length\}::text/],
  ["route accepts unit external identity filter", "route", /ref_external_id: z\.string\(\)[^\n]*\.optional\(\)/],
  ["route binds unit external identity predicate", "route", /values\.push\(q\.data\.ref_external_id\)[\s\S]{0,100}ref_external_id = \$\$\{values\.length\}/],
  ["route accepts exact entry UUID", "route", /entry_id: z\.string\(\)\.uuid\(\)\.optional\(\)/],
  ["route binds exact entry UUID predicate", "route", /values\.push\(q\.data\.entry_id\)[\s\S]{0,100}id = \$\$\{values\.length\}::uuid/],
  ["API serializes every supplied reverse filter", "api", /for \(const \[key, value\] of Object\.entries\(filters\)\)[\s\S]{0,120}params\.set\(key, value\)/],
  ["reverse cache binds company and complete filter", "reverse", /queryKey: \["cash-forecast-reverse", operatingCompanyId, filter\]/],
  ["reverse GET sends company and complete filter", "reverse", /listForecastEntries\(operatingCompanyId, undefined, undefined, filter\)/],
  ["reverse query waits for selected company", "reverse", /enabled: Boolean\(operatingCompanyId\)/],
  ["reverse keeps honest error state", "reverse", /query\.isError[\s\S]{0,120}Cash projections unavailable/],
  ["reverse keeps honest empty state", "reverse", /No linked cash projections/],
  ["each returned entry drills by exact canonical ID", "reverse", /preview\.map\(\(entry\) =>[\s\S]{0,100}<li key=\{entry\.id\}>[\s\S]{0,120}kind="cash_forecast_entry"[\s\S]{0,80}id=\{entry\.id\}/],
  ["each returned entry uses human date/money/direction label", "reverse", /label=\{`\$\{entry\.entry_date\} · \$\{\(entry\.amount_cents \/ 100\)\.toLocaleString[\s\S]{0,160}\$\{entry\.direction\}`\}/],
  ["panel reads exact entry deep link", "panel", /searchParams\.get\("entry_id"\)/],
  ["panel forwards exact entry filter", "panel", /entry_id: entryId/],
  ["driver profile mounts canonical driver filter", "driver", /<CashForecastReverseSection[\s\S]{0,180}party_ref_kind: "driver", party_ref_id: id/],
  ["customer profile mounts canonical customer filter", "customer", /<CashForecastReverseSection[\s\S]{0,180}party_ref_kind: "customer", party_ref_id: id/],
  ["vendor profile mounts canonical vendor filter", "vendor", /<CashForecastReverseSection[\s\S]{0,180}party_ref_kind: "vendor", party_ref_id: vendor\.id/],
  ["unit profile mounts canonical unit filter", "unit", /<CashForecastReverseSection[\s\S]{0,180}ref_kind: "unit", ref_external_id: id/],
];

function audit(sources) {
  const failures = checks.filter(([, key, pattern]) => !pattern.test(sources[key])).map(([message]) => message);
  if (/party_ref_id = \$\$\{values\.length\}::uuid/.test(sources.route)) {
    failures.push("route never compares the TEXT party snapshot column with a UUID parameter");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = audit(source);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — baseline: ${baseline.join("; ")}`);
    process.exit(1);
  }
  for (const [message, key, pattern] of checks) {
    const changedSource = source[key].replace(pattern, "/* planted cash-forecast reverse defect */");
    if (changedSource === source[key] || !audit({ ...source, [key]: changedSource }).includes(message)) {
      console.error(`${LABEL} SELFTEST FAIL — escaped or inert plant: ${message}`);
      process.exit(1);
    }
  }
  const uuidMutation = source.route.replace(
    /party_ref_id = \$\$\{values\.length\}::text/,
    () => 'party_ref_id = $${values.length}::uuid'
  );
  if (!audit({ ...source, route: uuidMutation }).includes("route never compares the TEXT party snapshot column with a UUID parameter")) {
    console.error(`${LABEL} SELFTEST FAIL — production text-to-uuid mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length + 1}/${checks.length + 1} production-source defects caught`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — company-scoped party/unit filters→exact cash entry→vendor/customer/driver/unit reverse`);
