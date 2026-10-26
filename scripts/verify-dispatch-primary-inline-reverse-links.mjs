#!/usr/bin/env node
/**
 * @matrix-built {"modules":["dispatch"],"cols":["driver","unit","trailer","reverse_link"],"leafRe":"^inline-(driver|unit|trailer)-picker$","task":"DISPATCH-PRIMARY-INLINE-REVERSE-LINKS","vertical":"class-sweep"}
 * Dispatch PRIMARY reverse-link guard.
 *
 * DispatchBoard always enables inline quick-save. The closed-state assignment controls must expose
 * canonical drills as well as the independent Assign/Change action; a picker button alone is not
 * reverse connectivity.
 */
import fs from "node:fs";

const LABEL = "verify-dispatch-primary-inline-reverse-links";
const paths = {
  board: "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  api: "apps/frontend/src/api/loads.ts",
  backend: "apps/backend/src/mdata/loads.routes.ts",
  loadService: "apps/backend/src/dispatch/load-service.ts",
  driver: "apps/frontend/src/components/dispatch/InlineDriverPicker.tsx",
  unit: "apps/frontend/src/components/dispatch/InlineUnitPicker.tsx",
  trailer: "apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx",
};
const source = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(candidate = source) {
  const failures = [];
  const listContract = candidate.api.match(/export type DispatchLoadRow = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  for (const [key, kind, id, noun] of [
    ["driver", "driver", "driverId", "Driver"],
    ["unit", "unit", "unitId", "Unit"],
    ["trailer", "trailer", "trailerId", "Trailer"],
  ]) {
    const text = candidate[key];
    if (!text.includes('import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone"')) failures.push(`${key}: canonical link import missing`);
    if (!text.includes(`<EntityLinkOrTombstone\n            kind="${kind}"`) || !text.includes(`id={${id}}`) || !text.includes(`noun="${noun}"`)) failures.push(`${key}: canonical assigned-identity drill missing`);
    if (!text.includes(`data-testid={\`inline-${key}-picker-\${loadId}\`}`)) failures.push(`${key}: independent assignment action missing`);
    // RE-PIN 2026-09-06: the pickers evolved from explicit "Change"/"Assign" button labels to
    // EntityLinkOrTombstone (assigned) vs "—" span (unassigned). The contract is that the component
    // honestly distinguishes assigned vs unassigned state — the ternary on the id variable satisfies that.
    if (!text.includes(`{${id} ?`) && !text.includes(`{${id}?`)) failures.push(`${key}: assignment action state is not honest`);
  }
  for (const component of ["InlineDriverPicker", "InlineUnitPicker", "InlineTrailerPicker"]) {
    if (!candidate.board.includes(`<${component}`)) failures.push(`board: ${component} is not mounted`);
  }
  if (!candidate.board.includes("const inlineQuicksaveEnabled = true")) failures.push("board: guard no longer traces the always-mounted quick-save branch");
  if (!listContract.includes("trailer_id?: string | null;") || !listContract.includes("trailer_number?: string | null;")) {
    failures.push("api: dispatch list contract omits canonical trailer id/label");
  }
  for (const needle of [
    "tr.id AS trailer_id",
    "FROM dispatch.load_assignment_history lah",
    "AND lah.operating_company_id = l.operating_company_id",
    "COALESCE(eq.currently_leased_to_company_id, eq.owner_company_id) = l.operating_company_id",
    "ORDER BY lah.assigned_at DESC, lah.created_at DESC",
  ]) {
    if (!candidate.backend.includes(needle)) failures.push(`backend: mounted list producer missing ${needle}`);
  }
  // The label: the fleet trailer's number, or — LEAD 23:45Z parity — the load service's ONE trailer projection, which
  // also resolves a customer (non-owned) trailer and falls back to the same fleet tr.equipment_number. #bb402de45e
  // replaced the helper with the bare column to satisfy this needle; customer trailers then rendered null (reverted).
  const helperBody = candidate.loadService.slice(candidate.loadService.indexOf("export function loadServiceTrailerNumberSql("), candidate.loadService.indexOf("export function loadServiceTrailerNumberSql(") + 900);
  const viaHelper = candidate.backend.includes('${loadServiceTrailerNumberSql("l", "tr")} AS trailer_number') &&
    /ELSE \$\{fleetTrailerAlias\}\.equipment_number END/.test(helperBody) && /dispatch\.non_owned_trailers/.test(helperBody);
  if (!viaHelper && !candidate.backend.includes("tr.equipment_number AS trailer_number")) failures.push("backend: mounted list producer missing the trailer label (tr.equipment_number AS trailer_number or loadServiceTrailerNumberSql(\"l\", \"tr\"))");
  if (!candidate.board.includes("id={load.trailer_id}") || !candidate.board.includes('name={load.trailer_number}')) {
    failures.push("board: trailer reverse drill does not consume the typed list id/label");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["driver", '<EntityLinkOrTombstone\n            kind="driver"', '<span\n            data-kind="driver"', "driver drill"],
    ["unit", '<EntityLinkOrTombstone\n            kind="unit"', '<span\n            data-kind="unit"', "unit drill"],
    ["trailer", '<EntityLinkOrTombstone\n            kind="trailer"', '<span\n            data-kind="trailer"', "trailer drill"],
    ["driver", "{driverId ?", "{false ?", "driver change action"],
    ["board", "<InlineTrailerPicker", "<RemovedInlineTrailerPicker", "mounted trailer control"],
    ["api", "assigned_unit_number: string | null;\n  trailer_id?: string | null;", "assigned_unit_number: string | null;", "trailer id response contract"],
    ["backend", "tr.id AS trailer_id", "NULL::uuid AS trailer_id", "trailer id projection"],
    ["backend", '${loadServiceTrailerNumberSql("l", "tr")} AS trailer_number', "NULL::text AS trailer_number", "trailer label projection"],
    ["loadService", "ELSE ${fleetTrailerAlias}.equipment_number END", "ELSE NULL END", "helper drops the fleet trailer label"],
    ["backend", "AND lah.operating_company_id = l.operating_company_id", "", "assignment-history entity scope"],
    ["board", "id={load.trailer_id}", "id={null}", "mounted trailer id consumer"],
  ];
  const escaped = [];
  for (const [key, needle, replacement, name] of mutations) {
    if (!source[key].includes(needle)) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    const mutant = { ...source, [key]: source[key].replace(needle, replacement) };
    if (audit(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n- ${escaped.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — mounted Dispatch PRIMARY keeps driver/unit/trailer assign controls and canonical drills`);
