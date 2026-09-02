#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["work_orders_console"],"leafRe":"^work_orders_console\\.list$","task":"GO-05-WAVE1"} */
/**
 * verify-wo-console-list-uses-paritytable — qbo-parity-a1 (WorkOrdersConsoleListPage)
 *
 * Maintenance work-orders console list must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Outages must surface ListErrorState (never inline table error rows).
 * Server offset pagination + ?sort= URL persistence preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wo-console-list-uses-paritytable";
const PAGE = "apps/frontend/src/pages/work-orders/WorkOrdersConsoleListPage.tsx";

const REQUIRED_LABELS = ["WO #", "Billing", "Class", "Status", "Est / Act", "Labor ¢", "Opened", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
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
  if (!src.includes('storageKey="work-orders-console-list"')) {
    errors.push(`${PAGE}: must set storageKey="work-orders-console-list"`);
  }
  if (!src.includes("No work orders match the current filters.")) {
    errors.push(`${PAGE}: must keep emptyText for filtered-empty state`);
  }
  if (!src.includes("Couldn't load work orders")) {
    errors.push(`${PAGE}: must keep ListErrorState title for outage`);
  }
  if (!/useSearchParams/.test(src)) {
    errors.push(`${PAGE}: sort selection must persist via useSearchParams (?sort=)`);
  }
  if (!/searchParams\.get\(["']sort["']\)/.test(src)) {
    errors.push(`${PAGE}: must read the initial sort from ?sort=`);
  }
  // NAVY-SUBNAV-14-OF-178 (#18891) swapped this page's segment tabs from SecondaryNavTabs to
  // NavyPageSubNav app-wide standard, before this check was ever exercised (the file was on
  // TableHeaderCell at the time — see MAINT-05 — so this exact string never matched either
  // component name until now). Check the component that's actually current, not the retired one.
  if (!src.includes("NavyPageSubNav")) {
    errors.push(`${PAGE}: must keep NavyPageSubNav segment filter`);
  }
  if (!/kind\s*=\s*["']work_orders_console["']/.test(src) || !/case\s+["']work_orders_console["']/.test(fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/shared/EntityLink.tsx"), "utf8"))) {
    errors.push(`${PAGE}: must View via EntityLink kind=work_orders_console → /work-orders/:id`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { useSearchParams } from "react-router-dom";
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
    import { EntityLink } from "../../components/shared/EntityLink";
    const columns = [
      { key: "display_id", label: "WO #" },
      { key: "wo_billing_type", label: "Billing" },
      { key: "wo_service_class", label: "Class" },
      { key: "status", label: "Status" },
      { key: "total_estimated_cost", label: "Est / Act" },
      { key: "labor_cost_cents", label: "Labor ¢" },
      { key: "opened_at", label: "Opened" },
      { key: "actions", label: "Actions" },
    ];
    export function WorkOrdersConsoleListPage() {
      const [searchParams] = useSearchParams();
      const sort = searchParams.get("sort");
      return (
        <>
          <NavyPageSubNav />
          <ListErrorState title="Couldn't load work orders" onRetry={() => {}} />
          <ParityTable
            storageKey="work-orders-console-list"
            emptyText="No work orders match the current filters."
            loading={false}
          />
          <EntityLink kind="work_orders_console" id={id} label="View" />
        </>
      );
    }
  `;
  const bad = `
    export function WorkOrdersConsoleListPage() {
      return (
        <table><thead><tr><th>WO #</th></tr></thead></table>
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
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns preserved.`);
}

main();
