#!/usr/bin/env node
/**
 * WAVE-A-DRIVER-CASH-FORECAST — manual expense projections persist a canonical,
 * company-owned driver id and reload it as a drillable driver label.
 *
 * @matrix-built {"modules":["accounting","cash-flow"],"cols":["driver"],"leafRe":"^(accounting\\.modal\\.decide|cash-flow\\.panel\\.projection)$","task":"WAVE-A-DRIVER-INLINE-SURFACES"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  ui: "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
  api: "apps/frontend/src/api/forecast.ts",
  route: "apps/backend/src/forecast/cash-forecast-manual.routes.ts",
  dispute: "apps/frontend/src/pages/accounting/DisputeQueuePage.tsx",
  disputeRoute: "apps/backend/src/accounting/disputes.routes.ts",
};

function failures(source) {
  const checks = [
    ["driver picker", source.ui.includes("<DriverPickerWithCreate")],
    ["driver id reaches payload", source.ui.includes("party_ref_id: form.party_ref_id || null")],
    ["reload restores driver id", source.ui.includes("party_ref_id: e.party_ref_id ?? \"\"")],
    ["forward driver drill", source.ui.includes('<EntityLink kind="driver" id={e.party_ref_id}')],
    ["client contract carries id", source.api.includes("party_ref_id: string | null")],
    ["backend accepts UUID only", source.route.includes("party_ref_id: z.string().uuid().nullish()")],
    ["backend scopes driver owner", /FROM mdata\.drivers[\s\S]*operating_company_id = \$2::uuid/.test(source.route)],
    ["backend resolves canonical label", source.route.includes("partyRefLabel = driver.rows[0].label")],
    ["dispute decision driver drill", source.dispute.includes('<EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />')],
    ["dispute queue company membership", /app\.get\("\/api\/v1\/disputes"[\s\S]*assertCompanyMembership\(user\.uuid, query\.data\.operating_company_id\)/.test(source.disputeRoute)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const source = Object.fromEntries(Object.entries(files).map(([key, rel]) => [key, fs.readFileSync(path.join(root, rel), "utf8")]));
if (process.argv.includes("--selftest")) {
  const broken = { ...source, route: source.route.replaceAll("operating_company_id = $2::uuid", "TRUE") };
  if (failures(broken).length === 0) {
    console.error("verify-cash-forecast-driver-linkage selftest FAIL — entity-scope mutation stayed green");
    process.exit(1);
  }
  console.log("verify-cash-forecast-driver-linkage selftest PASS — entity-scope mutation red");
}

const missing = failures(source);
if (missing.length) {
  console.error(`verify-cash-forecast-driver-linkage FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-cash-forecast-driver-linkage PASS — picker → UUID payload → company validation → reload label → EntityLink");
