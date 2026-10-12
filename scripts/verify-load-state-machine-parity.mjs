#!/usr/bin/env node
/**
 * GUARD: the shared-types load state machine must stay equivalent to the backend canon,
 * and the office drawer must never offer an exception outcome as a one-click button.
 */
import { readFileSync } from "node:fs";

const CANON = "apps/backend/src/dispatch/load-state-machine.ts";
const MIRROR = "packages/shared-types/src/dispatch/load-state-machine.ts";
const EXCEPTION_OUTCOMES = new Set(["cancelled", "abandoned", "driver_walkoff", "driver_no_show"]);

const failures = [];

function readSources(mirrorOverride) {
  return {
    canon: readFileSync(CANON, "utf8"),
    mirror: mirrorOverride ?? readFileSync(MIRROR, "utf8"),
  };
}

function statusesFromEnum(src) {
  const start = src.indexOf("dispatchStatusSchema = z.enum(");
  if (start === -1) return null;
  const open = src.indexOf("[", start);
  const close = src.indexOf("]", open);
  return [...src.slice(open + 1, close).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

function statusesFromUnion(src) {
  const start = src.indexOf("export type DispatchStatus =");
  if (start === -1) return null;
  const end = src.indexOf(";", start);
  return [...src.slice(start, end).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

function parseTable(src, header, label) {
  const start = src.indexOf(header);
  if (start === -1) {
    failures.push(`${label}: could not find \`${header}\``);
    return null;
  }
  const open = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    failures.push(`${label}: unbalanced braces after \`${header}\``);
    return null;
  }
  const table = {};
  for (const m of src.slice(open + 1, end).matchAll(/([a-z_]+)\s*:\s*\[([^\]]*)\]/g)) {
    table[m[1]] = [...m[2].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  }
  return table;
}

function parseAliases(src, label) {
  const map = {};
  for (const line of src.split("\n")) {
    const ret = line.match(/return "([a-z_]+)"/);
    if (!ret || !line.includes("status ===")) continue;
    for (const s of line.matchAll(/status === "([a-z_]+)"/g)) map[s[1]] = ret[1];
  }
  if (Object.keys(map).length === 0) failures.push(`${label}: parsed zero mdata alias mappings`);
  return map;
}

function runChecks(mirrorOverride) {
  failures.length = 0;
  const { canon, mirror } = readSources(mirrorOverride);

  const canonStatuses = statusesFromEnum(canon);
  const mirrorStatuses = statusesFromUnion(mirror);
  if (!canonStatuses) failures.push("canon: could not parse dispatchStatusSchema");
  if (!mirrorStatuses) failures.push("mirror: could not parse `export type DispatchStatus`");
  if (canonStatuses && mirrorStatuses && JSON.stringify(canonStatuses) !== JSON.stringify(mirrorStatuses)) {
    failures.push(
      `status list drift:\n  canon : ${JSON.stringify(canonStatuses)}\n  mirror: ${JSON.stringify(mirrorStatuses)}`
    );
  }

  // LEAD 443.99 class B (2026-10-12).
  //   old rule: the canon's literal `const allowedTransitions = { ... }` table equals the mirror's ALLOWED_TRANSITIONS.
  //   new rule: the canon's `forwardTransitions` table equals the mirror's ALLOWED_TRANSITIONS exactly; the canon's
  //             allowedTransitions must still be built as forwardTransitions + REVERSIBLE_BACK_EDGES; and the mirror
  //             must carry NO back-edge (a reverse move needs a reason the frontend cannot yet send).
  //   why: #21942 (28fe56dfa6, owner order 2026-09-12) split the canon into forward edges + reason-gated Zone-1
  //        back-edges merged at runtime; the literal table no longer exists, so the parser read nothing and every
  //        edge reported as drift. The FE confirm-modal was explicitly deferred in that PR — a mirror offering a
  //        back-edge would render a one-click move the route refuses (400 reversal_reason_required).
  const canonTable = parseTable(canon, "const forwardTransitions", "canon");
  const mirrorTable = parseTable(mirror, "ALLOWED_TRANSITIONS", "mirror");
  if (!/for \(const \[from, to\] of REVERSIBLE_BACK_EDGES\)[\s\S]{0,120}merged\[from\]\.push\(to\)/.test(canon) ||
      !/const allowedTransitions[\s\S]{0,200}Object\.entries\(forwardTransitions\)/.test(canon)) {
    failures.push("canon: allowedTransitions must be forwardTransitions + REVERSIBLE_BACK_EDGES");
  }
  const backEdgesBlock = canon.slice(canon.indexOf("export const REVERSIBLE_BACK_EDGES"), canon.indexOf("const allowedTransitions"));
  const backEdges = [...backEdgesBlock.matchAll(/\["([a-z_]+)",\s*"([a-z_]+)"\]/g)].map((m) => [m[1], m[2]]);
  if (backEdges.length === 0) failures.push("canon: parsed zero REVERSIBLE_BACK_EDGES");
  if (mirrorTable) {
    for (const [from, to] of backEdges) {
      if ((mirrorTable[from] ?? []).includes(to)) {
        failures.push(`mirror offers reverse edge ${from} -> ${to} with no reason path (route requires reversal_reason)`);
      }
    }
  }
  if (canonTable && mirrorTable) {
    for (const k of new Set([...Object.keys(canonTable), ...Object.keys(mirrorTable)])) {
      const a = JSON.stringify(canonTable[k] ?? null);
      const b = JSON.stringify(mirrorTable[k] ?? null);
      if (a !== b) failures.push(`transition drift for "${k}":\n  canon : ${a}\n  mirror: ${b}`);
    }
    for (const s of canonStatuses ?? []) {
      if (!(s in canonTable)) failures.push(`canon transition table is missing status "${s}"`);
      if (!(s in mirrorTable)) failures.push(`mirror transition table is missing status "${s}"`);
    }
  }

  const canonAlias = parseAliases(
    canon.slice(canon.indexOf("export function fromMdataStatus"), canon.indexOf("export function toMdataStatus")),
    "canon"
  );
  const mirrorAlias = parseAliases(
    mirror.slice(mirror.indexOf("export function fromMdataStatus"), mirror.indexOf("export function tryFromMdataStatus")),
    "mirror"
  );
  for (const k of new Set([...Object.keys(canonAlias), ...Object.keys(mirrorAlias)])) {
    if (canonAlias[k] !== mirrorAlias[k]) {
      failures.push(
        `mdata alias drift for "${k}": canon=${canonAlias[k] ?? "MISSING"} mirror=${mirrorAlias[k] ?? "MISSING"}`
      );
    }
  }

  const excludedBlock = mirror.slice(
    mirror.indexOf("OFFICE_DRAWER_EXCLUDED_TARGETS"),
    mirror.indexOf("OFFICE_TRANSITION_LABELS")
  );
  const excluded = new Set([...excludedBlock.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
  if (excluded.size === 0) failures.push("mirror: parsed zero OFFICE_DRAWER_EXCLUDED_TARGETS");
  for (const outcome of EXCEPTION_OUTCOMES) {
    if (!excluded.has(outcome)) {
      failures.push(
        `office drawer would render "${outcome}" as a one-click button. It is an exception outcome and ` +
          `must keep its reason-coded control (CancelLoadModal / Report abandonment). Add it to OFFICE_DRAWER_EXCLUDED_TARGETS.`
      );
    }
  }
  for (const t of excluded) {
    if (canonStatuses && !canonStatuses.includes(t)) failures.push(`excluded target "${t}" is not a DispatchStatus`);
  }

  if (
    !/const current = tryFromMdataStatus\(currentMdataStatus\)/.test(mirror) ||
    !/if \(current === null\) return \[\]/.test(mirror)
  ) {
    failures.push(
      "getOfficeTransitionButtons must resolve the status via tryFromMdataStatus and return [] on null. " +
        "It is called inside LoadDetailDrawer's render; the throwing fromMdataStatus blanks the drawer."
    );
  }
  if (/export function loadCanMark\w+\([^)]*\)[^{]*\{\s*return getOfficeTransitionButtons/.test(mirror) === false) {
    failures.push("loadCanMark* must derive from getOfficeTransitionButtons, never a second hardcoded rule");
  }

  return { canonStatuses, canonTable, canonAlias, excluded };
}

if (process.argv.includes("--selftest")) {
  const original = readFileSync(MIRROR, "utf8");
  const planted = [
    {
      name: "missing abandoned from excluded list",
      mutate: (src) =>
        src.replace(
          /export const OFFICE_DRAWER_EXCLUDED_TARGETS: readonly DispatchStatus\[\] = \[[\s\S]*?\];/,
          'export const OFFICE_DRAWER_EXCLUDED_TARGETS: readonly DispatchStatus[] = ["cancelled", "driver_walkoff", "driver_no_show"];'
        ),
      expect: /would render "abandoned" as a one-click button/,
    },
    {
      name: "reverted getOfficeTransitionButtons to fromMdataStatus",
      mutate: (src) =>
        src.replace(
          /const current = tryFromMdataStatus\(currentMdataStatus\);\n  if \(current === null\) return \[\]/,
          "const current = fromMdataStatus(currentMdataStatus)"
        ),
      expect: /must resolve the status via tryFromMdataStatus/,
    },
    {
      name: "mirror offers a reason-gated back edge",
      mutate: (src) => src.replace(/(\n\s*in_transit:\s*\[)/, '$1"dispatched", '),
      expect: /mirror offers reverse edge in_transit -> dispatched|transition drift for "in_transit"/,
    },
    {
      name: "mirror drops a forward edge",
      mutate: (src) => src.replace(/(\n\s*unassigned:\s*\[)"assigned_not_dispatched",\s*/, "$1"),
      expect: /transition drift for "unassigned"/,
    },
    {
      name: "drifted at_pickup alias",
      mutate: (src) =>
        src.replace('if (status === "at_pickup") return "dispatched";', 'if (status === "at_pickup") return "in_transit";'),
      expect: /mdata alias drift for "at_pickup"/,
    },
  ];
  for (const case_ of planted) {
    runChecks(case_.mutate(original));
    if (failures.length === 0 || !case_.expect.test(failures.join("\n"))) {
      console.error(`verify-load-state-machine-parity --selftest: FAIL — planted "${case_.name}" did not fail as expected`);
      process.exit(1);
    }
  }
  runChecks();
  if (failures.length > 0) {
    console.error("verify-load-state-machine-parity --selftest: FAIL — restore did not pass");
    process.exit(1);
  }
  console.log("verify-load-state-machine-parity --selftest: OK (5 planted failures, restore pass)");
  process.exit(0);
}

const { canonStatuses, canonTable, canonAlias, excluded } = runChecks();

if (failures.length > 0) {
  console.error("verify-load-state-machine-parity: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\nCanon is ${CANON}. Change it first, then mirror into ${MIRROR}.`);
  process.exit(1);
}

console.log(
  `verify-load-state-machine-parity: OK — ${canonStatuses.length} statuses, ${Object.keys(canonTable).length} transition rows, ` +
    `${Object.keys(canonAlias).length} mdata aliases identical; ${excluded.size} exception outcomes excluded from the drawer; ` +
    `getOfficeTransitionButtons is total`
);
