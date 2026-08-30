#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.safety_reverse","trailer.profile.safety_reverse"],"task":"FLEET-F5909-ASSET-SAFETY-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.safety_reverse","trailer.profile.safety_reverse"],"task":"FLEET-F5939-ASSET-SAFETY-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/**
 * GUARD: unit and trailer profiles show the asset's safety records (SAF-F17 / Law §9 reverse linkage).
 *
 * WHY THIS EXISTS (2026-07-23 audit)
 * `safety.accident_reports.unit_id`, `safety.dot_inspections.unit_id`/`trailer_id`,
 * `safety.dvir_submissions.unit_id`/`trailer_id` and `safety.incidents.unit_id`/`trailer_id` all
 * persisted the asset the event happened to, and NONE of it was readable from that asset. The unit
 * profile showed telemetry, maintenance, compliance, insurance and legal — and not one accident,
 * DOT inspection or DVIR. Three of the four list routes had no asset filter at all, so the reverse
 * read was not even expressible server-side. DEFINITION-OF-DONE §1.C.
 *
 * Fix contract this guard pins:
 *   1. The asset Safety section exists and reads accidents + DOT inspections + DVIRs + incidents.
 *   2. It is MOUNTED on BOTH profile pages — unit with assetKind="unit", trailer with "trailer".
 *      A component that exists but is not mounted is the classic fake fix.
 *   3. Scoping is SERVER-SIDE SQL on all four routes (each caps at LIMIT 500 / max 500, so a
 *      client-side filter silently under-reports an asset's compliance history past that cap).
 *   4. Accidents scope by unit OR trailer. `safety.accident_reports.trailer_id` landed in the
 *      RANK5/RANK6 create+reverse wave, so suppressing trailer history is now a compliance defect.
 *   5. The client actually sends the params — a server filter nothing reaches is dead code.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECTION = "apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx";
const ARCHIVED_DOT_PAGE = "apps/frontend/src/pages/safety/DotInspectionsPage.tsx";
const UNIT_PAGE = "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx";
const TRAILER_PAGE = "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx";
const API = "apps/frontend/src/api/safety.ts";
const ACCIDENTS_ROUTE = "apps/backend/src/safety/safety.routes.ts";
const DOT_ROUTE = "apps/backend/src/routes/safety/dot-inspections.ts";
const DVIR_ROUTE = "apps/backend/src/safety/dvir.routes.ts";
const INCIDENTS_ROUTE = "apps/backend/src/safety/incidents.routes.ts";
const FILES = [SECTION, ARCHIVED_DOT_PAGE, UNIT_PAGE, TRAILER_PAGE, API, ACCIDENTS_ROUTE, DOT_ROUTE, DVIR_ROUTE, INCIDENTS_ROUTE];
const MATRIX = "docs/specs/scoreboard/modules/fleet.required.json";
const FEED = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF = "scripts/verify-asset-safety-reverse-section.mjs";
const HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.safety_reverse","trailer.profile.safety_reverse"],"task":"FLEET-F5909-ASSET-SAFETY-REVERSE-EXACT","vertical":"class-sweep"} */';
const CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.safety_reverse","trailer.profile.safety_reverse"],"task":"FLEET-F5939-ASSET-SAFETY-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const LABEL = "verify-asset-safety-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const REQUIRED_READS = [
  { label: "accidents", needle: "getSafetyAccidents(" },
  { label: "DOT inspections", needle: "getDotInspections(" },
  { label: "DVIRs", needle: "getSafetyDvirSubmissions(" },
  { label: "incidents (damage / trailer interchange / cargo claim)", needle: "listSafetyIncidents(" },
];

export function assertAssetSafetyReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  src[MATRIX] = sources?.[MATRIX] ?? read(MATRIX);
  src[FEED] = sources?.[FEED] ?? read(FEED);
  src[SELF] = sources?.[SELF] ?? read(SELF);
  const problems = [];

  // 1. All four record types are read by the section.
  for (const { label, needle } of REQUIRED_READS) {
    if (!src[SECTION].includes(needle)) {
      problems.push(`${SECTION}: does not read ${label} (${needle}) — that record type stays invisible on the asset profile.`);
    }
  }
  if (!/data\?\.dot_inspections/.test(src[SECTION])) {
    problems.push(`${SECTION}: reads the wrong DOT response key — API returns dot_inspections, so the mounted asset reverse section renders empty.`);
  }
  if (!/data\?\.dot_inspections/.test(src[ARCHIVED_DOT_PAGE])) {
    problems.push(`${ARCHIVED_DOT_PAGE}: archived consumer must retain the canonical dot_inspections response contract so typecheck cannot drift.`);
  }
  // Asset scoping is passed on every read.
  if (!src[SECTION].includes("unit_id: assetId") || !src[SECTION].includes("trailer_id: assetId")) {
    problems.push(`${SECTION}: reads are not scoped to the asset (expected both \`unit_id: assetId\` and \`trailer_id: assetId\`).`);
  }
  for (const queryName of ["query", "accidentsQuery", "inspectionsQuery", "dvirQuery"]) {
    if (!new RegExp(`onRetry=\\{\\(\\) => void ${queryName}\\.refetch\\(\\)\\}`).test(src[SECTION])) {
      problems.push(`${SECTION}: ${queryName} failed reverse GET must expose its exact retry.`);
    }
  }
  if (!/isError \? <ListErrorState title=\{errorText\} status=\{0\} onRetry=\{onRetry\} \/>/.test(src[SECTION])) {
    problems.push(`${SECTION}: shared safety reverse error shell must render its retry action.`);
  }

  // 2. Mounted on BOTH profile pages, with the right asset kind.
  for (const [page, kind, label] of [
    [UNIT_PAGE, "unit", "unit profile"],
    [TRAILER_PAGE, "trailer", "trailer profile"],
  ]) {
    if (!src[page].includes("AssetSafetyReverseSection")) {
      problems.push(`${page}: does not mount AssetSafetyReverseSection — the ${label} still shows no safety records.`);
    } else if (!new RegExp(`<AssetSafetyReverseSection[\\s\\S]{0,300}assetKind="${kind}"`).test(src[page])) {
      problems.push(`${page}: AssetSafetyReverseSection is rendered without assetKind="${kind}".`);
    }
  }

  // 3. Server-side SQL scoping on all four routes.
  if (!/ar\.unit_id = \$/.test(src[ACCIDENTS_ROUTE])) {
    problems.push(`${ACCIDENTS_ROUTE}: GET accidents does not filter by unit in SQL — a client-side filter drops rows past LIMIT 500.`);
  }
  if (!/unit_id = \$/.test(src[DOT_ROUTE]) || !/trailer_id = \$/.test(src[DOT_ROUTE])) {
    problems.push(`${DOT_ROUTE}: GET dot-inspections must filter by BOTH unit_id and trailer_id in SQL (the table carries both).`);
  }
  if (!/ds\.trailer_id = \$/.test(src[DVIR_ROUTE])) {
    problems.push(`${DVIR_ROUTE}: GET dvir has no trailer_id filter — a trailer's DVIRs stay unreachable.`);
  }
  if (!/dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(src[DVIR_ROUTE])) {
    problems.push(`${DVIR_ROUTE}: exact-driver reverse must validate an owned or actively authorized driver parent.`);
  }
  if (!/label_dca\.company_id = ds\.operating_company_id[\s\S]{0,160}label_dca\.is_authorized = true[\s\S]{0,160}label_dca\.deactivated_at IS NULL/.test(src[DVIR_ROUTE])) {
    problems.push(`${DVIR_ROUTE}: DVIR driver labels must preserve active selected-company authorization.`);
  }
  if (!/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(src[DVIR_ROUTE])) {
    problems.push(`${DVIR_ROUTE}: an invalid exact driver must not render as a legitimate empty DVIR history.`);
  }
  if (!/wo\.display_id AS follow_up_wo_display_id/.test(src[DVIR_ROUTE])) {
    problems.push(`${DVIR_ROUTE}: DVIR list does not project the follow-up work-order display identity.`);
  }
  if (!/LEFT JOIN maintenance\.work_orders wo ON wo\.id = ds\.follow_up_wo_id[\s\S]{0,120}wo\.operating_company_id = ds\.operating_company_id/.test(src[DVIR_ROUTE])) {
    problems.push(`${DVIR_ROUTE}: follow-up work-order label join is not explicitly company scoped.`);
  }
  if (!/entityLabel\(dvir\.follow_up_wo_display_id, s\(dvir\.follow_up_wo_id\), "Work order"\)/.test(src[SECTION])) {
    problems.push(`${SECTION}: mounted DVIR reverse link does not consume the canonical work-order display identity.`);
  }
  for (const [kind, noun] of [["accident", "Accident"], ["dot_inspection", "DOT inspection"], ["dvir", "DVIR"], ["work_order", "Work order"]]) {
    const pattern = new RegExp(`EntityLinkOrTombstone[\\s\\S]{0,180}kind="${kind}"[\\s\\S]{0,220}noun="${noun}"`);
    if (!pattern.test(src[SECTION])) problems.push(`${SECTION}: ${kind} rows must use the governed resolved/tombstoned drill`);
  }
  if (!/EntityLinkOrTombstone[\s\S]{0,160}kind=\{kind\.type\}[\s\S]{0,220}id=\{s\(incident\.id\) \|\| null\}/.test(src[SECTION])) {
    problems.push(`${SECTION}: incident rows must preserve nullable IDs through the governed tombstone drill`);
  }
  // Band A Built — unit.profile.safety_reverse owes driver drills when the API already returns driver_id.
  // Plain-text driver_name on accidents/DVIRs was the remaining reverse gap after WO EntityLinks shipped.
  if (!/EntityLinkOrTombstone[\s\S]{0,220}kind="driver"[\s\S]{0,220}accident\.driver_id|accident\.driver_id[\s\S]{0,280}EntityLinkOrTombstone[\s\S]{0,120}kind="driver"/.test(src[SECTION])) {
    problems.push(`${SECTION}: accident rows must EntityLinkOrTombstone the canonical driver (not plain-text driver_name).`);
  }
  if (!/data-testid="asset-safety-accident-driver-link"/.test(src[SECTION])) {
    problems.push(`${SECTION}: accident driver drill must expose data-testid=asset-safety-accident-driver-link for Live Leaves.`);
  }
  if (!/EntityLinkOrTombstone[\s\S]{0,220}kind="driver"[\s\S]{0,220}dvir\.driver_id|dvir\.driver_id[\s\S]{0,280}EntityLinkOrTombstone[\s\S]{0,120}kind="driver"/.test(src[SECTION])) {
    problems.push(`${SECTION}: DVIR rows must EntityLinkOrTombstone the canonical driver (not plain-text driver_name).`);
  }
  if (!/data-testid="asset-safety-dvir-driver-link"/.test(src[SECTION])) {
    problems.push(`${SECTION}: DVIR driver drill must expose data-testid=asset-safety-dvir-driver-link for Live Leaves.`);
  }
  if (!/i\.trailer_id = \$/.test(src[INCIDENTS_ROUTE])) {
    problems.push(`${INCIDENTS_ROUTE}: GET incidents has no trailer_id filter — trailer interchanges stay unreachable from the trailer they concern.`);
  }

  // 4. Accidents scope by the active asset kind; both FKs exist on safety.accident_reports.
  // SAFETY-F6864 added bounded pagination around the already-canonical asset filter. Accept the
  // current object-spread call shape (and only that exact unit/trailer discriminator) so adding
  // limit/offset cannot make a correctly wired surface fail while either FK still remains pinned.
  if (!/getSafetyAccidents\(\s*operatingCompanyId,\s*\{[\s\S]{0,120}\.\.\.\(isUnit \? \{ unit_id: assetId \} : \{ trailer_id: assetId \}\)[\s\S]{0,180}\}\s*\)/.test(src[SECTION])) {
    problems.push(`${SECTION}: accidents query must send the active unit_id or trailer_id FK.`);
  }
  if (!/openKind=\{isUnit \? "accidents_unit" : "accidents_trailer"\}/.test(src[SECTION])) {
    problems.push(`${SECTION}: Open Accidents must EntityLink accidents_unit/accidents_trailer filtered queues.`);
  }
  if (!/unitOpenKind: "damage_reports_unit"/.test(src[SECTION]) || !/openKind=\{assetKind === "unit" \? kind\.unitOpenKind : kind\.trailerOpenKind\}/.test(src[SECTION])) {
    problems.push(`${SECTION}: Open Damage/Interchange/Cargo must EntityLink asset-filtered incident queues.`);
  }
  if (!/openKind=\{isUnit \? "dot_inspections_unit" : "dot_inspections_trailer"\}/.test(src[SECTION])) {
    problems.push(`${SECTION}: Open DOT Inspections must EntityLink asset-filtered queues.`);
  }
  if (!/openKind=\{isUnit \? "dvir_unit" : "dvir_trailer"\}/.test(src[SECTION])) {
    problems.push(`${SECTION}: Open DVIRs must EntityLink asset-filtered queues.`);
  }
  // LINK-F5171: SectionShell must not keep a bare Link fallback (to={to ?? "#"}).
  if (/from "react-router-dom"/.test(src[SECTION]) || /to=\{to \?\? "#"\}/.test(src[SECTION]) || /<Link className="text-xs font-semibold text-slate-700 underline"/.test(src[SECTION])) {
    problems.push(`${SECTION}: SectionShell Open must be EntityLink-only — bare Link / to={to ?? "#"} fallback is forbidden.`);
  }
  if (!/ar\.trailer_id = \$/.test(src[ACCIDENTS_ROUTE])) {
    problems.push(`${ACCIDENTS_ROUTE}: GET accidents does not filter by trailer in SQL.`);
  }

  // 5. The client sends the params.
  for (const [needle, what] of [
    [`qs.set("unit_id", params.unit_id)`, "unit_id on accidents/DOT"],
    [`qs.set("trailer_id", params.trailer_id)`, "trailer_id on DOT"],
    [`qs.set("trailer_id", filters.trailer_id)`, "trailer_id on DVIR/incidents"],
  ]) {
    if (!src[API].includes(needle)) {
      problems.push(`${API}: does not send ${what} — the server-side filter is unreachable.`);
    }
  }

  let matrix;
  try { matrix = JSON.parse(src[MATRIX]); } catch (error) { problems.push(`Fleet matrix parse: ${error.message}`); }
  for (const [id, route] of [["unit.profile.safety_reverse", "/fleet/units/:id"], ["trailer.profile.safety_reverse", "/fleet/trailers/:id"]]) {
    const leaf = matrix?.leaves?.find((row) => row.id === id);
    if (!leaf?.required?.includes("reverse_link")) problems.push(`${id} must require reverse_link`);
    if (!leaf?.required?.includes("connectivity")) problems.push(`${id} must require connectivity`);
    if (leaf?.route_hint !== route) problems.push(`${id} must name mounted route ${route}`);
  }
  if (!src[SELF].split('import fs from "node:fs";')[0].includes(HEADER)) problems.push("exact Fleet asset-safety header missing");
  if (!src[SELF].split('import fs from "node:fs";')[0].includes(CONNECTIVITY_HEADER)) problems.push("exact Fleet asset-safety connectivity header missing");
  try { if (JSON.parse(src[FEED]).entries?.some((entry) => entry.guard === SELF)) problems.push("manual feed duplicates Fleet asset-safety ownership"); }
  catch (error) { problems.push(`feed parse: ${error.message}`); }

  return problems;
}

const mutateLeaf = (source, id, mutate) => {
  const parsed = JSON.parse(source);
  const leaf = parsed.leaves.find((row) => row.id === id);
  mutate(leaf);
  return JSON.stringify(parsed);
};

if (SELFTEST) {
  const live = Object.fromEntries([...FILES, MATRIX, FEED, SELF].map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertAssetSafetyReverse(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "record-type-dropped",
    { ...live, [SECTION]: live[SECTION].replace(/getSafetyDvirSubmissions\(/g, "noopRemoved(") },
    "does not read DVIRs"
  );
  expectCaught(
    "dvir-retry-removed",
    { ...live, [SECTION]: live[SECTION].replace(/onRetry=\{\(\) => void dvirQuery\.refetch\(\)\}/, "onRetry={() => undefined}") },
    "dvirQuery failed reverse GET must expose its exact retry"
  );
  expectCaught(
    "dot-response-key-drift",
    { ...live, [SECTION]: live[SECTION].replace(/data\?\.dot_inspections/g, "data?.inspections") },
    "reads the wrong DOT response key"
  );
  expectCaught(
    "archived-dot-response-key-drift",
    { ...live, [ARCHIVED_DOT_PAGE]: live[ARCHIVED_DOT_PAGE].replace(/data\?\.dot_inspections/g, "data?.inspections") },
    "archived consumer must retain"
  );
  expectCaught(
    "unit-page-not-mounted",
    { ...live, [UNIT_PAGE]: live[UNIT_PAGE].replace(/AssetSafetyReverseSection/g, "SomethingElse") },
    "does not mount AssetSafetyReverseSection"
  );
  expectCaught(
    "trailer-page-not-mounted",
    { ...live, [TRAILER_PAGE]: live[TRAILER_PAGE].replace(/AssetSafetyReverseSection/g, "SomethingElse") },
    "does not mount AssetSafetyReverseSection"
  );
  expectCaught(
    "accidents-filter-removed",
    { ...live, [ACCIDENTS_ROUTE]: live[ACCIDENTS_ROUTE].replace(/AND ar\.unit_id = \$\$\{values\.length\}/g, "") },
    "does not filter by unit in SQL"
  );
  expectCaught(
    "dot-trailer-filter-removed",
    { ...live, [DOT_ROUTE]: live[DOT_ROUTE].replace(/AND di\.trailer_id = \$\$\{values\.length\}/g, "") },
    "must filter by BOTH unit_id and trailer_id"
  );
  expectCaught(
    "dvir-trailer-filter-removed",
    { ...live, [DVIR_ROUTE]: live[DVIR_ROUTE].replace(/ds\.trailer_id = \$\$\{idx\+\+\}/g, "TRUE") },
    "has no trailer_id filter"
  );
  expectCaught(
    "dvir-driver-parent-authorization-removed",
    { ...live, [DVIR_ROUTE]: live[DVIR_ROUTE].replace(/dca\.is_authorized = true/, "TRUE") },
    "actively authorized driver parent"
  );
  expectCaught(
    "dvir-driver-label-authorization-removed",
    { ...live, [DVIR_ROUTE]: live[DVIR_ROUTE].replace(/label_dca\.is_authorized = true/, "TRUE") },
    "labels must preserve active selected-company authorization"
  );
  expectCaught(
    "dvir-driver-parent-404-removed",
    { ...live, [DVIR_ROUTE]: live[DVIR_ROUTE].replace(/if \(!result\.found\) return reply\.code\(404\)/, "if (false) return reply.code(404)") },
    "must not render as a legitimate empty DVIR history"
  );
  expectCaught(
    "dvir-wo-label-projection-removed",
    { ...live, [DVIR_ROUTE]: live[DVIR_ROUTE].replace(/wo\.display_id AS follow_up_wo_display_id/g, "NULL AS follow_up_wo_display_id") },
    "does not project the follow-up work-order"
  );
  expectCaught(
    "dvir-wo-label-scope-removed",
    { ...live, [DVIR_ROUTE]: live[DVIR_ROUTE].replace(/AND wo\.operating_company_id = ds\.operating_company_id/g, "AND TRUE") },
    "label join is not explicitly company scoped"
  );
  expectCaught(
    "dvir-wo-label-consumer-removed",
    { ...live, [SECTION]: live[SECTION].replace(/entityLabel\(dvir\.follow_up_wo_display_id, s\(dvir\.follow_up_wo_id\), "Work order"\)/g, 'entityLabel(null, s(dvir.follow_up_wo_id), "Work order")') },
    "does not consume the canonical work-order"
  );
  expectCaught(
    "accident-record-tombstone-removed",
    { ...live, [SECTION]: live[SECTION].replace(/<EntityLinkOrTombstone\s+kind="accident"/, '<EntityLink kind="accident"') },
    "accident rows must use the governed"
  );
  expectCaught(
    "incident-nullable-drill-removed",
    { ...live, [SECTION]: live[SECTION].replace(/id=\{s\(incident\.id\) \|\| null\}/, 'id={s(incident.id)}') },
    "incident rows must preserve nullable IDs"
  );
  expectCaught(
    "accident-driver-plain-text",
    {
      ...live,
      [SECTION]: live[SECTION].replace(
        /\{accident\.driver_id \|\| accident\.driver_name \? \([\s\S]*?\) : null\}/,
        '{accident.driver_name ? ` · ${s(accident.driver_name)}` : ""}'
      ),
    },
    "accident rows must EntityLinkOrTombstone"
  );
  expectCaught(
    "dvir-driver-plain-text",
    {
      ...live,
      [SECTION]: live[SECTION].replace(
        /\{dvir\.driver_id \|\| dvir\.driver_name \? \([\s\S]*?\) : null\}/,
        '<span className="ml-2 text-gray-600">{s(dvir.driver_name)}</span>'
      ),
    },
    "DVIR rows must EntityLinkOrTombstone"
  );
  expectCaught(
    "incidents-trailer-filter-removed",
    { ...live, [INCIDENTS_ROUTE]: live[INCIDENTS_ROUTE].replace(/i\.trailer_id = \$\$\{params\.length\}/g, "TRUE") },
    "trailer interchanges stay unreachable"
  );
  expectCaught(
    "accidents-trailer-client-filter-removed",
    {
      ...live,
      [SECTION]: live[SECTION].replace(
        /\.\.\.\(isUnit \? \{ unit_id: assetId \} : \{ trailer_id: assetId \}\)/,
        "...(isUnit ? { unit_id: assetId } : {})"
      ),
    },
    "active unit_id or trailer_id"
  );
  expectCaught(
    "open-accidents-queue",
    {
      ...live,
      [SECTION]: live[SECTION].replace(
        /openKind=\{isUnit \? "accidents_unit" : "accidents_trailer"\}/g,
        'to="/safety/accidents"'
      ),
    },
    "Open Accidents must EntityLink"
  );
  expectCaught(
    "open-incident-queues",
    {
      ...live,
      [SECTION]: live[SECTION].replace(
        /openKind=\{assetKind === "unit" \? kind\.unitOpenKind : kind\.trailerOpenKind\}/g,
        'to={kind.route}'
      ),
    },
    "Open Damage/Interchange/Cargo must EntityLink"
  );
  expectCaught(
    "open-dot-queue",
    {
      ...live,
      [SECTION]: live[SECTION].replace(
        /openKind=\{isUnit \? "dot_inspections_unit" : "dot_inspections_trailer"\}/g,
        'to="/safety/dot-inspections"'
      ),
    },
    "Open DOT Inspections must EntityLink"
  );
  expectCaught(
    "open-dvir-queue",
    {
      ...live,
      [SECTION]: live[SECTION].replace(
        /openKind=\{isUnit \? "dvir_unit" : "dvir_trailer"\}/g,
        'to="/safety/idvr"'
      ),
    },
    "Open DVIRs must EntityLink"
  );
  expectCaught(
    "accidents-trailer-server-filter-removed",
    { ...live, [ACCIDENTS_ROUTE]: live[ACCIDENTS_ROUTE].replace(/AND ar\.trailer_id = \$\$\{values\.length\}/g, "") },
    "does not filter by trailer"
  );
  expectCaught(
    "client-param-not-sent",
    { ...live, [API]: live[API].replace(/qs\.set\("trailer_id", filters\.trailer_id\)/g, "void 0") },
    "trailer_id on DVIR/incidents"
  );
  expectCaught(
    "bare-link-fallback",
    {
      ...live,
      [SECTION]: live[SECTION].replace(
        /<EntityLink\n          kind=\{openKind\}\n          id=\{openId\}\n          label=\{linkLabel\}\n          className="text-xs font-semibold text-slate-700 underline"\n        \/>/,
        '<Link className="text-xs font-semibold text-slate-700 underline" to={to ?? "#"}>{linkLabel}</Link>'
      ),
    },
    "EntityLink-only"
  );
  for (const [id, route] of [["unit.profile.safety_reverse", "/fleet/units/:id"], ["trailer.profile.safety_reverse", "/fleet/trailers/:id"]]) {
    expectCaught(
      `${id}-required-id`,
      { ...live, [MATRIX]: mutateLeaf(live[MATRIX], id, (leaf) => { leaf.id += ".broken"; }) },
      `${id} must require reverse_link`
    );
    expectCaught(
      `${id}-route`,
      { ...live, [MATRIX]: mutateLeaf(live[MATRIX], id, (leaf) => { leaf.route_hint = "/broken"; }) },
      `${id} must name mounted route ${route}`
    );
    expectCaught(
      `${id}-connectivity`,
      { ...live, [MATRIX]: mutateLeaf(live[MATRIX], id, (leaf) => { leaf.required = leaf.required.filter((column) => column !== "connectivity"); }) },
      `${id} must require connectivity`
    );
  }
  expectCaught(
    "exact-header",
    { ...live, [SELF]: live[SELF].replace(HEADER, HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) },
    "exact Fleet asset-safety header missing"
  );
  expectCaught(
    "exact-connectivity-header",
    { ...live, [SELF]: live[SELF].replace(CONNECTIVITY_HEADER, CONNECTIVITY_HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) },
    "exact Fleet asset-safety connectivity header missing"
  );
  expectCaught(
    "duplicate-feed",
    { ...live, [FEED]: JSON.stringify({ entries: [{ guard: SELF }] }) },
    "manual feed duplicates Fleet asset-safety ownership"
  );

  // The corrected shape must NOT be flagged — false positives burn trust as fast as misses.
  const liveProblems = assertAssetSafetyReverse(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 30/30 runtime/evidence defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertAssetSafetyReverse();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — unit + trailer profiles surface accidents, DOT inspections, DVIRs and incidents, asset-scoped in SQL`
);
