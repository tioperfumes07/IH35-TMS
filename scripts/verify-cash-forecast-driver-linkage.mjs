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

/**
 * Whether SOME EntityLink/EntityLinkOrTombstone render, dynamically kind/id-bound to
 * e.party_ref_kind/e.party_ref_id, is gated by a driver-inclusive condition nearby.
 *
 * The naive single regex anchored on the FIRST `e.party_ref_kind === "driver"` in the whole file —
 * which is the reload/restore logic (`party_ref_kind: e.party_ref_kind === "driver" ? ... : ""`), not
 * the render condition next to the actual JSX, ~2000 chars later. Scanning every EntityLink(OrTombstone)
 * tag and checking its own immediate neighborhood (both directions, multi-line tolerant) finds the real
 * render regardless of what else in the file happens to mention the same driver-kind comparison first.
 */
function hasDriverForwardDrill(ui) {
  const tagRe = /<EntityLink(?:OrTombstone)?\b/g;
  let m;
  while ((m = tagRe.exec(ui))) {
    const before = ui.slice(Math.max(0, m.index - 400), m.index);
    if (!/party_ref_kind === "driver"/.test(before)) continue;
    const after = ui.slice(m.index, m.index + 400);
    if (/kind=\{e\.party_ref_kind\}/.test(after) && /id=\{e\.party_ref_id\}/.test(after)) return true;
  }
  return false;
}

function failures(source) {
  const checks = [
    ["driver picker", source.ui.includes("<DriverPickerWithCreate")],
    ["driver id reaches payload", source.ui.includes("party_ref_id: form.party_ref_id || null")],
    ["reload restores driver id", source.ui.includes("party_ref_id: e.party_ref_id ?? \"\"")],
    ["forward driver drill", hasDriverForwardDrill(source.ui)],
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
  const brokenDrill = { ...source, ui: source.ui.replaceAll("kind={e.party_ref_kind}", 'kind="unit"') };
  if (!failures(brokenDrill).includes("forward driver drill")) {
    console.error("verify-cash-forecast-driver-linkage selftest FAIL — dynamic EntityLink mutation stayed green");
    process.exit(1);
  }
  console.log("verify-cash-forecast-driver-linkage selftest PASS — entity-scope + dynamic EntityLink mutations red");
}

const missing = failures(source);
if (missing.length) {
  console.error(`verify-cash-forecast-driver-linkage FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-cash-forecast-driver-linkage PASS — picker → UUID payload → company validation → reload label → EntityLink");
