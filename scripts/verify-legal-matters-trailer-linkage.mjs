#!/usr/bin/env node
/**
 * GUARD — verify-legal-matters-trailer-linkage (CLS-REVERSE-LINKAGE-MISSING)
 *
 * DEFECT THIS ASSERTS
 * The audit card asked for LegalMattersReverseSection on the trailer profile. The tempting fix was
 * to render it with `filter={{ unit_id: id }}` the way the VEHICLE profile does. That would have
 * been wrong in a way that hides itself: trailers are rows in mdata.equipment and units are rows in
 * mdata.units, so a trailer id used as unit_id matches nothing. The panel would render, look wired,
 * and report "no legal matters" forever - which a reviewer reads as a clean trailer rather than a
 * broken link. An empty surface is more dangerous than a missing one.
 *
 * So this guard does not merely check that the component is imported. It asserts the WHOLE chain,
 * because any single missing link reproduces that same silent emptiness:
 *   migration column -> service filter -> route query schema -> API client param -> page embed.
 * A guard that only checked the import would have passed on the broken version.
 *
 * METHOD: comments are stripped before asserting (four earlier guards of mine passed by matching
 * their own prose), and --selftest mutates each real file to prove every link is load-bearing.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-legal-matters-trailer-linkage";

const MIGRATION = "db/migrations/202612030000_legal_matters_equipment_linkage.sql";
const SERVICE = "apps/backend/src/legal/matters.service.ts";
const ROUTES = "apps/backend/src/legal/matters.routes.ts";
const API = "apps/frontend/src/api/legal-matters.ts";
const SECTION = "apps/frontend/src/components/legal/LegalMattersReverseSection.tsx";
const PAGE = "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx";

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}

const read = (p) => stripComments(readFileSync(p, "utf8"));

/** Each link in the chain, with the reason it is load-bearing. */
function links(sources) {
  return [
    {
      file: MIGRATION,
      ok: /ADD COLUMN equipment_id uuid/.test(sources[MIGRATION]),
      why: "migration never adds legal.matters.equipment_id — nothing to filter on",
    },
    {
      file: MIGRATION,
      ok: /REFERENCES mdata\.equipment\(id\)/.test(sources[MIGRATION]),
      why: "equipment_id has no FK to mdata.equipment — the link is unenforced",
    },
    {
      file: SERVICE,
      ok: /m\.equipment_id = \$\$\{values\.length\}|m\.equipment_id = \$\$/.test(sources[SERVICE]) ||
        /where\.push\(`m\.equipment_id/.test(sources[SERVICE]),
      why: "list query has no equipment_id WHERE clause — the filter is silently ignored",
    },
    {
      file: ROUTES,
      ok: /equipment_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(sources[ROUTES]),
      why: "route query schema omits equipment_id — zod strips it before the service sees it",
    },
    {
      file: ROUTES,
      ok: /equipment_id:\s*parsed\.data\.equipment_id/.test(sources[ROUTES]),
      why: "route parses equipment_id but never forwards it to the service",
    },
    {
      file: API,
      ok: /params\.equipment_id\s*=\s*filters\.equipment_id/.test(sources[API]),
      why: "API client drops equipment_id from the querystring — the request never carries it",
    },
    {
      file: SECTION,
      ok: /equipment_id:\s*string/.test(sources[SECTION]),
      why: "Filter union has no equipment_id variant — callers cannot express a trailer filter",
    },
    {
      file: PAGE,
      ok: /LegalMattersReverseSection/.test(sources[PAGE]),
      why: "trailer profile does not render LegalMattersReverseSection at all",
    },
    {
      file: PAGE,
      ok: /filter=\{\{\s*equipment_id:/.test(sources[PAGE]),
      why: "trailer profile filters by something other than equipment_id — wrong key space, panel is empty forever",
    },
  ];
}

function check(sources) {
  return links(sources).filter((l) => !l.ok).map((l) => `${l.file}: ${l.why}`);
}

function loadAll() {
  const out = {};
  for (const p of [MIGRATION, SERVICE, ROUTES, API, SECTION, PAGE]) out[p] = read(p);
  return out;
}

function selftest() {
  const real = loadAll();
  if (check(real).length !== 0) {
    console.error(`${LABEL} --selftest FAIL — real sources do not pass; cannot validate mutations.`);
    for (const e of check(real)) console.error(`  - ${e}`);
    process.exit(1);
  }

  // Every link must be individually load-bearing: break exactly one, expect exactly a failure.
  const mutations = [
    [MIGRATION, (s) => s.replace("ADD COLUMN equipment_id uuid", "ADD COLUMN unrelated_col uuid")],
    [MIGRATION, (s) => s.replace("REFERENCES mdata.equipment(id)", "REFERENCES mdata.units(id)")],
    [SERVICE, (s) => s.split("m.equipment_id").join("m.unit_id")],
    [ROUTES, (s) => s.replace(/equipment_id: z\.string\(\)\.uuid\(\)\.optional\(\),/, "")],
    [ROUTES, (s) => s.replace("equipment_id: parsed.data.equipment_id,", "")],
    [API, (s) => s.replace(/params\.equipment_id = filters\.equipment_id;/, "")],
    [SECTION, (s) => s.split("equipment_id: string").join("someother_id: string")],
    [PAGE, (s) => s.split("LegalMattersReverseSection").join("SomeOtherSection")],
    [PAGE, (s) => s.replace(/filter=\{\{ equipment_id:/, "filter={{ unit_id:")],
  ];

  for (const [file, mutate] of mutations) {
    const broken = { ...real, [file]: mutate(real[file]) };
    if (broken[file] === real[file]) {
      console.error(`${LABEL} --selftest FAIL — a mutation on ${file} changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — breaking ${file} was NOT detected; that link is not guarded.`);
      process.exit(1);
    }
  }

  console.log(`${LABEL} --selftest PASS — all ${mutations.length} chain links proven load-bearing.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length > 0) {
  console.error(`${LABEL} FAIL — trailer→legal-matters linkage is broken at ${errors.length} point(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — trailer→legal.matters reverse linkage is wired end to end ` +
    `(migration → service → route → api client → section → page), on equipment_id not unit_id.`
);
