#!/usr/bin/env node
/**
 * PROG-NAV-01 — a routed surface with no inbound link is not shipped, it is hidden.
 *
 * WHY THIS EXISTS (verified on origin/main @ 86de31092, 2026-08-05):
 * `/home/scenario-tracker` — the live 24-slice Scenario Tracker board, fed by
 * `GET /api/v1/home/scenario-tracker` and certified every ~5 min by the `scenario.certify_cron`
 * job (prod: 7,084 rows in audit.scenario_status, 92 current, 23 distinct keys) — was registered
 * in the router and had **zero** inbound links anywhere in the app. The owner could not reach it
 * by clicking. It was reachable only by typing the URL.
 *
 * WHY THE OBVIOUS DOOR DOES NOT EXIST: `sidebar-config.ts` exports `getSidebarFlyoutItems()` with
 * ~100 curated sub-links, but `Sidebar.tsx` imports only `resolveSidebarOrder` + `SIDEBAR_ITEM_META`
 * and renders a flat icon rail. The flyout helper is referenced by nothing outside its own
 * definition and two tests, so adding a link there would render nowhere. Per the §7 nav law
 * ("ALL nav on the TOP horizontal bar; the navy rail is the only left panel — never a left tree")
 * sub-navigation belongs on a module's top-bar tab row, which is where the door was added.
 *
 * WHERE IT LIVES (owner ruling 2026-08-05): the board belongs in PROGRAM, beside the Scoreboard —
 * both are program-status surfaces fed live from prod. The canonical route is
 * /program/scenario-tracker; the original /home/scenario-tracker path is KEPT as a redirect
 * (additive-only: never delete a route) and is guarded here with requireDoor:false so it can never
 * be quietly dropped and start 404ing old links.
 *
 * WHAT THIS ASSERTS: for each surface below, the route is still registered AND (when a door is
 * required) at least one rendered file still carries an in-app link to it. Either half missing =
 * FAIL, because either half missing reproduces the defect: a route nobody can click, or a link to
 * nowhere.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-scenario-tracker-reachable";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

/**
 * Each guarded surface: the route path, and the rendered files any of which may host the door.
 * `linkSources` are files that Sidebar/router actually render — NOT sidebar-config.ts, whose
 * flyout links are dead code (see header).
 */
const SURFACES = [
  {
    route: "/program/scenario-tracker",
    what: "live 24-slice Scenario Tracker board (canonical — lives in PROGRAM beside the Scoreboard)",
    requireDoor: true,
    // OWNER DECISION 2026-08-05: the tracker lives ONLY on Program. The Home panel that used to
    // host the second door was removed (it became an orphan component), so Program's tab row is the
    // door — and the board is now also mounted inline on /program itself.
    linkSources: ["apps/frontend/src/pages/program/AuditScoreboardPage.tsx"],
  },
  {
    // Owner moved the board to PROGRAM on 2026-08-05. The old path stays routed as a redirect —
    // additive-only law: never delete a route, and bookmarks/links to it must keep resolving.
    // No door is required for a redirect; only that it still exists.
    route: "/home/scenario-tracker",
    what: "legacy path — must remain routed as a redirect to the canonical PROGRAM route",
    requireDoor: false,
    linkSources: [],
  },
];

/**
 * Escape EVERY regex metacharacter, not just `/` and `-`.
 * The first version escaped only those two, which CodeQL correctly flagged as
 * js/incomplete-sanitization: any route containing `.`, `+`, `?`, `(`, `[` etc. would have been
 * interpolated as live regex syntax and could match a path that is not the route (or throw).
 */
export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}

/** A route is registered when the manifest declares `path="<route>"`. */
export function routeIsRegistered(manifestSrc, route) {
  const re = new RegExp(`path=["']${escapeRegExp(route)}["']`);
  return re.test(manifestSrc);
}

/** An inbound link is `to="<route>"` or `href="<route>"` in a rendered source file. */
export function countInboundLinks(sources, route) {
  const re = new RegExp(`(?:to|href)=["']${escapeRegExp(route)}["']`, "g");
  let n = 0;
  for (const src of sources) n += (src.match(re) || []).length;
  return n;
}

export function auditSurface({ manifestSrc, route, what, sources, requireDoor = true }) {
  const problems = [];
  if (!routeIsRegistered(manifestSrc, route)) {
    problems.push(
      `${route} (${what}): route is no longer registered in ${MANIFEST}. ` +
        `Removing the route silently breaks every link to it.`
    );
  }
  if (requireDoor && countInboundLinks(sources, route) === 0) {
    problems.push(
      `${route} (${what}): routed but NO inbound in-app link remains. A surface with no door is ` +
        `not shipped — it is reachable only by typing the URL, which is the PROG-NAV-01 defect. ` +
        `Restore a top-bar tab or an in-page link in one of: ` +
        SURFACES.find((s) => s.route === route).linkSources.join(", ")
    );
  }
  return problems;
}

function auditTree() {
  const manifestPath = join(ROOT, MANIFEST);
  if (!existsSync(manifestPath)) return [`${MANIFEST} not found — cannot verify route registration.`];
  const manifestSrc = readFileSync(manifestPath, "utf8");

  const problems = [];
  for (const surface of SURFACES) {
    const sources = [];
    for (const rel of surface.linkSources) {
      const abs = join(ROOT, rel);
      if (!existsSync(abs)) {
        problems.push(`${surface.route}: declared link source ${rel} is missing.`);
        continue;
      }
      sources.push(readFileSync(abs, "utf8"));
    }
    problems.push(
      ...auditSurface({
        manifestSrc,
        route: surface.route,
        what: surface.what,
        sources,
        requireDoor: surface.requireDoor !== false,
      })
    );
  }
  return problems;
}

function selftest() {
  const failures = [];
  const route = "/program/scenario-tracker";
  const manifestOk = `<Route path="${route}" element={<X />} />`;

  // MUTATION 1 — route present, every door removed. This is the exact pre-fix state on
  // origin/main @ 86de31092 and MUST fail, or the guard is decorative.
  if (
    auditSurface({ manifestSrc: manifestOk, route, what: "t", sources: ["<div>no links here</div>"] })
      .length === 0
  )
    failures.push("case1 FAIL — the pre-fix state (routed, zero inbound links) was NOT caught");

  // MUTATION 2 — door present, route deleted. A link to an unrouted path is a dead end.
  if (auditSurface({ manifestSrc: "<Route path='/other' />", route, what: "t", sources: [`to="${route}"`] }).length === 0)
    failures.push("case2 FAIL — a link to an unregistered route was NOT caught");

  // FIXED — route registered and one door present.
  if (auditSurface({ manifestSrc: manifestOk, route, what: "t", sources: [`to="${route}"`] }).length !== 0)
    failures.push("case3 FAIL — the fixed state was flagged");

  // A near-miss path must not satisfy the door: substring matching would pass `/home/scenario-tracker-x`.
  if (
    auditSurface({ manifestSrc: manifestOk, route, what: "t", sources: [`to="${route}-legacy"`] }).length === 0
  )
    failures.push("case4 FAIL — a near-miss path was accepted as the door");

  // href= counts too (plain anchors are used elsewhere in the program pages).
  if (auditSurface({ manifestSrc: manifestOk, route, what: "t", sources: [`href="${route}"`] }).length !== 0)
    failures.push("case5 FAIL — an href door was rejected");

  // A redirect-only surface (requireDoor false) must pass with zero doors, but still fail if the
  // route itself is deleted — that is what keeps old links from silently 404ing.
  if (auditSurface({ manifestSrc: manifestOk, route, what: "t", sources: [], requireDoor: false }).length !== 0)
    failures.push("case7 FAIL — a routed redirect with no door was flagged");
  if (auditSurface({ manifestSrc: "<Route path='/other' />", route, what: "t", sources: [], requireDoor: false }).length === 0)
    failures.push("case8 FAIL — a DELETED legacy route was NOT caught");

  // Regex metacharacters in a route must be escaped, not interpolated as syntax (CodeQL
  // js/incomplete-sanitization). A route containing "." must not match any-character.
  if (escapeRegExp("/a.b+c?") !== "\\/a\\.b\\+c\\?")
    failures.push(`case10 FAIL — escapeRegExp left metacharacters live: ${escapeRegExp("/a.b+c?")}`);
  if (auditSurface({ manifestSrc: '<Route path="/aXb" />', route: "/a.b", what: "t", sources: [`to="/a.b"`] }).length === 0)
    failures.push("case11 FAIL — '.' in a route matched a different path (unescaped metacharacter)");

  // The real tree must be clean.
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case9 FAIL — real source flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — pre-fix no-door state caught, dead-end route caught, near-miss rejected, ` +
      `to=/href= doors accepted, real tree clean`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every guarded surface is routed AND has at least one inbound door`);
}

main();
