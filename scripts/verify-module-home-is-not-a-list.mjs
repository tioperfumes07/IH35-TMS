#!/usr/bin/env node
/**
 * FLT-F424 / DRV module-home law — a module root is a HOME (KPI + tabs), never a bare roster.
 * Scoped to Drivers + Fleet in this PR so the rest of the repo is not failed on sight.
 *
 * Unnumbered (Rule 37). Claim an EVEN verify-step to main after merge.
 *
 *   node scripts/verify-module-home-is-not-a-list.mjs
 *   node scripts/verify-module-home-is-not-a-list.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-module-home-is-not-a-list";

/** Module homes this PR owns. Expand later; do not scan the whole app yet. */
const MODULE_HOMES = [
  {
    id: "drivers",
    page: "apps/frontend/src/pages/Drivers.tsx",
    titleLiteral: 'title="Drivers"',
  },
  {
    id: "fleet",
    page: "apps/frontend/src/pages/fleet/FleetHomePage.tsx",
    titleLiteral: 'title="Fleet"',
  },
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function auditPage(mod, src) {
  const failures = [];

  // RULE 1 — KPI strip + tab strip
  if (!/KpiStrip/.test(src) || !/<KpiCard[\s>]/.test(src)) {
    failures.push(`${mod.id}: RULE 1 — module home must render a KPI strip (KpiStrip + KpiCard)`);
  }
  if (!/NavyPageSubNav/.test(src)) {
    failures.push(`${mod.id}: RULE 1 — module home must render a tab strip (NavyPageSubNav)`);
  }

  // RULE 2 — title is sentence case, never all-caps alone
  if (src.includes(mod.titleLiteral) === false) {
    failures.push(`${mod.id}: RULE 2 — PageHeader must use ${mod.titleLiteral} (sentence case)`);
  }
  if (/title=["'][A-Z]{3,}["']/.test(src) && !/title=["'][A-Z][a-z]/.test(src)) {
    // catch title="FLEET" / title="DRIVERS" without a sentence-case title nearby
    const allCaps = [...src.matchAll(/title=["']([A-Z]{3,})["']/g)].map((m) => m[1]);
    for (const t of allCaps) {
      if (t === t.toUpperCase() && t.length >= 3) {
        failures.push(`${mod.id}: RULE 2 — title="${t}" is all-caps; module homes use sentence case`);
      }
    }
  }
  if (/title=["']FLEET["']/.test(src) || /title=["']DRIVERS["']/.test(src)) {
    failures.push(`${mod.id}: RULE 2 — all-caps module title is forbidden`);
  }

  // RULE 3 — home is not a bare roster as its only content
  if (mod.id === "fleet") {
    if (!/parseFleetHomeTab|FLEET_HOME_TABS|fleet-home-board|fleet-f428-expiry-gap/.test(src)) {
      failures.push(`${mod.id}: RULE 3 — Fleet home must have a Home board (not only the units roster)`);
    }
    if (!/fleet-f428-expiry-gap/.test(src)) {
      failures.push(`${mod.id}: RULE 3 — FLT-F428 warning banner must remain on the Fleet home`);
    }
    // Roster-only smell: FleetTablePage as the sole body with no Home branch
    if (/FleetTablePage/.test(src) && !/activeTab === "home"/.test(src) && !/activeTab === 'home'/.test(src)) {
      failures.push(`${mod.id}: RULE 3 — roster must not be the only content; Home tab required`);
    }
  }
  if (mod.id === "drivers") {
    if (!/DRIVERS_SUBNAV|drivers-unified-subnav/.test(src)) {
      failures.push(`${mod.id}: RULE 3 — Drivers home must keep the module tab strip`);
    }
  }

  return failures;
}

function audit(filesById) {
  const failures = [];
  for (const mod of MODULE_HOMES) {
    failures.push(...auditPage(mod, filesById[mod.id]));
  }
  return failures;
}

function selftest() {
  const good = {
    drivers: `
      <PageHeader title="Drivers" subtitle="x" />
      <KpiStrip><KpiCard label="Active" number="1" /></KpiStrip>
      <div data-testid="drivers-unified-subnav"><NavyPageSubNav items={DRIVERS_SUBNAV} /></div>
    `,
    fleet: `
      <PageHeader title="Fleet" subtitle="Trucks, trailers and company vehicles" />
      <NavyPageSubNav items={FLEET_HOME_TABS} />
      <KpiStrip><KpiCard label="Units in service" number="1" /></KpiStrip>
      {activeTab === "home" ? <div data-testid="fleet-home-board"><div data-testid="fleet-f428-expiry-gap">gap</div></div> : null}
      {activeTab === "units" ? <FleetTablePage /> : null}
    `,
  };
  const goodFails = audit(good);
  if (goodFails.length) {
    console.error(`${LABEL} SELFTEST FAIL — good fixture rejected:`);
    for (const f of goodFails) console.error(`  - ${f}`);
    process.exit(1);
  }

  const bad = {
    drivers: `<PageHeader title="DRIVERS" /><div>roster only</div>`,
    fleet: `<PageHeader title="FLEET" /><FleetTablePage operatingCompanyId={c} />`,
  };
  const badFails = audit(bad);
  if (badFails.length < 4) {
    console.error(`${LABEL} SELFTEST FAIL — bad fixture not caught (${badFails.length} failures)`);
    for (const f of badFails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const filesById = Object.fromEntries(MODULE_HOMES.map((m) => [m.id, read(m.page)]));
const failures = audit(filesById);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Drivers + Fleet homes have KPI + tabs, sentence-case titles, Home board`);
process.exit(0);
