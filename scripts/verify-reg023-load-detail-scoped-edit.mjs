#!/usr/bin/env node
/**
 * REG-023 — load detail: per-tab scoped Edit, More menu switches tabs, Open driver bill
 * has a real route, single-load fetch (no sibling NB/TR/SB bleed).
 */
import { readFileSync } from "node:fs";

const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const PAY = "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const WIZARD = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

function check(drawer, pay, manifest, link, wizard) {
  const errors = [];
  if (!/data-testid="load-detail-scoped-edit"/.test(drawer)) {
    errors.push("footer scoped Edit (load-detail-scoped-edit) missing");
  }
  if (!/activeTab === "Stops" \? "stops" : "full"/.test(drawer)) {
    errors.push("footer Edit must pass stops focus on the Stops tab");
  }
  if (!/activeTab === "Overview" \|\| activeTab === "Stops"/.test(drawer)) {
    errors.push("footer Edit must not open the full wizard from Costs / Driver Pay / money tabs");
  }
  if (!/onEditStops=\{canEdit \? \(\) => openScopedEdit\("stops"\)/.test(drawer)) {
    errors.push("Stops tab Edit stops must openScopedEdit(\"stops\"), not the unscoped wizard");
  }
  if (!/data-testid="ldt0-more-group"/.test(drawer) || !/setActiveTab\(tab\)/.test(drawer)) {
    errors.push("More ▾ must setActiveTab to a real More-group tab");
  }
  if (!/useLoad\(loadId/.test(drawer) || !/useDispatchLoad\(loadId/.test(drawer)) {
    errors.push("drawer must fetch the opened loadId only (useLoad + useDispatchLoad)");
  }
  if (/tourLoads|siblingLoads|otherLoads/.test(drawer)) {
    errors.push("drawer must not load sibling NB/TR/SB legs as the current load");
  }
  if (!/label="Open driver bill"/.test(pay)) {
    errors.push("Driver Pay tab must render Open driver bill");
  }
  if (!/path="\/driver-finance\/driver-bills\/:id"/.test(manifest)) {
    errors.push("manifest missing /driver-finance/driver-bills/:id");
  }
  if (!/case "driver_bill":[\s\S]{0,80}\/driver-finance\/driver-bills\//.test(link)) {
    errors.push("EntityLink driver_bill must route to /driver-finance/driver-bills/:id");
  }
  if (!/editFocus \?\?= "full"/.test(wizard) && !/editFocus = "full"/.test(wizard)) {
    errors.push("BookLoadModalV4 must accept editFocus");
  }
  if (!/data-testid="book-load-stops-section"/.test(wizard)) {
    errors.push("wizard must expose book-load-stops-section for Stops-scoped scroll");
  }
  return errors;
}

function selftest() {
  const drawer = readFileSync(DRAWER, "utf8");
  const pay = readFileSync(PAY, "utf8");
  const manifest = readFileSync(MANIFEST, "utf8");
  const link = readFileSync(LINK, "utf8");
  const wizard = readFileSync(WIZARD, "utf8");
  const good = check(drawer, pay, manifest, link, wizard);
  if (good.length) {
    console.error("SELFTEST FAIL — clean tree:\n  " + good.join("\n  "));
    process.exit(1);
  }
  const planted = [
    check(drawer.replace("load-detail-scoped-edit", "GONE"), pay, manifest, link, wizard).length > 0,
    check(drawer, pay.replace('label="Open driver bill"', 'label="View"'), manifest, link, wizard).length > 0,
    check(drawer, pay, manifest.replace("/driver-finance/driver-bills/:id", "/gone"), link, wizard).length > 0,
  ];
  if (planted.some((ok) => !ok)) {
    console.error("SELFTEST FAIL — planted mutation not caught");
    process.exit(1);
  }
  console.log("PASS verify-reg023-load-detail-scoped-edit --selftest");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check(
  readFileSync(DRAWER, "utf8"),
  readFileSync(PAY, "utf8"),
  readFileSync(MANIFEST, "utf8"),
  readFileSync(LINK, "utf8"),
  readFileSync(WIZARD, "utf8"),
);
if (errors.length) {
  console.error("FAIL verify-reg023-load-detail-scoped-edit:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("PASS verify-reg023-load-detail-scoped-edit");
