#!/usr/bin/env node
/**
 * SAF-B29 wave-4 — Safety catalog pickers (civil / company / DOT-HOS) must server-search.
 *
 * Entity + driver pickers were fixed earlier; these catalog ReferenceSelects still fetched
 * limit:200 with no search term / no query-key slot, so a typed filter could never reach types
 * past page 1 (DOT has 213 rows).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const SURFACES = [
  {
    id: "civil-fine-types",
    file: "apps/frontend/src/pages/safety/components/FineCreateModal.tsx",
    listFn: "listCivilFineTypes",
    searchState: "civilFineTypeSearch",
    setter: "setCivilFineTypeSearch",
  },
  {
    id: "company-violation-types",
    file: "apps/frontend/src/pages/safety/components/CompanyViolationCreateModal.tsx",
    listFn: "listCompanyViolationTypes",
    searchState: "typeSearch",
    setter: "setTypeSearch",
  },
  {
    id: "hos-dot-types-tab",
    file: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
    listFn: "listDotViolationTypes",
    searchState: "violationTypeSearch",
    setter: "setViolationTypeSearch",
  },
  {
    id: "hos-dot-types-modal",
    file: "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
    listFn: "listDotViolationTypes",
    searchState: "violationTypeSearch",
    setter: "setViolationTypeSearch",
  },
];

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

export function run() {
  const failed = [];
  for (const s of SURFACES) {
    const src = strip(readFileSync(join(ROOT, s.file), "utf8"));
    const hasState = src.includes(`[${s.searchState}, ${s.setter}]`) || src.includes(`[${s.searchState},${s.setter}]`);
    const reachesServer = new RegExp(`search:\\s*${s.searchState}\\s*\\|\\|\\s*undefined`).test(src);
    const inKey = new RegExp(`queryKey:[\\s\\S]{0,200}${s.searchState}`).test(src);
    const reportsTyping = src.includes(`onSearch={${s.setter}}`);
    if (!hasState || !reachesServer || !inKey || !reportsTyping || !src.includes(s.listFn)) {
      failed.push(
        `${s.id}: state=${hasState} server=${reachesServer} key=${inKey} onSearch=${reportsTyping} list=${src.includes(s.listFn)} (${s.file})`
      );
    }
  }
  const ok = failed.length === 0;
  return {
    ok,
    message: ok
      ? `PASS: all ${SURFACES.length} of ${SURFACES.length} SAF-B29 catalog typeahead surfaces server-search.`
      : `FAIL (${failed.length}):\n  - ${failed.join("\n  - ")}`,
  };
}

function selftest() {
  const target = join(ROOT, SURFACES[0].file);
  const original = readFileSync(target, "utf8");
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: already red.\n${baseline.message}`);
    process.exit(1);
  }
  try {
    writeFileSync(target, original.replace("onSearch={setCivilFineTypeSearch}", ""), "utf8");
    const caught = run();
    if (caught.ok || !/civil-fine-types/.test(caught.message)) {
      console.error(`SELFTEST FAIL: civil-fine plant not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log("  caught: civil-fine onSearch plant");
  } finally {
    writeFileSync(target, original, "utf8");
  }
  console.log("SELFTEST PASS: planted defect caught and repository restored green.");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (!result.ok) process.exit(1);
}
