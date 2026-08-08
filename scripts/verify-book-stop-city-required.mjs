#!/usr/bin/env node
/**
 * P0 BLANK-STOP-CITIES — the Book wizard must not be able to ship a stop with no city.
 *
 * City was `.optional()` in the CREATE body schema and carried no validation rule in the wizard, so the
 * live Book path wrote loads whose pickup AND delivery stops had empty cities. Proved on production:
 * 2/2 stops of L-20260808-0093 and 2/2 of L-20260808-0062, both born dispatched/assigned with cityless
 * pickup+delivery (`pickup_city: ""`, `delivery_city: ""` straight off the dispatch list endpoint).
 * A cityless stop breaks PC*MILER routing, ETA and IFTA jurisdiction miles, and nothing downstream can
 * reconstruct it.
 *
 * NOTE the asymmetry this guard deliberately preserves: CREATE requires city, UPDATE does not, because the
 * Edit wizard sends dirty-field-gated PARTIAL patches — requiring it there would reject every edit that did
 * not happen to touch a stop.
 *
 *   node scripts/verify-book-stop-city-required.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-book-stop-city-required";
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
const STOPS_UI = "apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.tsx";

function assert(files) {
  const routes = files[ROUTES] ?? "";
  const ui = files[STOPS_UI] ?? "";
  const problems = [];

  const i = routes.indexOf("const createDispatchLoadBodySchema");
  const j = routes.indexOf("const updateDispatchLoadBodySchema");
  if (i < 0 || j < 0 || j < i) {
    problems.push(`${ROUTES}: could not locate the create/update body schemas`);
    return problems;
  }
  const createBlock = routes.slice(i, j);
  const updateBlock = routes.slice(j);

  if (!/city: z\.string\(\)\.trim\(\)\.min\(1[^)]*\)\.max\(120\)/.test(createBlock)) {
    problems.push(`${ROUTES}: CREATE stop city must be required (min(1)) — optional here is how cityless loads shipped`);
  }
  // The update path must stay optional; making it required would reject partial edits.
  if (!/city: z\.string\(\)\.trim\(\)\.max\(120\)\.optional\(\)/.test(updateBlock)) {
    problems.push(`${ROUTES}: UPDATE stop city must stay optional — Edit sends dirty-gated partial patches`);
  }
  if (!/stops\.\$\{index\}\.city`, \{ required:/.test(ui)) {
    problems.push(`${STOPS_UI}: the City input must carry a required rule so submit is blocked before the request`);
  }
  return problems;
}

const files = Object.fromEntries([ROUTES, STOPS_UI].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [
    ["create city reverted to optional", { ...files, [ROUTES]: files[ROUTES].replace(/city: z\.string\(\)\.trim\(\)\.min\(1, "city is required"\)\.max\(120\)/, "city: z.string().trim().max(120).optional()") }],
    ["wizard required rule removed", { ...files, [STOPS_UI]: files[STOPS_UI].replace(/, \{ required: "City is required" \}/, "") }],
  ];
  for (const [name, planted] of checks) {
    if (!assert(planted).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted "${name}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted breaks caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — Book create requires a stop city; Edit stays partial-patch safe`);
process.exit(0);
