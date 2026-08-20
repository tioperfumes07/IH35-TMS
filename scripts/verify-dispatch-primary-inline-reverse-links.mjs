#!/usr/bin/env node
/**
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
  driver: "apps/frontend/src/components/dispatch/InlineDriverPicker.tsx",
  unit: "apps/frontend/src/components/dispatch/InlineUnitPicker.tsx",
  trailer: "apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx",
};
const source = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(candidate = source) {
  const failures = [];
  for (const [key, kind, id, noun] of [
    ["driver", "driver", "driverId", "Driver"],
    ["unit", "unit", "unitId", "Unit"],
    ["trailer", "trailer", "trailerId", "Trailer"],
  ]) {
    const text = candidate[key];
    if (!text.includes('import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone"')) failures.push(`${key}: canonical link import missing`);
    if (!text.includes(`<EntityLinkOrTombstone\n            kind="${kind}"`) || !text.includes(`id={${id}}`) || !text.includes(`noun="${noun}"`)) failures.push(`${key}: canonical assigned-identity drill missing`);
    if (!text.includes(`data-testid={\`inline-${key}-picker-\${loadId}\`}`)) failures.push(`${key}: independent assignment action missing`);
    if (!text.includes(`{${id} ? "Change" : "Assign"}`)) failures.push(`${key}: assignment action state is not honest`);
  }
  for (const component of ["InlineDriverPicker", "InlineUnitPicker", "InlineTrailerPicker"]) {
    if (!candidate.board.includes(`<${component}`)) failures.push(`board: ${component} is not mounted`);
  }
  if (!candidate.board.includes("const inlineQuicksaveEnabled = true")) failures.push("board: guard no longer traces the always-mounted quick-save branch");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["driver", '<EntityLinkOrTombstone\n            kind="driver"', '<span\n            data-kind="driver"', "driver drill"],
    ["unit", '<EntityLinkOrTombstone\n            kind="unit"', '<span\n            data-kind="unit"', "unit drill"],
    ["trailer", '<EntityLinkOrTombstone\n            kind="trailer"', '<span\n            data-kind="trailer"', "trailer drill"],
    ["driver", "{driverId ? \"Change\" : \"Assign\"}", "Change", "driver change action"],
    ["board", "<InlineTrailerPicker", "<RemovedInlineTrailerPicker", "mounted trailer control"],
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
