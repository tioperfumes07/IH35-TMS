#!/usr/bin/env node
/**
 * PACKET C follow-up (2026-09-03 all-seats broadcast) — "interchange trailers must not appear in
 * Our trailers / fleet / maintenance." Interchange (non-owned) trailers live in
 * dispatch.non_owned_trailers, a table scoped to trailer-interchange.{routes,service}.ts. Every
 * surface that lists "our" trailers/fleet — EntityPicker kind=trailer, the fleet roster, and the
 * maintenance work-order trailer picker (which all resolve through the SAME registry entry, see
 * apps/frontend/src/components/parity/entityPickerRegistry.ts's "trailer" kind) — must read
 * mdata.equipment (and, for the unified truck+trailer roster, mdata.units) ONLY.
 *
 * This is a PROVE guard, not a fix: an audit of every SQL-bearing route file in the trailer/unit
 * read path (apps/backend/src/mdata/equipment.routes.ts, units.routes.ts,
 * units-unified-list.service.ts) found zero references to dispatch.non_owned_trailers today. This
 * guard pins that boundary so a future change can't quietly blend interchange rows into a fleet
 * list without tripping CI.
 *
 * Self-test: node scripts/verify-trailer-lists-exclude-interchange.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-trailer-lists-exclude-interchange";

const GUARDED_FILES = [
  "apps/backend/src/mdata/equipment.routes.ts",
  "apps/backend/src/mdata/units.routes.ts",
  "apps/backend/src/mdata/units-unified-list.service.ts",
];

const FORBIDDEN = /non_owned_trailers/;

export function collectProblems(fileTexts) {
  const problems = [];
  for (const [file, text] of fileTexts) {
    if (FORBIDDEN.test(text)) {
      problems.push(`${file} references dispatch.non_owned_trailers -- interchange trailers must never feed a "our trailers"/fleet/maintenance list`);
    }
  }
  return problems;
}

function check() {
  const fileTexts = GUARDED_FILES.map((rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) throw new Error(`${LABEL}: expected file missing: ${rel}`);
    return [rel, fs.readFileSync(abs, "utf8")];
  });
  const problems = collectProblems(fileTexts);
  if (problems.length) throw new Error(`${LABEL}: ${problems.join("; ")}`);
}

function selftest() {
  const clean = [["a.ts", "SELECT * FROM mdata.equipment"], ["b.ts", "SELECT * FROM mdata.units"]];
  if (collectProblems(clean).length) throw new Error("selftest good fixture must pass");

  const planted = [["a.ts", "SELECT * FROM mdata.equipment UNION SELECT * FROM dispatch.non_owned_trailers"], ["b.ts", "SELECT * FROM mdata.units"]];
  const problems = collectProblems(planted);
  if (!problems.some((p) => p.includes("a.ts"))) {
    throw new Error(`selftest mutation escaped: planted non_owned_trailers reference did not fail (${JSON.stringify(problems)})`);
  }
  console.log(`${LABEL}: OK — selftest PASS 1/1`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK — ${GUARDED_FILES.length} file(s) audited, 0 reference dispatch.non_owned_trailers`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
