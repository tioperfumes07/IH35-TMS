#!/usr/bin/env node
/**
 * SAF-B29 wave-5 — Complaints / Internal Fines / Escrow draw-reason typeahead.
 *
 * Wave-4 covered civil/company/DOT catalogs. These three still fetched limit:200 with no
 * search term in the react-query key, so typing never reached rows past page 1.
 * Internal Fines related-load also left a native <select> of dispatch loads — replaced by
 * EntityPicker kind=load (server-search) in the same PR.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const SURFACES = [
  {
    id: "complaint-types",
    file: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
    listFn: "listComplaintTypes",
    searchState: "complaintTypeSearch",
    setter: "setComplaintTypeSearch",
  },
  {
    id: "internal-fine-reasons",
    file: "apps/frontend/src/pages/safety/InternalFinesPage.tsx",
    listFn: "listInternalFineReasons",
    searchState: "reasonSearch",
    setter: "setReasonSearch",
  },
  {
    id: "escrow-draw-reasons",
    file: "apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx",
    listFn: "driverDeductionTypesCatalogClient.list",
    searchState: "drawReasonSearch",
    setter: "setDrawReasonSearch",
  },
];

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

export function run() {
  const failed = [];
  for (const s of SURFACES) {
    const src = strip(readFileSync(join(ROOT, s.file), "utf8"));
    const hasState = src.includes(`[${s.searchState}, ${s.setter}]`) || src.includes(`[${s.searchState},${s.setter}]`);
    const reachesServer = new RegExp(`search:\\s*${s.searchState}\\s*\\|\\|\\s*undefined`).test(src);
    const inKey = new RegExp(`queryKey:[\\s\\S]{0,220}${s.searchState}`).test(src);
    const reportsTyping = src.includes(`onSearch={${s.setter}}`);
    if (!hasState || !reachesServer || !inKey || !reportsTyping) {
      failed.push({
        id: s.id,
        describe: `${s.id}: need state + search in list() + queryKey + onSearch (got state=${hasState} server=${reachesServer} key=${inKey} onSearch=${reportsTyping})`,
      });
    }
  }

  const fines = strip(readFileSync(join(ROOT, "apps/frontend/src/pages/safety/InternalFinesPage.tsx"), "utf8"));
  if (!/kind:\s*"load"|kind="load"/.test(fines) || !/EntityPicker/.test(fines)) {
    failed.push({
      id: "internal-fine-related-load",
      describe: "InternalFinesPage related load must use EntityPicker kind=load (not native select of capped loads)",
    });
  }
  if (/listDispatchLoads/.test(fines)) {
    failed.push({
      id: "internal-fine-no-dispatch-cap",
      describe: "InternalFinesPage must not use listDispatchLoads limit:200 for the related-load picker",
    });
  }

  const ok = failed.length === 0;
  return {
    ok,
    failed: failed.map((f) => f.id),
    message: ok
      ? `PASS: SAF-B29 wave-5 typeahead locked (${SURFACES.map((s) => s.id).join(", ")} + EntityPicker load).`
      : `FAIL (${failed.length}):\n  - ${failed.map((f) => f.describe).join("\n  - ")}`,
  };
}

function selftest() {
  const path = join(ROOT, SURFACES[0].file);
  const original = readFileSync(path, "utf8");
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository already red.\n${baseline.message}`);
    process.exit(1);
  }
  const find = "onSearch={setComplaintTypeSearch}";
  if (!original.includes(find)) {
    console.error("SELFTEST FAIL: complaint onSearch anchor missing");
    process.exit(1);
  }
  try {
    writeFileSync(path, original.replace(find, ""), "utf8");
    const caught = run();
    if (caught.ok || !caught.failed.includes("complaint-types")) {
      console.error(`SELFTEST FAIL: planted defect not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log("  caught: complaint-types onSearch removed");
  } finally {
    writeFileSync(path, original, "utf8");
  }
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (!result.ok) process.exit(1);
}
