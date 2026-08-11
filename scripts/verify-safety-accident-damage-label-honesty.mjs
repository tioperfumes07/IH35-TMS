#!/usr/bin/env node
/**
 * GUARD 2186 — Accidents list + damage evidence must not use UUID-slice / bare-id labels.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { labelResolves, labelFallsBackToId } from "./lib/entity-label-detect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-accident-damage-label-honesty";
const TARGETS = [
  "apps/frontend/src/pages/safety/AccidentsPage.tsx",
  "apps/frontend/src/pages/safety/damage-reports/DamageReportDetail.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const accidents = sources?.[TARGETS[0]] ?? read(TARGETS[0]);
  // ★ DETECTOR WIDENED 2026-08-11 (CLS-GUARD-LITERAL-DETECTION). This demanded the literal
  // `|| "Driver"` / `|| "Unit"`, i.e. the INLINE fallback spelling. AccidentsPage now supplies the same
  // nouns through the shared helper — entityLabel(name, id, "Driver") — so the words are present but
  // not after a `||`, and the guard reddened on a page that had become safer. Live prod renders
  // "Juan USMCA-Battery" / "TEST-UNIT-20260806-01" on /safety/accidents. The requirement is unchanged:
  // a word fallback, never a uuid or undefined — only the accepted spelling widened.
  if (
    labelFallsBackToId(accidents, { field: "driver_name", idField: "driver_id" }) ||
    labelFallsBackToId(accidents, { field: "unit_number", idField: "unit_id" })
  ) {
    problems.push(`${TARGETS[0]}: EntityLink must fallback to stable words, not undefined (UUID text)`);
  }
  if (
    !labelResolves(accidents, { field: "driver_name", noun: "Driver" }) ||
    !labelResolves(accidents, { field: "unit_number", noun: "Unit" })
  ) {
    problems.push(`${TARGETS[0]}: Driver/Unit EntityLinks need word fallbacks`);
  }
  const damage = sources?.[TARGETS[1]] ?? read(TARGETS[1]);
  if (/photo\.id\.slice\(0,\s*8\)/.test(damage)) {
    problems.push(`${TARGETS[1]}: Evidence label must not slice photo UUID`);
  }
  if (!/Evidence \{index \+ 1\}/.test(damage) && !/Evidence \{index\+1\}/.test(damage)) {
    problems.push(`${TARGETS[1]}: Evidence label must use ordinal index`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries(TARGETS.map((t) => [t, read(t)]));
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const planted = assert({
    ...live,
    [TARGETS[1]]: live[TARGETS[1]] + "\nEvidence {photo.id.slice(0, 8)}\n",
  });
  if (!planted.some((p) => p.includes("photo UUID"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted UUID slice not caught`, planted);
    process.exit(1);
  }

  // ★ The label assertion had NO mutation at all — the selftest only ever exercised the damage-photo
  // branch, so the Driver/Unit word-fallback check was certified by a test that never touched it.
  // A guard whose selftest cannot fail on the assertion it names proves nothing about that assertion.
  const mutate = (src, field, replacement) => {
    const re = new RegExp(String.raw`label=\{[^}]*row\.${field}[^}]*\}`);
    if (!re.test(src)) return null; // signals INERT to the caller
    return src.replace(re, replacement);
  };
  const labelCases = [
    ["driver label -> bare uuid", "driver_name", "label={row.driver_id}", "word fallbacks"],
    ["unit label -> bare uuid", "unit_number", "label={row.unit_id}", "word fallbacks"],
    ["driver label -> undefined", "driver_name", "label={(row.driver_name as string | undefined) ?? undefined}", "stable words"],
  ];
  for (const [name, field, replacement, needle] of labelCases) {
    const mutated = mutate(live[TARGETS[0]], field, replacement);
    if (mutated === null || mutated === live[TARGETS[0]]) {
      console.error(`${LABEL} SELFTEST FAIL: "${name}" is an INERT mutation — the guard proves nothing.`);
      process.exit(1);
    }
    if (!assert({ ...live, [TARGETS[0]]: mutated }).some((p) => p.includes(needle))) {
      console.error(`${LABEL} SELFTEST FAIL: "${name}" was not caught.`);
      process.exit(1);
    }
  }
  // The LEGACY inline spelling must still be accepted — widening must not orphan the old form.
  const legacy = mutate(
    live[TARGETS[0]],
    "driver_name",
    'label={(row.driver_name as string | undefined)?.trim() || "Driver"}',
  );
  if (legacy === null || assert({ ...live, [TARGETS[0]]: legacy }).some((p) => p.includes("word fallbacks"))) {
    console.error(`${LABEL} SELFTEST FAIL: the legacy inline spelling must still be accepted.`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — damage-photo slice + 3 label mutations + legacy spelling`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accidents EntityLink word fallbacks + damage evidence ordinals`);
