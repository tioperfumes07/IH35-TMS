#!/usr/bin/env node
/**
 * GUARD: safety records are drillable INTO from any module (SAF-F33 / Law §9 reverse linkage).
 *
 * WHY THIS EXISTS (2026-07-23 audit)
 * EntityLink had 25 kinds and NONE for a safety record — no accident, fine, complaint, DOT inspection,
 * escrow record, or permit. So no module could link INTO a safety record; a converted fine deducted a
 * driver's settlement with no reverse surface, an accident had no inbound link. The reverse half of the
 * linkage law was entirely missing for Safety.
 *
 * Fix contract:
 *   - EntityLink declares the 6 safety kinds and resolves each to its list route with a query param
 *     (the same claim/lawsuit/settlement drill pattern);
 *   - the two surfaces that own a detail drawer (accidents, external fines) HONOR the param — reading
 *     it and opening the record's drawer — so the link actually drills through, not just navigates.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTITYLINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const ACCIDENTS = "apps/frontend/src/pages/safety/AccidentsPage.tsx";
const FINES = "apps/frontend/src/pages/safety/FinesPage.tsx";
const DRIVER_INCIDENTS = "apps/frontend/src/components/safety/DriverIncidentsReverseSection.tsx";
const LABEL = "verify-safety-entitylink-reverse";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * SAF-B30. Every safety kind must (a) be declared, (b) resolve to a real route, and (c) have that
 * route's surface actually HONOR the param.
 *
 * (c) is the clause this guard was missing. It previously checked (a)+(b) for all six kinds but (c)
 * for only two — accidents and fines — so complaints, DOT inspections, escrow and permits navigated
 * to the right list and then did nothing. A link that lands on the correct page without selecting the
 * record is a facade: it looks wired from the calling surface and from this guard, and drills through
 * to nothing. Pinning six kinds while verifying two is how the guard came to ratify the defect.
 *
 * `honoredBy` names the file that must read the param, and `honorProof` the evidence it acts on it —
 * opening a drawer, selecting a row, or highlighting it. Reading a param and discarding it still fails.
 */
const SAFETY_KINDS = [
  { kind: "accident", route: "/safety/accidents?accident_id=", param: "accident_id",
    honoredBy: "apps/frontend/src/pages/safety/AccidentsPage.tsx", honorProof: /setDrawerOpen\(true\)/ },
  { kind: "safety_fine", route: "/safety/external-fines?fine_id=", param: "fine_id",
    honoredBy: "apps/frontend/src/pages/safety/FinesPage.tsx", honorProof: /setSelectedFine\(/ },
  { kind: "complaint", route: "/safety/complaints?complaint_id=", param: "complaint_id",
    honoredBy: "apps/frontend/src/pages/safety/ComplaintsPage.tsx", honorProof: /rowClassName=/ },
  { kind: "dot_inspection", route: "/safety/dot-inspections?inspection_id=", param: "inspection_id",
    honoredBy: "apps/frontend/src/pages/safety/DotInspectionsPage.tsx", honorProof: /rowClassName=/ },
  { kind: "escrow_record", route: "/safety/escrow-record?driver_id=", param: "driver_id",
    honoredBy: "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx", honorProof: /setSelected\(/ },
  { kind: "permit", route: "/safety/permits?permit_id=", param: "permit_id",
    honoredBy: "apps/frontend/src/pages/safety/PermitsPage.tsx", honorProof: /rowClassName=/ },
  // The three incident record types. One generic "incident" kind cannot resolve: the id alone does not
  // say which of the three lists holds it.
  { kind: "damage_report", route: "/safety/damage-reports?incident_id=", param: "incident_id",
    honoredBy: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", honorProof: /setDrawerOpen\(true\)/ },
  { kind: "trailer_interchange", route: "/safety/trailer-interchanges?incident_id=", param: "incident_id",
    honoredBy: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", honorProof: /setDrawerOpen\(true\)/ },
  { kind: "cargo_claim", route: "/safety/cargo-claims?incident_id=", param: "incident_id",
    honoredBy: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", honorProof: /setDrawerOpen\(true\)/ },
];

export function assertSafetyEntityLink(sources) {
  const el = stripComments(sources?.[ENTITYLINK] ?? read(ENTITYLINK));
  const accidents = stripComments(sources?.[ACCIDENTS] ?? read(ACCIDENTS));
  const fines = stripComments(sources?.[FINES] ?? read(FINES));
  const problems = [];

  const driverIncidents = stripComments(sources?.[DRIVER_INCIDENTS] ?? read(DRIVER_INCIDENTS));
  if (!/const incidents = query\.isError \? \[\] : \(query\.data\?\.incidents \?\? \[\]\)/.test(driverIncidents) || !/\{incidents\.map\(/.test(driverIncidents)) {
    problems.push(`${DRIVER_INCIDENTS}: failed reverse reads must suppress cached incident rows.`);
  }

  for (const { kind, route } of SAFETY_KINDS) {
    // Declared as an EntityKind.
    if (!new RegExp(`\\|\\s*"${kind}"`).test(el)) {
      problems.push(`${ENTITYLINK}: EntityKind union does not include "${kind}".`);
    }
    // Resolves to its route.
    if (!el.includes(`case "${kind}":`)) {
      problems.push(`${ENTITYLINK}: resolveEntityRoute has no case for "${kind}".`);
    }
    if (!el.includes(route)) {
      problems.push(`${ENTITYLINK}: "${kind}" does not resolve to ${route}… — the drill target is wrong or missing.`);
    }
  }

  // EVERY kind's surface must HONOR its param — read it AND act on it. Checked for all kinds, not two.
  const seen = new Set();
  for (const { kind, param, honoredBy, honorProof } of SAFETY_KINDS) {
    if (seen.has(honoredBy + param)) continue;
    seen.add(honoredBy + param);
    let src;
    try {
      src = stripComments(sources?.[honoredBy] ?? read(honoredBy));
    } catch {
      problems.push(`${honoredBy}: missing — "${kind}" resolves to a surface that does not exist.`);
      continue;
    }
    if (!new RegExp(`searchParams\\.get\\("${param}"\\)`).test(src)) {
      problems.push(`${honoredBy}: never reads ?${param}= — "${kind}" navigates here and drills through to nothing (facade).`);
    } else if (!honorProof.test(src)) {
      problems.push(`${honoredBy}: reads ?${param}= but nothing acts on it (expected ${honorProof}) — reading a param and discarding it is still a facade.`);
    }
  }

  // C-02 — accidents list must expose the reverse claim hop (insurance.claim ← accident_report_id).
  const accidentsList = stripComments(sources?.[ACCIDENTS] ?? read(ACCIDENTS));
  if (!/kind=["']claim["']/.test(accidentsList) || !/claim_id/.test(accidentsList)) {
    problems.push(`${ACCIDENTS}: must render EntityLink kind="claim" from row.claim_id (C-02 reverse hop)`);
  }
  const routesRel = "apps/backend/src/safety/safety.routes.ts";
  const routesSrc = stripComments(fs.readFileSync(path.join(ROOT, routesRel), "utf8"));
  if (!/accident_report_id\s*=\s*ar\.id/.test(routesSrc) || !/LEFT JOIN LATERAL/.test(routesSrc)) {
    problems.push(`${routesRel}: accidents list query must LATERAL-join insurance.claim on accident_report_id`);
  }

  // C-03 — ClaimsTab reverse incidents must deep-link (EntityLink + incident_id), not bare list Links.
  const claimsTabRel = "apps/frontend/src/pages/insurance/ClaimsTab.tsx";
  const claimsTab = stripComments(sources?.[claimsTabRel] ?? read(claimsTabRel));
  const reverseBlock = claimsTab.split("graph.reverse.incidents")[1] ?? "";
  if (
    !/kind=\{[^}]*trailer_interchange/.test(reverseBlock) ||
    !/kind=\{[^}]*cargo_claim/.test(reverseBlock) ||
    !/damage_report/.test(reverseBlock)
  ) {
    problems.push(
      `${claimsTabRel}: reverse.incidents must EntityLink kind=trailer_interchange|cargo_claim|damage_report (C-03)`
    );
  }
  if (/to=\{[^}]*\/safety\/(trailer-interchanges|cargo-claims|damage-reports)"/.test(reverseBlock) ||
      /to=\{[\s\S]*?\/safety\/trailer-interchanges"/.test(reverseBlock)) {
    problems.push(
      `${claimsTabRel}: reverse.incidents must not use bare <Link to="/safety/…"> without ?incident_id= (C-03 facade)`
    );
  }
  // Simpler facade detect: Link + one of the three bare paths inside the incidents map
  if (/<Link[\s\S]{0,400}\/safety\/(trailer-interchanges|cargo-claims|damage-reports)(?!\?incident_id=)/.test(reverseBlock)) {
    problems.push(
      `${claimsTabRel}: reverse.incidents bare Link to incident list without ?incident_id= (C-03)`
    );
  }

  // C-04 — AccidentReportDrawer must drill to linked claim_id when present (free-text field stays).
  const drawerRel = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
  const drawer = stripComments(sources?.[drawerRel] ?? read(drawerRel));
  if (!/accident-linked-claim/.test(drawer) || !/kind=["']claim["']/.test(drawer) || !/claim_id/.test(drawer)) {
    problems.push(
      `${drawerRel}: must EntityLink kind=claim from accident.claim_id (data-testid accident-linked-claim) — C-04`
    );
  }

  return problems;
}

if (SELFTEST) {
  const CLAIMS_TAB = "apps/frontend/src/pages/insurance/ClaimsTab.tsx";
  const live = {
    [ENTITYLINK]: read(ENTITYLINK),
    [ACCIDENTS]: read(ACCIDENTS),
    [FINES]: read(FINES),
    [DRIVER_INCIDENTS]: read(DRIVER_INCIDENTS),
    [CLAIMS_TAB]: read(CLAIMS_TAB),
  };
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = assertSafetyEntityLink(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  // 1. a safety kind's route case is removed.
  expectCaught(
    "kind-route-removed",
    { ...live, [ENTITYLINK]: live[ENTITYLINK].replace(/case "accident":\n\s*return `\/safety\/accidents\?accident_id=\$\{id\}`;/, "") },
    'no case for "accident"'
  );
  // 2. the accidents page stops honoring the param.
  expectCaught(
    "accidents-not-honored",
    { ...live, [ACCIDENTS]: live[ACCIDENTS].replace(/searchParams\.get\("accident_id"\)/, 'null /* removed */ || String("")') },
    "never reads ?accident_id=",
  );
  // 3. the fines page stops honoring the param.
  expectCaught(
    "fines-not-honored",
    { ...live, [FINES]: live[FINES].replace(/searchParams\.get\("fine_id"\)/, 'null /* removed */ || String("")') },
    "never reads ?fine_id=",
  );
  // 4. C-03 — ClaimsTab reverse incidents regress to bare list Links (no ?incident_id=).
  {
    const start = live[CLAIMS_TAB].indexOf("graph.reverse.incidents.map");
    const end = live[CLAIMS_TAB].indexOf("{(graph.reverse.bills", start);
    if (start < 0 || end < 0) {
      failures.push("claims-incident-bare-link: could not locate reverse.incidents block");
    } else {
      const planted =
        live[CLAIMS_TAB].slice(0, start) +
        `graph.reverse.incidents.map((i) => (
                  <Link key={i.id} className="mr-2 text-slate-700 underline" to="/safety/damage-reports" data-testid={\`claim-reverse-incident-\${i.id}\`}>
                    Incident
                  </Link>
                ))
                ` +
        live[CLAIMS_TAB].slice(end);
      expectCaught("claims-incident-bare-link", { ...live, [CLAIMS_TAB]: planted }, "C-03");
    }
  }
  // 5. C-04 — AccidentReportDrawer drops linked-claim hop.
  {
    const DRAWER = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
    const drawerSrc = read(DRAWER);
    expectCaught(
      "accident-drawer-no-claim-link",
      { ...live, [DRAWER]: drawerSrc.replace(/accident-linked-claim/g, "accident-no-claim").replace(/kind=["']claim["']/g, 'kind="driver"') },
      "C-04",
    );
  }

  // 6. A rejected reverse read must not leave cached incident rows mounted beneath the error.
  expectCaught(
    "driver-incidents-stale-rows",
    { ...live, [DRIVER_INCIDENTS]: live[DRIVER_INCIDENTS].replace("query.isError ? [] : (query.data?.incidents ?? [])", "query.data?.incidents ?? []") },
    "suppress cached incident rows",
  );

  const liveProblems = assertSafetyEntityLink(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertSafetyEntityLink();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — safety records drill through: ${SAFETY_KINDS.length} EntityLink kinds resolve AND every one of their surfaces honours its param`
);
