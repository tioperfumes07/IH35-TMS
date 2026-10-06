#!/usr/bin/env node
// ROUND 391.2 (owner order 432-CC2 item 4) — REEFER. Owner: fuel_type 'reefer' must come from the Relay product code,
// trailer_id must be on reefer rows, and reefer gallons must stay out of IFTA taxable gallons.
//
// The defect this locks shut: the Relay feed classified every product line, but each reader hand-typed its own test
// (`l.fuel_type = 'reefer'`, a { diesel, def, reefer } map, `volume_uom = 'gallons'`), the settlement-row link engine paired
// only rows whose product already agreed (so a statement line with no product stayed 'diesel' — taxable IFTA gallons —
// even when its fill proved reefer; a one-off migration fixed 4 rows once), and nothing set a reefer row's trailer.
//
// Asserts (static, <1s):
//   1. ONE CLASSIFIER. No backend source outside apps/backend/src/fuel/relay-product-kind.ts hand-types a Relay line's
//      product (`<alias>.fuel_type = 'reefer'|'def'` / `fuel_type = 'diesel'` on a relay line alias) or its unit
//      (`volume_uom = 'gallons'`); every Relay reader listed in READERS calls relayLineKindSql / relayLineIsGallonsSql.
//   2. THE FEED DECIDES. relay-fill-link.service.ts relabels a 'diesel' row the fill proves reefer (the relabel branch and
//      the 'reefer_diesel' write) and stamps the trailer through resolveReeferTrailerForFuelRow.
//   3. TRAILER FROM RECORDS. reefer-fuel.service.ts resolves the trailer from the load's assignment history at fill time
//      and the pump's trailer prompt, Reefer-only, company-owned/leased; no backend source reads the trailer-TYPE catalog id
//      (load_trailer_equipment_id) AS trailer_id.
//   4. IFTA. The state-gallons aggregator's fuel_type filter is an allowlist of road fuel that holds neither reefer_diesel
//      nor def; the telematics IFTA miles service excludes reefer_diesel.
//
// Usage: node scripts/verify-relay-reefer-fuel-engine.mjs [--selftest]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-reefer-fuel-engine";
const BACKEND = "apps/backend/src";
const CLASSIFIER = "apps/backend/src/fuel/relay-product-kind.ts";
const LINK = "apps/backend/src/fuel/relay-fill-link.service.ts";
const REEFER = "apps/backend/src/fuel/reefer-fuel.service.ts";
const IFTA_AGG = "apps/backend/src/ifta/ifta-state-gallons-aggregator.ts";
const IFTA_MILES = "apps/backend/src/telematics/ifta-miles.service.ts";

/** Relay-line readers that must classify through the one file. */
export const READERS = [
  ["apps/backend/src/fuel/relay-fill-link.service.ts", ["relayLineKindSql", "relayLineIsGallonsSql"]],
  ["apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts", ["relayLineKindSql", "relayLineIsGallonsSql"]],
  ["apps/backend/src/fuel/relay-fills.routes.ts", ["relayLineKindSql", "relayLineIsGallonsSql"]],
  ["apps/backend/src/fuel/reefer-fuel.service.ts", ["relayLineKindSql", "relayLineIsGallonsSql"]],
  ["apps/backend/src/fuel/fuel-gps-verdict.service.ts", ["relayLineIsGallonsSql"]],
  ["apps/backend/src/maintenance/fuel-integrity.service.ts", ["relayLineIsGallonsSql"]],
];

const stripComments = (src) =>
  String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");

// A Relay line's product/unit typed by hand. 'reefer' and 'def' compared to fuel_type can only be a Relay line
// (fuel.fuel_transactions uses 'reefer_diesel'); 'diesel' is flagged only on a relay-lines alias (l.).
const HAND_TYPED = [
  /\b\w+\.fuel_type\s*=\s*'(reefer|def)'/,
  /\bl\.fuel_type\s*=\s*'diesel'/,
  /volume_uom\s*=\s*'gallons?'/,
];

export function analyze(files) {
  const problems = [];
  for (const [rel, raw] of Object.entries(files.backend)) {
    if (rel === CLASSIFIER) continue;
    const src = stripComments(raw);
    for (const re of HAND_TYPED) {
      const m = src.match(re);
      if (m) problems.push(`${rel}: hand-typed Relay product/unit "${m[0]}" — read it through relay-product-kind.ts`);
    }
    const t = src.match(/load_trailer_equipment_id[^,\n]*\bAS\s+trailer_id\b/);
    if (t) problems.push(`${rel}: "${t[0]}" — a trailer-TYPE catalog id used as a physical trailer_id`);
  }
  for (const [rel, needles] of READERS) {
    const src = stripComments(files.backend[rel] ?? "");
    if (!src) { problems.push(`${rel}: missing`); continue; }
    for (const n of needles) if (!src.includes(`${n}(`)) problems.push(`${rel}: does not call ${n}()`);
  }

  const link = stripComments(files.backend[LINK] ?? "");
  if (!/WHEN f\.fuel_type = 'diesel'[\s\S]{0,200}'reefer'/.test(link)) problems.push(`${LINK}: the diesel->reefer relabel branch is gone (the fill must decide the product)`);
  if (!/THEN 'reefer_diesel'/.test(link)) problems.push(`${LINK}: the link no longer writes 'reefer_diesel' for a row the fill proves reefer`);
  if (!/resolveReeferTrailerForFuelRow\(/.test(link)) problems.push(`${LINK}: a reefer link no longer stamps its trailer`);

  const reefer = stripComments(files.backend[REEFER] ?? "");
  if (!/export async function resolveReeferTrailerForFuelRow/.test(reefer)) problems.push(`${REEFER}: resolveReeferTrailerForFuelRow missing`);
  else {
    for (const [needle, why] of [
      ["dispatch.load_assignment_history", "the load's trailer from assignment history"],
      ["loadAtTimeSql(", "the load the truck was hauling at the fill (the one load-at-time rule)"],
      ["relayPromptReeferTrailerSql(", "the trailer number keyed at the pump"],
      ["equipment_type ~* 'reefer'", "Reefer trailers only"],
    ]) if (!reefer.includes(needle)) problems.push(`${REEFER}: trailer resolver lost ${why}`);
  }

  const agg = stripComments(files.ifta);
  const inList = agg.match(/fuel_type[^)]*\)\)\s*IN\s*\(([^)]*)\)/i) ?? agg.match(/fuel_type[^\n]*\bIN\s*\(([^)]*)\)/i);
  if (!inList) problems.push(`${IFTA_AGG}: no fuel_type allowlist on the IFTA taxable-gallons read`);
  else if (/reefer|'def'/i.test(inList[1])) problems.push(`${IFTA_AGG}: IFTA allowlist ${inList[1].trim()} counts reefer / DEF as taxable road fuel`);
  if (!/fuel_type\s*===\s*"reefer_diesel"/.test(stripComments(files.iftaMiles))) problems.push(`${IFTA_MILES}: no longer excludes reefer_diesel from IFTA fuel`);

  return problems;
}

function walk(dir, out = {}) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") walk(rel, out); }
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out[rel] = fs.readFileSync(path.join(ROOT, rel), "utf8");
  }
  return out;
}

function readAll() {
  return {
    backend: walk(BACKEND),
    ifta: fs.readFileSync(path.join(ROOT, IFTA_AGG), "utf8"),
    iftaMiles: fs.readFileSync(path.join(ROOT, IFTA_MILES), "utf8"),
  };
}

function selftest() {
  const base = readAll();
  const clean = analyze(base);
  if (clean.length) { console.error(`${LABEL} --selftest: tree fails:\n  ${clean.join("\n  ")}`); process.exit(1); }
  const withFile = (rel, fn) => ({ ...base, backend: { ...base.backend, [rel]: fn(base.backend[rel]) } });
  const cases = [
    ["a reader hand-types reefer", withFile("apps/backend/src/fuel/relay-fills.routes.ts", (s) => `${s}\nconst x = \`AND l.fuel_type = 'reefer'\`;`)],
    ["a reader filters the old unit", withFile("apps/backend/src/fuel/fuel-gps-verdict.service.ts", (s) => s.replace('${relayLineIsGallonsSql("l")}', "l.volume_uom = 'gallons'"))],
    ["the relabel branch removed", withFile(LINK, (s) => s.replace(/WHEN f\.fuel_type = 'diesel'/, "WHEN false"))],
    ["the trailer stamp removed", withFile(LINK, (s) => s.replace("await resolveReeferTrailerForFuelRow(", "await Promise.resolve(null) && (0 as never)("))],
    ["the resolver allows any trailer type", withFile(REEFER, (s) => s.split("equipment_type ~* 'reefer'").join("true"))],
    ["a catalog id as trailer", withFile("apps/backend/src/driver-finance/batch-settlements.service.ts", (s) => `${s}\nconst y = \`l.load_trailer_equipment_id::text AS trailer_id\`;`)],
    ["IFTA counts reefer", { ...base, ifta: base.ifta.replace("IN ('diesel', 'gas')", "IN ('diesel', 'gas', 'reefer_diesel')") }],
    ["IFTA miles stops excluding reefer", { ...base, iftaMiles: base.iftaMiles.replace('f.fuel_type === "reefer_diesel"', "false") }],
  ];
  let n = 0;
  for (const [name, files] of cases) {
    if (JSON.stringify(files) === JSON.stringify(base)) { console.error(`${LABEL} --selftest: mutation "${name}" changed nothing — fixture drifted`); process.exit(1); }
    if (!analyze(files).length) { console.error(`${LABEL} --selftest: mutation escaped: ${name}`); process.exit(1); }
    n++;
  }
  console.log(`${LABEL} --selftest PASS ${n + 1}/${cases.length + 1}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const problems = analyze(readAll());
    if (problems.length) { console.error(`${LABEL}: FAIL (${problems.length})\n  ${problems.join("\n  ")}`); process.exit(1); }
    console.log(`${LABEL}: PASS — one Relay product classifier (${READERS.length} readers), the fill decides reefer and stamps its trailer, IFTA taxable gallons exclude reefer and DEF`);
  }
}
