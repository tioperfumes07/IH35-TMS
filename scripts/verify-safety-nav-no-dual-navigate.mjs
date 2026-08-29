#!/usr/bin/env node
/**
 * GUARD — verify-safety-nav-no-dual-navigate
 *
 * THE DEFECT THIS ASSERTS — live-verified 2026-08-28 (Chrome, USMCA, healthz 4e5db76, 100%
 * reproducible): clicking a Safety group-nav dropdown item (`SafetyGroupNav.tsx`'s `NavLink`)
 * while `Outlet` was rendering a client-state driver-detail view (`DriverFilesTab`'s internal
 * `driverId`) updated the URL to the target route (`/safety/accidents`) but left the OLD driver
 * detail page rendered on screen — permanently, until a hard reload. Root cause:
 * `SafetyLayout.tsx` passed `onTabChange` to `SafetyGroupNav`, which called `navigate(target)`
 * imperatively INSIDE the same `onClick` that `NavLink`'s own `to={tab.route}` prop ALSO
 * navigates via — two synchronous navigate() calls to the identical destination in one click,
 * racing React Router's internal route-match/re-render cycle so the routed `Outlet` child never
 * actually swapped.
 *
 * WHAT IS ASSERTED: `SafetyLayout.tsx` does not pass an `onTabChange` prop to `SafetyGroupNav`
 * (NavLink's own `to` stays the single source of truth for this navigation — no redundant
 * imperative `navigate()` racing it).
 *
 * METHOD: comments/strings stripped before structural assertions. --selftest mutates the REAL
 * source and requires the assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-safety-nav-no-dual-navigate";
const FILE = "apps/frontend/src/pages/safety/SafetyLayout.tsx";

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function check(sources) {
  const errors = [];
  const raw = sources[FILE] ?? "";
  if (!raw) {
    errors.push(`${FILE}: missing.`);
    return errors;
  }
  const src = stripCommentsAndStrings(raw);

  // The SafetyGroupNav element must NOT be given an onTabChange prop — that prop's only historical
  // consumer called navigate() a second time, racing NavLink's own navigation to the same target.
  const navMatch = src.match(/<SafetyGroupNav\b[\s\S]*?\/>/);
  if (!navMatch) {
    errors.push(`${FILE}: could not find the <SafetyGroupNav ... /> element to check.`);
  } else if (/onTabChange\s*=/.test(navMatch[0])) {
    errors.push(
      `${FILE}: <SafetyGroupNav> is passed onTabChange again — this previously called navigate() a ` +
        `second time inside the same click NavLink's own \`to\` prop already navigates with, racing ` +
        `React Router and leaving a stale client-state child view (e.g. DriverFilesTab's driver ` +
        `detail) stuck on screen under the new URL.`
    );
  }

  return errors;
}

function loadAll() {
  const out = {};
  try {
    out[FILE] = readFileSync(FILE, "utf8");
  } catch {
    out[FILE] = "";
  }
  return out;
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const mutations = [
    ["onTabChange re-added to SafetyGroupNav", (s) => ({
      ...s,
      [FILE]: s[FILE].replace(
        "<SafetyGroupNav groups={SAFETY_GROUPS} activeTabId={activeTabId} />",
        '<SafetyGroupNav groups={SAFETY_GROUPS} activeTabId={activeTabId} onTabChange={(tabId) => { navigate(findSafetyTab(tabId)?.tab.route ?? "/safety/driver-files"); }} />'
      ),
    })],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (JSON.stringify(broken) === JSON.stringify(real)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutation(s) all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — SafetyGroupNav's NavLink is the sole navigation mechanism for Safety group-nav ` +
    `clicks; no redundant imperative navigate() racing it.`
);
