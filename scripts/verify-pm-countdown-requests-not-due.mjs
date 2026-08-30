#!/usr/bin/env node
/**
 * GUARD — the PM Countdown must be fed schedules that are NOT YET DUE.
 *
 * THE BUG. /api/v1/maint/pm/due returns only rows where is_due is true unless include_not_due is
 * passed. That default is right for a "how many are due" counter and exactly wrong for a COUNTDOWN,
 * which exists to answer "how long until this comes due" — "12,000 mi left" is only meaningful BEFORE
 * the PM is due. MaintenanceHome fetched without the flag, so on a fleet with nothing overdue the
 * cards received an empty list and rendered "No active schedule".
 *
 * WHY THAT WAS WORSE THAN A BLANK. Verified on prod: TRANSP has 30 active pm_schedules, including 4
 * each of oil, tires, brake and dot_inspection — the exact four the cards render. They are ACTIVE and
 * they are NOT due. The card told the operator no schedule existed, which invites creating duplicates
 * of schedules that are already there, on a DOT-relevant surface. A wrong instruction beats a blank
 * one only in the wrong direction.
 *
 * WHAT IS ASSERTED: the countdown's fetch requests not-due rows. A regression that drops the flag —
 * or a refactor that reverts to the bare one-argument call — turns the cards silently blank again,
 * and blank looks like "healthy fleet, nothing to see" rather than "this panel stopped working."
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:pm-countdown-requests-not-due";
const HOME = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";
const API = "apps/frontend/src/api/maintenance.ts";
const ROUTE = "apps/backend/src/maint/pm.routes.ts";

/** The countdown's own fetch must ask for not-due rows. */
export function countdownRequestsNotDue(homeSource) {
  return /listMaintPmDue\(\s*[A-Za-z_$][\w$]*\s*,\s*\{[^}]*includeNotDue\s*:\s*true[^}]*\}\s*\)/.test(homeSource);
}

/** The client must actually forward it to the query string, or the option is decorative. */
export function apiForwardsFlag(apiSource) {
  return /includeNotDue/.test(apiSource) && /set\(\s*["']include_not_due["']/.test(apiSource);
}

export function routeReadsCanonicalSchedule(routeSource) {
  return /FROM\s+maintenance\.pm_schedules\s+s/.test(routeSource) && !/FROM\s+maint\.pm_schedule\s+s/.test(routeSource);
}

export function analyse(homeSource, apiSource, routeSource) {
  const problems = [];
  if (!countdownRequestsNotDue(homeSource)) {
    problems.push(
      `${HOME}: the PM Countdown fetch does not pass { includeNotDue: true }. /api/v1/maint/pm/due ` +
        `filters to is_due by default, so the cards will render "No active schedule" for schedules that ` +
        `exist and are active but are simply not due yet.`
    );
  }
  if (!apiForwardsFlag(apiSource)) {
    problems.push(
      `${API}: listMaintPmDue does not forward includeNotDue to the include_not_due query param, so the ` +
        `option is accepted and silently dropped — the worst kind, because the call site looks correct.`
    );
  }
  if (!routeReadsCanonicalSchedule(routeSource)) {
    problems.push(
      `${ROUTE}: PM Countdown must read canonical maintenance.pm_schedules, the same table written by ` +
        `the PM Schedule UI and referenced by maintenance.pm_alerts. Reading retired maint.pm_schedule ` +
        `creates a split-brain dashboard.`
    );
  }
  return problems;
}

export function run() {
  let home = "";
  let api = "";
  let route = "";
  try {
    home = readFileSync(path.join(ROOT, HOME), "utf8");
    api = readFileSync(path.join(ROOT, API), "utf8");
    route = readFileSync(path.join(ROOT, ROUTE), "utf8");
  } catch (err) {
    // FAIL CLOSED: a moved file must not read as success.
    return { ok: false, message: `${LABEL} FAILED:\n  - cannot read source (${err.message})` };
  }
  const problems = analyse(home, api, route);
  if (problems.length) return { ok: false, message: `${LABEL} FAILED:\n  - ${problems.join("\n  - ")}` };
  return { ok: true, message: `${LABEL} OK — PM Countdown requests not-due schedules and the client forwards the flag` };
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  const GOOD_HOME = "queryFn: () => listMaintPmDue(companyId, { includeNotDue: true }),";
  const BARE_HOME = "queryFn: () => listMaintPmDue(companyId),";
  const FALSE_HOME = "queryFn: () => listMaintPmDue(companyId, { includeNotDue: false }),";
  const GOOD_API = 'export function listMaintPmDue(id, opts = {}) { if (opts.includeNotDue) q.set("include_not_due", "true"); }';
  const DROPS_API = "export function listMaintPmDue(id, opts = {}) { /* includeNotDue accepted and ignored */ }";
  const GOOD_ROUTE = "SELECT * FROM maintenance.pm_schedules s WHERE s.operating_company_id = $1";
  const LEGACY_ROUTE = "SELECT * FROM maint.pm_schedule s WHERE s.tenant_id = $1";

  t("bare call is caught", analyse(BARE_HOME, GOOD_API, GOOD_ROUTE).length === 1);
  t("includeNotDue:false is caught", analyse(FALSE_HOME, GOOD_API, GOOD_ROUTE).length === 1);
  t("client that drops the flag is caught", analyse(GOOD_HOME, DROPS_API, GOOD_ROUTE).length === 1);
  t("legacy route is caught", analyse(GOOD_HOME, GOOD_API, LEGACY_ROUTE).length === 1);
  t("all three broken report all", analyse(BARE_HOME, DROPS_API, LEGACY_ROUTE).length === 3);
  t("correct wiring passes", analyse(GOOD_HOME, GOOD_API, GOOD_ROUTE).length === 0);
  // Mutation arms — each detector must be able to return the opposite answer.
  t("mutation: countdownRequestsNotDue true on good", countdownRequestsNotDue(GOOD_HOME) === true);
  t("mutation: countdownRequestsNotDue false on bare", countdownRequestsNotDue(BARE_HOME) === false);
  t("mutation: apiForwardsFlag true on good", apiForwardsFlag(GOOD_API) === true);
  t("mutation: apiForwardsFlag false on dropping client", apiForwardsFlag(DROPS_API) === false);
  t("mutation: canonical route passes", routeReadsCanonicalSchedule(GOOD_ROUTE) === true);
  t("mutation: legacy route fails", routeReadsCanonicalSchedule(LEGACY_ROUTE) === false);
  return bad;
}

const INVOKED_DIRECTLY = process.argv[1] && process.argv[1].endsWith("verify-pm-countdown-requests-not-due.mjs");
if (INVOKED_DIRECTLY) {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 12 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(bad === 0 ? 0 : 1);
  }
  const res = run();
  console.log(res.message);
  process.exit(res.ok ? 0 : 1);
}
