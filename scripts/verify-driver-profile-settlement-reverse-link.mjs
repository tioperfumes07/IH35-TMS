#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leafRe":"^profiles\\.detail$","task":"P30","pr":"#5979"} */
/**
 * verify-driver-profile-settlement-reverse-link.mjs
 *
 * P30 — driver profile "Settlements" weekly rows must link to the SPECIFIC settlement, not just
 * a generic driver-filtered list. Before this fix the backend's last_4_weeks CTE
 * (driver-aggregate.service.ts) never SELECTed driver_settlements.id, so a per-row EntityLink was
 * structurally impossible — the FE had nothing to link to. This guard pins both halves so a future
 * edit can't quietly drop either one:
 *   1. Backend: the `weeks` CTE selects driver_settlements.id (as settlement_id).
 *   2. Frontend: SettlementsSection renders EntityLink kind="settlement" using that id.
 *
 * Usage:
 *   node scripts/verify-driver-profile-settlement-reverse-link.mjs
 *   node scripts/verify-driver-profile-settlement-reverse-link.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-settlement-reverse-link";
const BACKEND = "apps/backend/src/mdata/driver-aggregate.service.ts";
const SECTION = "apps/frontend/src/components/driver-profile/SettlementsSection.tsx";
const PROFILE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

export function check(sources) {
  const problems = [];
  const be = sources[BACKEND];
  const fe = sources[SECTION];
  const profile = sources[PROFILE];
  const manifest = sources[MANIFEST];

  if (!be) {
    problems.push(`${BACKEND}: missing`);
  } else {
    const weeksCte = be.match(/weeks AS \(\s*SELECT[\s\S]{0,300}?FROM driver_finance\.driver_settlements/)?.[0] ?? "";
    if (!/id::text AS settlement_id/.test(weeksCte)) {
      problems.push(`${BACKEND}: weeks CTE must SELECT id::text AS settlement_id — without it no per-row link is possible`);
    }
  }
  if (!profile?.includes("<SettlementsSection") || !profile?.includes("settlements={aggregate.settlements ?? {}}")) {
    problems.push(`${PROFILE}: driver profile must mount SettlementsSection from the scoped aggregate`);
  }
  if (!/path="\/drivers\/:id\/profile"[\s\S]{0,180}<DriverProfilePage \/>/.test(manifest ?? "")) {
    problems.push(`${MANIFEST}: canonical driver profile route must remain mounted`);
  }

  if (!fe) {
    problems.push(`${SECTION}: missing`);
  } else {
    if (!/settlement_id:\s*w\.settlement_id/.test(fe)) {
      problems.push(`${SECTION}: must read settlement_id from the API row`);
    }
    if (!/<EntityLink[\s\S]{0,200}kind="settlement"[\s\S]{0,200}id=\{row\.settlement_id\}/.test(fe)) {
      problems.push(`${SECTION}: week_ending column must render EntityLink kind="settlement" id={row.settlement_id}`);
    }
  }

  return problems;
}

function readAll() {
  const read = (rel) => {
    const p = path.join(ROOT, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };
  return { [BACKEND]: read(BACKEND), [SECTION]: read(SECTION), [PROFILE]: read(PROFILE), [MANIFEST]: read(MANIFEST) };
}

if (process.argv.includes("--selftest")) {
  const good = {
    [BACKEND]: `
      weeks AS (
            SELECT
              id::text AS settlement_id,
              period_end::text AS week_ending
            FROM driver_finance.driver_settlements
    `,
    [SECTION]: `
      settlement_id: w.settlement_id ? String(w.settlement_id) : "",
      <EntityLink
          kind="settlement"
          id={row.settlement_id}
        />
    `,
    [PROFILE]: `<SettlementsSection settlements={aggregate.settlements ?? {}} />`,
    [MANIFEST]: `<Route path="/drivers/:id/profile"><DriverProfilePage /></Route>`,
  };
  const badBackend = { ...good, [BACKEND]: good[BACKEND].replace("id::text AS settlement_id,\n", "") };
  const badFrontend = { ...good, [SECTION]: good[SECTION].replace('kind="settlement"', 'kind="driver"') };
  const badMount = { ...good, [PROFILE]: good[PROFILE].replace("<SettlementsSection", "<RemovedSettlementsSection") };
  const badRoute = { ...good, [MANIFEST]: good[MANIFEST].replace('path="/drivers/:id/profile"', 'path="/drivers/:id/removed"') };

  const goodProblems = check(good);
  if (goodProblems.length) {
    console.error(`${LABEL} --selftest FAIL: good fixture rejected`, goodProblems);
    process.exit(1);
  }
  if (!check(badBackend).some((p) => p.includes("weeks CTE must SELECT"))) {
    console.error(`${LABEL} --selftest FAIL: dropped backend id not caught`);
    process.exit(1);
  }
  if (!check(badFrontend).some((p) => p.includes("must render EntityLink"))) {
    console.error(`${LABEL} --selftest FAIL: swapped EntityLink kind not caught`);
    process.exit(1);
  }
  if (!check(badMount).some((p) => p.includes("must mount SettlementsSection"))) {
    console.error(`${LABEL} --selftest FAIL: removed profile mount not caught`);
    process.exit(1);
  }
  if (!check(badRoute).some((p) => p.includes("canonical driver profile route"))) {
    console.error(`${LABEL} --selftest FAIL: removed canonical route not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — 4/4 planted defects caught`);
} else {
  const problems = check(readAll());
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — driver profile settlement rows link to the specific settlement`);
}
