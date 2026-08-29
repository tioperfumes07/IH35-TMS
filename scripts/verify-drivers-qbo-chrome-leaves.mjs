#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["drivers.panel.auto_deduction_policies","drivers.modal.assign_truck","profiles.drawer.equipment_qualification","profiles.drawer.safety_event","profiles.drawer.background_check","profiles.drawer.medical_card","teams.create","drivers.panel.team_split_config"],"task":"DRV-F5927-DRAWER-PANEL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/**
 * Drivers qbo_chrome — leaf-specific Built for 13 of the 16 leaves only "claimed" by the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs sweep (leafRe: ^(cash_advances|chrome|deductions|
 * drivers|pay_rate_templates|profiles|teams)(\.|$)) — same theater-coverage class already found+
 * fixed for insurance/legal/accounting/customers/safety+dispatch this session: it verifies generic
 * shared files (ReportsHome, BillsPage, DriversPage.tsx's mere existence...) and never opens a real
 * drivers leaf's own chrome.
 *
 * chrome.toolbar_(search|range) are already real via CLS-FILTER-GEAR-APPLY (includes drivers).
 * chrome.toolbar_filter had NO leaf-specific qbo_chrome guard for drivers anywhere (the one guard
 * that DOES claim drivers' chrome.toolbar_filter — CLS-LIST-TOOLBAR-SEARCH-RANGE-FILTER — claims the
 * `connectivity` column, not `qbo_chrome`, and doesn't even list drivers in its toolbar_filter leafRe).
 *
 * All 13 leaves below are genuinely built, traced through the real route/component wiring:
 *   - chrome.toolbar_filter: DriversTable.tsx (mounted by DriversListPage on the "profiles" subnav)
 *     carries the real CollapsedListFilters Apply/Reset/Cancel triad.
 *   - profiles.create: Drivers.tsx's "+ Create Driver" mounts the real CreateDriverModal.tsx, a
 *     ParityDrawer with Combobox/DatePicker fields.
 *   - pay_rate_templates: PayRateTemplatesListPage.tsx is a 1-line re-export shim around the real
 *     DriverCatalogListPage.tsx, which carries a real ParityTable.
 *   - deductions / drivers.panel.auto_deduction_policies: Drivers.tsx's "deductions" subnav mounts
 *     AutoDeductionPoliciesPanel (from drivers/AutoDeductionPolicies.tsx) — a real Modal
 *     variant="drawer" create panel with MoneyInput fields. Two distinct required-map leaves, same
 *     real underlying component.
 *   - drivers.modal.assign_truck: AssignTruckModal.tsx is a real Modal with a real EntityPicker
 *     (server-search, not a capped dropdown — SAF-B29 picker law).
 *   - profiles.drawer.equipment_qualification / profiles.drawer.safety_event: DriverDetail.tsx's own
 *     addQualificationOpen / addSafetyEventOpen Modal variant="drawer" panels, both with real
 *     Combobox/DatePicker fields.
 *   - profiles.drawer.background_check / profiles.drawer.medical_card: DriverDetail.tsx mounts
 *     BackgroundChecksSection.tsx / MedicalCardsHistorySection.tsx, each a real Modal
 *     variant="drawer" with real DatePicker fields.
 *   - teams.create: Drivers.tsx's "+ Create Team" mounts a real Modal variant="drawer".
 *   - drivers.panel.team_split_config: TeamSplitConfig.tsx's real Modal variant="drawer" with a real
 *     DriverPickerWithCreate EntityPicker-class field.
 *
 * 2026-08-21 (CC-3, SWARM-ONE-MODULE follow-up): `cash_advances` (route /drivers/cash-advances) was
 * left unclaimed on purpose in the original version of this file — a genuine gap, not theater —
 * because Drivers.tsx's "cash_advances" subnav rendered only a bare DataPanel debt-alert summary
 * (title + hand-rolled DataPanelRow loop, no ParityTable, no CollapsedListFilters, no create modal),
 * unlike every sibling drivers panel which has SOME real QBO-parity chrome. This was also masked on
 * the live scoreboard: the broad CURSOR-VERTICAL sweep's leafRe (`^(cash_advances|chrome|...)`) DOES
 * match `cash_advances`, and matrix-built-auto.ts's `isLeafSpecific()` accepts that anchored
 * alternation pattern, so the leaf was silently credited "Built" via that broad claim even though
 * the sweep's own runtime check never opens Drivers.tsx looking for cash_advances chrome at all —
 * same theater-scoreboard-drift class as the accounting `chrome.toolbar_search` finding this same
 * session. FIXED in this PR: Drivers.tsx's cash_advances tab now renders the same debtAlertRows data
 * through a real `<ParityTable>` (sortable Driver/Reason/Liability/Outstanding columns) instead of
 * the manual DataPanelRow loop — same rows, same top-8 cap, real QBO-parity grid chrome. Closed
 * DRIVERS-CASH-ADVANCES-SUBNAV-NO-QBO-CHROME on GUARD-WORKORDERS.md.
 *
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^cash_advances$","task":"VERTICAL-QBO-CHROME-drivers-cash-advances","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-drivers-toolbar-filter","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^profiles\\.create$","task":"VERTICAL-QBO-CHROME-drivers-profiles-create","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^pay_rate_templates$","task":"VERTICAL-QBO-CHROME-drivers-pay-rate-templates","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^deductions$","task":"VERTICAL-QBO-CHROME-drivers-deductions","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^drivers\\.panel\\.auto_deduction_policies$","task":"VERTICAL-QBO-CHROME-drivers-auto-deduction-policies-panel","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^drivers\\.modal\\.assign_truck$","task":"VERTICAL-QBO-CHROME-drivers-assign-truck","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^profiles\\.drawer\\.equipment_qualification$","task":"VERTICAL-QBO-CHROME-drivers-equipment-qualification","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^profiles\\.drawer\\.safety_event$","task":"VERTICAL-QBO-CHROME-drivers-safety-event","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^profiles\\.drawer\\.background_check$","task":"VERTICAL-QBO-CHROME-drivers-background-check","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^profiles\\.drawer\\.medical_card$","task":"VERTICAL-QBO-CHROME-drivers-medical-card","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^teams\\.create$","task":"VERTICAL-QBO-CHROME-drivers-teams-create","vertical":"column-wave"}
 * @matrix-built {"modules":["drivers"],"cols":["qbo_chrome"],"leafRe":"^drivers\\.panel\\.team_split_config$","task":"VERTICAL-QBO-CHROME-drivers-team-split-config","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-drivers-qbo-chrome-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drivers-qbo-chrome-leaves";
const REQUIRED = "docs/specs/scoreboard/modules/drivers.required.json";
const FEED = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF = "scripts/verify-drivers-qbo-chrome-leaves.mjs";
const EXACT_HEADER = '/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["drivers.panel.auto_deduction_policies","drivers.modal.assign_truck","profiles.drawer.equipment_qualification","profiles.drawer.safety_event","profiles.drawer.background_check","profiles.drawer.medical_card","teams.create","drivers.panel.team_split_config"],"task":"DRV-F5927-DRAWER-PANEL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const EXACT_ROUTES = new Map([
  ["drivers.panel.auto_deduction_policies", "/drivers/auto-deduction-policies"],
  ["drivers.modal.assign_truck", "surface://components/driver-profile/AssignTruckModal.tsx"],
  ["profiles.drawer.equipment_qualification", "/drivers/:id"], ["profiles.drawer.safety_event", "/drivers/:id"],
  ["profiles.drawer.background_check", "/drivers/:id"], ["profiles.drawer.medical_card", "/drivers/:id"],
  ["teams.create", "/drivers"], ["drivers.panel.team_split_config", "/drivers/team-splits"],
]);

const CHECKS = [
  {
    name: "cash_advances: Drivers.tsx cash_advances tab mounts a real ParityTable over debtAlertRows",
    file: "apps/frontend/src/pages/Drivers.tsx",
    pattern: /subnavTab === "cash_advances"[\s\S]{0,1300}<ParityTable[\s\S]{0,300}rows=\{debtAlertRows\}[\s\S]{0,300}columns=\{debtAlertColumns\}/,
  },
  {
    name: "chrome.toolbar_filter: DriversTable real CollapsedListFilters Apply/Reset/Cancel triad",
    file: "apps/frontend/src/pages/drivers/DriversTable.tsx",
    pattern: /<CollapsedListFilters[\s\S]*onApply=\{staged\.apply\}[\s\S]*onReset=\{staged\.reset\}[\s\S]*onCancel=\{staged\.cancel\}/,
  },
  {
    name: "profiles.create: CreateDriverModal is a real ParityDrawer with Combobox/DatePicker fields",
    file: "apps/frontend/src/components/drivers/CreateDriverModal.tsx",
    pattern: /ParityDrawer[\s\S]*Combobox[\s\S]{0,2000}DatePicker/,
  },
  {
    name: "pay_rate_templates: DriverCatalogListPage (real target of the shim) carries a real ParityTable",
    file: "apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx",
    pattern: /<ParityTable\b/,
  },
  {
    name: "deductions / drivers.panel.auto_deduction_policies: AutoDeductionPoliciesPanel real Modal drawer + MoneyInput",
    file: "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx",
    pattern: /<Modal variant="drawer" open=\{createOpen\}[\s\S]{0,6500}MoneyInput/,
  },
  {
    name: "drivers.modal.assign_truck: AssignTruckModal real Modal + real EntityPicker",
    file: "apps/frontend/src/components/driver-profile/AssignTruckModal.tsx",
    pattern: /<Modal[\s\S]*EntityPicker/,
  },
  {
    name: "profiles.drawer.equipment_qualification: DriverDetail real Modal drawer + DatePicker",
    file: "apps/frontend/src/pages/DriverDetail.tsx",
    pattern: /<Modal variant="drawer" open=\{addQualificationOpen\}[\s\S]{0,2500}DatePicker/,
  },
  {
    name: "profiles.drawer.safety_event: DriverDetail real Modal drawer + Combobox + DatePicker",
    file: "apps/frontend/src/pages/DriverDetail.tsx",
    pattern: /<Modal variant="drawer" open=\{addSafetyEventOpen\}[\s\S]{0,2500}Combobox[\s\S]{0,1000}DatePicker/,
  },
  {
    name: "profiles.drawer.background_check: BackgroundChecksSection real Modal drawer + DatePicker",
    file: "apps/frontend/src/components/safety/BackgroundChecksSection.tsx",
    pattern: /<Modal variant="drawer" open=\{open\}(?:(?!<\/Modal>)[\s\S])*DatePicker(?:(?!<\/Modal>)[\s\S])*<\/Modal>/,
  },
  {
    name: "profiles.drawer.medical_card: MedicalCardsHistorySection real Modal drawer + DatePicker",
    file: "apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx",
    pattern: /<Modal variant="drawer" open=\{open\}(?:(?!<\/Modal>)[\s\S])*DatePicker(?:(?!<\/Modal>)[\s\S])*<\/Modal>/,
  },
  {
    name: "teams.create: Drivers.tsx real Modal drawer + Create Team submit",
    file: "apps/frontend/src/pages/Drivers.tsx",
    pattern: /<Modal variant="drawer" open=\{teamCreateOpen\}[\s\S]{0,3000}Create Team/,
  },
  {
    name: "drivers.panel.team_split_config: TeamSplitConfig real Modal drawer + DriverPickerWithCreate",
    file: "apps/frontend/src/pages/drivers/TeamSplitConfig.tsx",
    pattern: /<Modal\s+(?=[^>]*variant="drawer")(?=[^>]*open=\{createOpen\})[^>]*>(?:(?!<\/Modal>)[\s\S])*DriverPickerWithCreate(?:(?!<\/Modal>)[\s\S])*<\/Modal>/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function runEvidence(requiredSrc, selfSrc, feedSrc) {
  const fails = [];
  const required = JSON.parse(requiredSrc);
  for (const [id, route] of EXACT_ROUTES) {
    const leaf = required.leaves?.find((row) => row.id === id);
    if (!leaf?.required?.includes("connectivity")) fails.push(`${REQUIRED}: ${id} must require connectivity`);
    if (leaf?.route_hint !== route) fails.push(`${REQUIRED}: ${id} must name route ${route}`);
  }
  if (!selfSrc.split("/**\n * Drivers")[0].includes(EXACT_HEADER)) fails.push(`${SELF}: exact Drivers drawer/panel connectivity header missing`);
  if (/"guard"\s*:\s*"scripts\/verify-drivers-qbo-chrome-leaves\.mjs"/.test(feedSrc)) fails.push(`${FEED}: manual feed duplicates exact Drivers drawer/panel connectivity`);
  return fails;
}

function selftest() {
  const live = runChecks();
  if (live.length) {
    console.error(`${LABEL} SELFTEST BASELINE FAIL:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  const requiredGood = fs.readFileSync(path.join(ROOT, REQUIRED), "utf8");
  const selfGood = fs.readFileSync(path.join(ROOT, SELF), "utf8");
  const feedGood = fs.readFileSync(path.join(ROOT, FEED), "utf8");
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".drivers-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);

    for (const mutation of [
      ["apps/frontend/src/components/safety/BackgroundChecksSection.tsx", "DatePicker"],
      ["apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx", "DatePicker"],
      ["apps/frontend/src/pages/drivers/TeamSplitConfig.tsx", "DriverPickerWithCreate"],
    ]) {
      for (const c of CHECKS) {
        const source = path.join(ROOT, c.file);
        const target = path.join(tmp, c.file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      }
      const [file, token] = mutation;
      const target = path.join(tmp, file);
      fs.writeFileSync(target, fs.readFileSync(target, "utf8").replaceAll(token, "REMOVED_SHARED_CONTROL"));
      const expected = CHECKS.find((check) => check.file === file)?.name;
      if (!expected || !runChecks(tmp).some((failure) => failure.startsWith(expected))) {
        console.error(`${LABEL} SELFTEST FAIL — ${file} ${token} mutation escaped`);
        process.exit(1);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const evidenceFailures = runEvidence(requiredGood, selfGood, feedGood);
  for (const id of EXACT_ROUTES.keys()) {
    const mutated = requiredGood.replace(`"id": "${id}"`, `"id": "${id}.broken"`);
    if (mutated === requiredGood || runEvidence(mutated, selfGood, feedGood).length === 0) evidenceFailures.push(`${id}: Required mutation escaped`);
  }
  if (runEvidence(requiredGood, selfGood.replace(EXACT_HEADER, EXACT_HEADER.replace("connectivity", "reverse_link")), feedGood).length === 0) evidenceFailures.push("header mutation escaped");
  if (runEvidence(requiredGood, selfGood, feedGood.replace("[", `[{"guard":"scripts/verify-drivers-qbo-chrome-leaves.mjs"},`)).length === 0) evidenceFailures.push("feed mutation escaped");
  if (evidenceFailures.length) {
    console.error(`${LABEL} SELFTEST FAIL evidence:\n- ${evidenceFailures.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${EXACT_ROUTES.size + 2} exact connectivity evidence mutations detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
fails.push(...runEvidence(
  fs.readFileSync(path.join(ROOT, REQUIRED), "utf8"),
  fs.readFileSync(path.join(ROOT, SELF), "utf8"),
  fs.readFileSync(path.join(ROOT, FEED), "utf8"),
));
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} checks / 13 drivers qbo_chrome leaf asserts`);
