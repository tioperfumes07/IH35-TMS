#!/usr/bin/env node
/**
 * verify-driver-detail-uses-paritytable — qbo-parity-a1 (DriverDetail rate-history surface)
 *
 * The driver detail rate-history modal grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Query failures must surface
 * ListErrorState + Retry (never a silent empty table). Columns Date range / Amount /
 * Reason / Notes / Changed by / Changed at preserved; corrected-row strike-through
 * chrome and empty copy preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-detail-uses-paritytable";
const PAGE = "apps/frontend/src/pages/DriverDetail.tsx";
const AGGREGATE = "apps/backend/src/mdata/driver-aggregate.service.ts";
const ROUTES = "apps/backend/src/mdata/drivers.routes.ts";
const TYPES = "apps/frontend/src/types/api.ts";

const REQUIRED_LABELS = ["Date range", "Amount", "Reason", "Notes", "Changed by", "Changed at"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../components/parity/ParityTable"') &&
    !src.includes("from '../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on rate-history query failure`);
  }
  if (!/driverQuery\.isError[\s\S]{0,420}<ListErrorState[\s\S]{0,420}driverQuery\.refetch\(\)/.test(src)) {
    errors.push(`${PAGE}: driver detail failure must render retryable ListErrorState before not-found`);
  }
  for (const rawFallback of ["item.created_by_user_email || item.created_by_user_id", "event.voided_by_user_email || event.voided_by_user_id", "Last updated by {driver.updated_by_user_id}"]) {
    if (src.includes(rawFallback)) errors.push(`${PAGE}: raw UUID display fallback remains: ${rawFallback}`);
  }
  if (/>\s*\{driver\.prior_driver_id\}\s*</.test(src)) {
    errors.push(`${PAGE}: prior driver UUID must not be visible link copy`);
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
  if (!src.includes('storageKey="driver-rate-history"')) {
    errors.push(`${PAGE}: must set storageKey="driver-rate-history"`);
  }
  if (!src.includes('tableTestId="driver-rate-history-table"')) {
    errors.push(`${PAGE}: must set tableTestId="driver-rate-history-table"`);
  }
  if (!src.includes("Couldn't load rate history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for rate-history outage`);
  }
  if (!src.includes("No rate history found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty rate history`);
  }
  if (!src.includes("Corrected")) {
    errors.push(`${PAGE}: must keep the Corrected badge on same-day corrected rates`);
  }
  return errors;
}

function assertUpdater(srcs) {
  const errors = [];
  if (!/AS updated_by_user_label/.test(srcs.aggregate)) errors.push(`${AGGREGATE}: aggregate must project updater label`);
  if (!/LEFT JOIN identity\.users updater ON updater\.id = d\.updated_by_user_id/.test(srcs.aggregate)) errors.push(`${AGGREGATE}: aggregate must join canonical updater`);
  if (!/WHERE updater\.id = mdata\.drivers\.updated_by_user_id[\s\S]{0,80}AS updated_by_user_label/.test(srcs.routes)) errors.push(`${ROUTES}: flat driver read must project canonical updater label`);
  if (!/updated_by_user_label: string \| null/.test(srcs.types)) errors.push(`${TYPES}: Driver must type updater label`);
  if (!/<EntityLinkOrTombstone kind="user" id=\{driver\.updated_by_user_id\} name=\{driver\.updated_by_user_label\} noun="User" \/>/.test(srcs.page)) errors.push(`${PAGE}: footer must consume updater id/label through tombstone-safe identity`);
  return errors;
}

const readUpdater = () => ({
  page: fs.readFileSync(path.join(ROOT, PAGE), "utf8"),
  aggregate: fs.readFileSync(path.join(ROOT, AGGREGATE), "utf8"),
  routes: fs.readFileSync(path.join(ROOT, ROUTES), "utf8"),
  types: fs.readFileSync(path.join(ROOT, TYPES), "utf8"),
});

function selftest() {
  const good = `
    import { ListErrorState } from "../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../components/parity/ParityTable";
    const COLUMNS = [
      { key: "effective_from", label: "Date range" },
      { key: "amount", label: "Amount" },
      { key: "change_reason", label: "Reason" },
      { key: "change_notes", label: "Notes" },
      { key: "created_by_user_email", label: "Changed by" },
      { key: "created_at", label: "Changed at" },
    ];
    <span>Corrected</span>
    <ListErrorState title="Couldn't load rate history" status={0} onRetry={() => {}} />
    {driverQuery.isError ? <ListErrorState onRetry={() => void driverQuery.refetch()} /> : null}
    <ParityTable
      storageKey="driver-rate-history"
      tableTestId="driver-rate-history-table"
      emptyText="No rate history found."
    />
  `;
  const bad = `
    export function DriverDetailPage() {
      return (
        <div>
          <table><thead><tr><th>Date range</th></tr></thead></table>
        </div>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  const live = readUpdater();
  const mutations = [
    ["aggregate", "AS updated_by_user_label", "AS missing_updater_label"],
    ["aggregate", "LEFT JOIN identity.users updater ON updater.id = d.updated_by_user_id", "LEFT JOIN identity.users updater ON FALSE"],
    ["routes", "WHERE updater.id = mdata.drivers.updated_by_user_id", "WHERE FALSE"],
    ["types", "updated_by_user_label: string | null", "updated_by_user_label?: string | null"],
    ["page", '<EntityLinkOrTombstone kind="user" id={driver.updated_by_user_id} name={driver.updated_by_user_label} noun="User" />', '<EntityLink kind="user" id={driver.updated_by_user_id} label="User" />'],
  ];
  for (const [key, from, to] of mutations) {
    if (!live[key].includes(from) || !assertUpdater({ ...live, [key]: live[key].replace(from, to) }).length) {
      console.error(`${LABEL} --selftest FAIL updater mutation: ${key} ${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = [...assertMigrated(src), ...assertUpdater(readUpdater())];
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns preserved.`);
}

main();
