#!/usr/bin/env node
/**
 * GUARD: Safety creators use real entity pickers, never raw uuid text boxes (SAF-F14).
 *
 * WHY THIS EXISTS (2026-07-23 audit, verified in source)
 * The DOT Inspections creator rendered two bare text inputs with `placeholder="driver_id"` and
 * `placeholder="unit_id"`, and the HOS Violations creator one with `placeholder="driver_id"`. An
 * operator was expected to TYPE A UUID. In practice that means the field is left empty, or filled
 * with a wrong id that still passes `z.string().uuid()` and silently attaches the record to the
 * wrong driver or unit.
 *
 * Picker law (verify layer 2): every reference field has a real entity-scoped catalog behind it,
 * with inline create where the entity is create-worthy. DriverPickerWithCreate is the canonical
 * driver picker (Combobox + CreateDriverModal); DOT Inspections unit uses EntityPicker kind="unit"
 * (server search + inline CreateUnitModal via allowCreate).
 *
 * Comments are stripped before matching, so a guard can never trip on prose that merely QUOTES the
 * banned placeholder (this file and the fixed sources both mention it in explanatory comments).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-creator-pickers";
const SELFTEST = process.argv.includes("--selftest");

const FILES = [
  {
    rel: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    needs: ["DriverPickerWithCreate", "EntityPicker"],
    testids: ["dot-inspection-driver-picker", "dot-inspection-unit-picker"],
    unitEntityPicker: true,
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
    needs: ["DriverPickerWithCreate"],
    testids: ["hos-violation-driver-picker"],
  },
  {
    rel: "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
    needs: ["DriverPickerWithCreate"],
    testids: ["hos-violation-create-modal"],
  },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/** Strip block + line comments so prose quoting the banned pattern never trips the rule. */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertCreatorPickers(sources) {
  const problems = [];
  for (const { rel, needs, testids, unitInlineCreate, unitEntityPicker } of FILES) {
    const code = stripComments(sources?.[rel] ?? read(rel));

    for (const field of ["driver_id", "unit_id"]) {
      const re = new RegExp(`placeholder=["']${field}["']`);
      if (re.test(code)) {
        problems.push(
          `${rel}: renders a raw text input with placeholder="${field}" — operators cannot type a uuid. ` +
            `Use the entity picker (DriverPickerWithCreate / Combobox over listUnits).`
        );
      }
    }

    for (const comp of needs) {
      if (!code.includes(comp)) {
        problems.push(`${rel}: does not use ${comp} — the reference field has no real catalog behind it.`);
      }
    }

    if (unitEntityPicker) {
      if (!/EntityPicker[\s\S]*?kind=["']unit["']/.test(code)) {
        problems.push(`${rel}: unit field must use EntityPicker kind="unit" — not Combobox+listUnits.`);
      }
      if (/listUnits\(/.test(code)) {
        problems.push(`${rel}: must not call listUnits directly — EntityPicker owns server search.`);
      }
      const unitBlock =
        code.match(/data-testid="dot-inspection-unit-picker"[\s\S]{0,400}/)?.[0] ??
        code.match(/EntityPicker[\s\S]*?kind=["']unit["'][\s\S]{0,200}/)?.[0] ??
        "";
      if (unitBlock && /allowCreate=\{false\}/.test(unitBlock)) {
        problems.push(`${rel}: unit EntityPicker must allow inline create (allowCreate not false).`);
      }
    } else if (unitInlineCreate) {
      if (!/allowAddNew[\s\S]{0,120}\+ Create unit/.test(code)) {
        problems.push(
          `${rel}: unit picker missing inline "+ Create unit" (allowAddNew) — 7-clause picker law requires first-row create.`
        );
      }
    }

    for (const id of testids) {
      if (!code.includes(id)) {
        problems.push(`${rel}: missing data-testid="${id}" — the picker is not addressable for UI checks.`);
      }
    }
  }
  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((f) => [f.rel, read(f.rel)]));
  const failures = [];
  const target = FILES[0].rel;

  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: mutation did not change the source — inert case`);
      return;
    }
    const problems = assertCreatorPickers(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(
        `${name}: planted defect NOT caught (expected "${needle}", got: ${
          problems.length ? problems.join(" | ") : "no problems"
        })`
      );
    }
  };

  // Case 1: the raw uuid text box comes back.
  expectCaught(
    "raw-uuid-input",
    {
      ...live,
      [target]: live[target].replace(
        '<div data-testid="dot-inspection-driver-picker">',
        '<input placeholder="driver_id" /><div data-testid="dot-inspection-driver-picker">'
      ),
    },
    'placeholder="driver_id"'
  );

  // Case 2: the picker component is swapped out.
  expectCaught(
    "picker-removed",
    { ...live, [target]: live[target].replace(/DriverPickerWithCreate/g, "PlainSelect") },
    "does not use DriverPickerWithCreate"
  );

  // Case 3: the testid disappears.
  expectCaught(
    "testid-removed",
    { ...live, [target]: live[target].replace('data-testid="dot-inspection-unit-picker"', "") },
    'missing data-testid="dot-inspection-unit-picker"'
  );

  // Case 4: unit EntityPicker inline create disabled.
  expectCaught(
    "unit-inline-create-removed",
    {
      ...live,
      [target]: live[target].replace(
        /(<EntityPicker[\s\S]*?kind="unit"[\s\S]*?)\ballowCreate\b/,
        "$1allowCreate={false}"
      ),
    },
    "unit EntityPicker must allow inline create"
  );

  // Negative: a comment merely QUOTING the banned placeholder must not trip the rule.
  const commentOnly = assertCreatorPickers({
    ...live,
    [target]: live[target] + '\n// historical note: this used placeholder="driver_id" before SAF-F14\n',
  });
  if (commentOnly.length) {
    failures.push(`false-positive: a comment quoting the pattern was flagged: ${commentOnly.join(" | ")}`);
  }

  const liveProblems = assertCreatorPickers(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 planted defects caught, comment-only mention not flagged`);
  process.exit(0);
}

const problems = assertCreatorPickers();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Safety creators use real entity pickers`);
