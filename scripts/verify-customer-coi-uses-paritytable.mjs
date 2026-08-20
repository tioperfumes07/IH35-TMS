#!/usr/bin/env node
/**
 * verify-customer-coi-uses-paritytable — qbo-parity-a1 (shared CoiTab surface)
 *
 * Customer COI requests (Customers list + CustomerDetail mounts) must use shared
 * ParityTable grammar (sort/resize/gear), not a hand-rolled <table>. Query failures
 * must surface ListErrorState (never false-empty on outage).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-coi-uses-paritytable";
const PAGE = "apps/frontend/src/pages/customers/CoiTab.tsx";
const SERVICE = "apps/backend/src/insurance/coi.service.ts";

const REQUIRED_LABELS = ["Requested", "Status", "Date", "Requester User", "Policy Reference"];

function assertMigrated(src, service = "") {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("ParityTable")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey={isFullPage ? "customer-coi-requests-tab" : "customer-coi-requests"}')) {
    errors.push(`${PAGE}: must set list-preview vs full-page storageKey`);
  }
  if (!src.includes("No COI requests yet.")) {
    errors.push(`${PAGE}: must keep emptyText for empty COI list`);
  }
  if (!src.includes("Couldn't load COI requests")) {
    errors.push(`${PAGE}: must keep ListErrorState title for COI outage`);
  }
  if (!src.includes("+ Create COI")) {
    errors.push(`${PAGE}: must keep + Create COI primary CTA`);
  }
  if (!src.includes('variant="list-preview"') && !src.includes("list-preview")) {
    errors.push(`${PAGE}: must support list-preview variant (CustomerCOITab mount)`);
  }
  if (!src.includes("full-page")) {
    errors.push(`${PAGE}: must support full-page variant (CoiRequestsTab mount)`);
  }
  if (src.includes("Failed to load COI requests.")) {
    errors.push(`${PAGE}: must not use bare red outage banner (use ListErrorState)`);
  }
  if (!/kind="user"[\s\S]{0,180}?label=\{entityLabel\(request\.requested_by_name,\s*request\.requested_by,\s*"User"\)\}/.test(src)) {
    errors.push(`${PAGE}: requester column must drill to the user with its entity-scoped human label`);
  }
  if (!/kind="insurance_policy"[\s\S]{0,180}?label=\{entityLabel\(request\.policy_number,\s*request\.policy_id,\s*"Policy"\)\}/.test(src)) {
    errors.push(`${PAGE}: policy column must drill to the policy with its entity-scoped human label`);
  }
  if (service) {
    if (!/JOIN org\.user_company_access uca[\s\S]{0,220}?uca\.company_id = r\.tenant_id/.test(service)) {
      errors.push(`${SERVICE}: requester label join must be scoped through company membership`);
    }
    if (!/JOIN identity\.users u[\s\S]{0,180}?u\.id = uca\.user_id/.test(service) || !/AS requested_by_name/.test(service)) {
      errors.push(`${SERVICE}: list query must resolve requested_by_name`);
    }
    if (!/JOIN insurance\.policy p[\s\S]{0,180}?p\.tenant_id = r\.tenant_id/.test(service) || !/p\.policy_number/.test(service)) {
      errors.push(`${SERVICE}: list query must resolve policy_number with tenant scope`);
    }
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable } from "../../components/parity/ParityTable";
    export type CoiTabVariant = "list-preview" | "full-page";
    <ListErrorState title="Couldn't load COI requests" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey={isFullPage ? "customer-coi-requests-tab" : "customer-coi-requests"}
      emptyText={isFullPage ? "No COI requests yet." : "No COI requests yet for this customer."}
      columns={[
        { key: "requested_at", label: "Requested" },
        { key: "status", label: "Status" },
        { key: "requested_at", label: "Date" },
        { key: "requested_by", label: "Requester User", render: (request) => <EntityLink kind="user" id={request.requested_by} label={entityLabel(request.requested_by_name, request.requested_by, "User")} /> },
        { key: "policy_id", label: "Policy Reference", render: (request) => <EntityLink kind="insurance_policy" id={request.policy_id} label={entityLabel(request.policy_number, request.policy_id, "Policy")} /> },
      ]}
    />
    + Create COI
  `;
  const bad = `
    export function CoiTab() {
      return (
        <div>
          <div className="text-red-700">Failed to load COI requests.</div>
          <table><thead><tr><th>Requested</th></tr></thead></table>
        </div>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  const rawRequesterErrors = assertMigrated(good.replace(
    'label={entityLabel(request.requested_by_name, request.requested_by, "User")}',
    'label={request.requested_by}'
  ));
  const rawPolicyErrors = assertMigrated(good.replace(
    'label={entityLabel(request.policy_number, request.policy_id, "Policy")}',
    'label={request.policy_id}'
  ));
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  if (!rawRequesterErrors.some((error) => error.includes("requester column"))) {
    console.error(`${LABEL} --selftest FAIL raw requester mutation survived`);
    process.exit(1);
  }
  if (!rawPolicyErrors.some((error) => error.includes("policy column"))) {
    console.error(`${LABEL} --selftest FAIL raw policy mutation survived`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const service = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  const errors = assertMigrated(src, service);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + COI mounts preserved.`);
}

main();
