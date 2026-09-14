#!/usr/bin/env node
// P0 (owner 2026-09-14, "BOOK LOAD 500s"): mdata.loads.mileage_source is a controlled vocabulary of
// exactly 4 literals, enforced by the DB's own loads_mileage_source_english_check constraint
// (db/migrations/202613342200_go16_rev_b_lane_mileage.sql):
//   mileage_source IS NULL OR mileage_source IN ('History','Manual','Routing engine','Operator entered')
//
// BookLoadModalV4.tsx's own lane-fill effect used to write "History — ZIP mismatch, verify" /
// "History — verify" (an em-dash confidence qualifier) for check_zip/verify/reverse fills, and the
// backend's own create-body Zod schema happily accepted those same 2 illegal literals and passed
// them straight to the INSERT -- a 500 on save for any load whose miles autofilled from a
// ZIP-mismatched or thin lane-history row, on the owner's own primary workflow. A third writer,
// lane-mileage.service.ts's mileageSourceFromFill(), independently produced the same 2 illegal
// strings (unused at runtime today, but exported and shaped exactly like a future call site).
//
// THE FLOOR: every known write site for mileage_source in this codebase is scanned for a
// disallowed literal, matched by SYNTACTIC POSITION (a Zod enum array, a `return` inside
// mileageSourceFromFill, a `setValue("mileage_source", "...")` call, a TS union type) rather than a
// blanket "does this file mention the phrase" substring scan -- so this guard's own source comments
// (which necessarily quote the banned strings as prose) can never trip it.
//
// The confidence qualifier ("ZIP mismatch, verify" / "verify") is NOT lost: MilesStrip's on-screen
// warning is driven entirely by the separate fillConfidence/provenance props (lane-mileage.service
// .ts's provenanceFromRow), never by mileage_source -- fixing this column never touches that display.
//
//   node scripts/verify-mileage-source-vocabulary.mjs
//   node scripts/verify-mileage-source-vocabulary.mjs --selftest   (pure logic check, no filesystem)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-mileage-source-vocabulary";

// The DB CHECK constraint's own literal set (plus NULL, which is not a string literal in source).
export const ALLOWED = ["History", "Manual", "Routing engine", "Operator entered"];

function extractQuoted(str) {
  const out = [];
  const re = /["']([^"'\n]*)["']/g;
  let m;
  while ((m = re.exec(str))) out.push(m[1]);
  return out;
}

/** Zod enum array following `mileage_source: z\n  .enum([ ... ])` (order-insensitive, ignores "optional"/whitespace). */
export function checkZodEnum(src) {
  const m = /mileage_source\s*:\s*z\s*\n?\s*\.enum\(\[([^\]]*)\]\)/.exec(src) || /mileage_source:\s*z\.enum\(\[([^\]]*)\]\)/.exec(src);
  if (!m) return { ok: false, reason: "could not find a mileage_source z.enum([...]) declaration -- refusing to pass vacuously" };
  const literals = extractQuoted(m[1]);
  const bad = literals.filter((l) => !ALLOWED.includes(l));
  if (bad.length) return { ok: false, reason: `z.enum([...]) for mileage_source allows illegal literal(s): ${bad.join(", ")}` };
  return { ok: true };
}

/** TS union type `mileage_source?: "A" | "B" | ...;` on one logical declaration. */
export function checkUnionType(src) {
  const m = /mileage_source\?\s*:\s*((?:"[^"]*"\s*\|?\s*)+);/.exec(src);
  if (!m) return { ok: false, reason: "could not find a `mileage_source?: \"...\" | ...;` union type declaration -- refusing to pass vacuously" };
  const literals = extractQuoted(m[1]);
  const bad = literals.filter((l) => !ALLOWED.includes(l));
  if (bad.length) return { ok: false, reason: `mileage_source?: union type allows illegal literal(s): ${bad.join(", ")}` };
  return { ok: true };
}

/** Every `return "...";` inside mileageSourceFromFill's own function body. */
export function checkMileageSourceFromFillReturns(src) {
  const start = src.indexOf("function mileageSourceFromFill");
  if (start === -1) return { ok: false, reason: "mileageSourceFromFill function not found -- refusing to pass vacuously" };
  const braceStart = src.indexOf("{", start);
  if (braceStart === -1) return { ok: false, reason: "mileageSourceFromFill has no function body" };
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return { ok: false, reason: "mileageSourceFromFill function body never closes" };
  const body = src.slice(braceStart, end);
  const returns = [...body.matchAll(/return\s+["']([^"']*)["']/g)].map((m) => m[1]);
  if (!returns.length) return { ok: false, reason: "mileageSourceFromFill returns no string literal -- refusing to pass vacuously" };
  const bad = returns.filter((l) => !ALLOWED.includes(l));
  if (bad.length) return { ok: false, reason: `mileageSourceFromFill returns illegal literal(s): ${bad.join(", ")}` };
  return { ok: true };
}

/** Every `setValue("mileage_source", "...")` call. */
export function checkSetValueCalls(src) {
  const calls = [...src.matchAll(/setValue\(\s*["']mileage_source["']\s*,\s*["']([^"']*)["']/g)].map((m) => m[1]);
  if (!calls.length) return { ok: false, reason: "no setValue(\"mileage_source\", ...) calls found -- refusing to pass vacuously" };
  const bad = calls.filter((l) => !ALLOWED.includes(l));
  if (bad.length) return { ok: false, reason: `setValue("mileage_source", ...) writes illegal literal(s): ${bad.join(", ")}` };
  return { ok: true };
}

const CHECKS = [
  { file: "apps/backend/src/dispatch/loads.routes.ts", fn: checkZodEnum, label: "create-body Zod schema" },
  { file: "apps/backend/src/dispatch/lane-mileage.service.ts", fn: checkMileageSourceFromFillReturns, label: "mileageSourceFromFill()" },
  { file: "apps/backend/src/dispatch/book-load.service.ts", fn: checkUnionType, label: "BookLoadInput type" },
  { file: "apps/frontend/src/api/dispatch.ts", fn: checkUnionType, label: "frontend API type" },
  { file: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx", fn: checkSetValueCalls, label: "BookLoadModalV4 setValue calls" },
];

function main() {
  const errors = [];
  for (const { file, fn, label } of CHECKS) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) {
      errors.push(`${file}: file not found -- refusing to pass vacuously`);
      continue;
    }
    const src = fs.readFileSync(full, "utf8");
    const result = fn(src);
    if (!result.ok) errors.push(`${file} (${label}): ${result.reason}`);
  }
  if (errors.length) {
    console.error(`${LABEL} FAILED:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — all ${CHECKS.length} known mileage_source write sites use only the DB constraint's 4 allowed literals`);
  process.exit(0);
}

function selftest() {
  // checkZodEnum
  const zodGood = 'mileage_source: z\n    .enum(["History", "Manual", "Routing engine", "Operator entered"])\n    .optional(),';
  if (!checkZodEnum(zodGood).ok) throw new Error("selftest: checkZodEnum should pass a clean enum");
  const zodBad = 'mileage_source: z\n    .enum(["History", "History — verify", "Manual", "Routing engine", "Operator entered"])\n    .optional(),';
  if (checkZodEnum(zodBad).ok) throw new Error("selftest: checkZodEnum should catch an illegal literal");
  const zodMissing = "// no declaration here";
  if (checkZodEnum(zodMissing).ok) throw new Error("selftest: checkZodEnum should fail closed when the declaration is missing");

  // checkUnionType
  const unionGood = 'mileage_source?: "History" | "Manual" | "Routing engine" | "Operator entered";';
  if (!checkUnionType(unionGood).ok) throw new Error("selftest: checkUnionType should pass a clean union");
  const unionBad = 'mileage_source?: "History" | "History — ZIP mismatch, verify" | "Manual";';
  if (checkUnionType(unionBad).ok) throw new Error("selftest: checkUnionType should catch an illegal literal");
  if (checkUnionType("// nothing").ok) throw new Error("selftest: checkUnionType should fail closed when missing");

  // checkMileageSourceFromFillReturns
  const fnGood = 'export function mileageSourceFromFill(_fillConfidence) {\n  return "History";\n}';
  if (!checkMileageSourceFromFillReturns(fnGood).ok) throw new Error("selftest: fn-returns should pass a clean function");
  const fnBad =
    'export function mileageSourceFromFill(fillConfidence) {\n  switch (fillConfidence) {\n    case "check_zip":\n      return "History — ZIP mismatch, verify";\n    default:\n      return "History";\n  }\n}';
  if (checkMileageSourceFromFillReturns(fnBad).ok) throw new Error("selftest: fn-returns should catch an illegal literal");
  if (checkMileageSourceFromFillReturns("// nothing here").ok) throw new Error("selftest: fn-returns should fail closed when missing");

  // checkSetValueCalls
  const callsGood = 'form.setValue("mileage_source", "History", { shouldDirty: true });\nform.setValue("mileage_source", "Operator entered", {});';
  if (!checkSetValueCalls(callsGood).ok) throw new Error("selftest: setValue-calls should pass clean calls");
  const callsBad = 'form.setValue("mileage_source", "History — verify", { shouldDirty: true });';
  if (checkSetValueCalls(callsBad).ok) throw new Error("selftest: setValue-calls should catch an illegal literal");
  if (checkSetValueCalls("// nothing here").ok) throw new Error("selftest: setValue-calls should fail closed when missing");

  console.log(`${LABEL}: SELFTEST PASS — zod-enum/union-type/function-returns/setValue-calls all catch illegal literals and fail closed when the pattern is absent`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();
else main();
