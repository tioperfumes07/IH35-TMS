#!/usr/bin/env node
/**
 * @matrix-built {"modules":["drivers","fleet","safety","dispatch","maintenance"],"cols":["unit","load","driver","work_order","connectivity","reverse_link"],"leafRe":"^(profiles\\.detail|trailer\\.profile\\.assignment|accidents\\.list|safety_events\\.list|load\\.drawer\\.overview|maintenance\\.modal\\.work_order_detail)$","task":"LINK-F5132-EMBEDDED-ASSIGNMENT-REVERSE-LINKS","vertical":"class-sweep"}
 *
 * Embedded assignment and reverse-record panels receive canonical related IDs. Their human
 * labels must drill through the shared EntityLink resolver rather than remain inert or carry
 * locally assembled routes.
 */
import fs from "node:fs";

const LABEL = "verify-embedded-assignment-reverse-links";
const FILES = {
  driver:
    "apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx",
  trailer:
    "apps/frontend/src/components/trailer-profile/CurrentAssignmentSection.tsx",
  safety: "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
  workOrders:
    "apps/frontend/src/components/dispatch/LoadWorkOrdersReverseSection.tsx",
  resolver: "apps/frontend/src/components/shared/EntityLink.tsx",
};

const read = (file) => fs.readFileSync(file, "utf8");

function check(sources) {
  const failures = [];
  const expects = [
    ["driver", /<EntityLinkOrTombstone[\s\S]{0,80}kind="unit"[\s\S]{0,120}id=\{def\.unit_id == null \? null : String\(def\.unit_id\)\}[\s\S]{0,80}name=\{def\.unit_number\}[\s\S]{0,40}noun="Unit"/, "default unit"],
    ["driver", /<EntityLinkOrTombstone[\s\S]{0,80}kind="unit"[\s\S]{0,120}id=\{cur\.unit_id == null \? null : String\(cur\.unit_id\)\}[\s\S]{0,80}name=\{cur\.unit_number\}[\s\S]{0,40}noun="Unit"/, "current unit"],
    ["driver", /<EntityLinkOrTombstone[\s\S]{0,80}kind="load"[\s\S]{0,120}id=\{load\.load_id == null \? null : String\(load\.load_id\)\}[\s\S]{0,80}name=\{load\.load_number\}[\s\S]{0,40}noun="Load"/, "current load"],
    ["trailer", /kind="unit"[\s\S]{0,120}id=\{String\(unit\.unit_id\)\}/, "attached unit"],
    [
      "trailer",
      /kind="load"[\s\S]{0,120}id=\{String\(load\.load_id\)\}/,
      "current load",
    ],
    ["safety", /kind="driver"[\s\S]{0,120}id=\{s\(row\.driver_id\)\}/, "accident driver"],
    ["safety", /kind="unit"[\s\S]{0,120}id=\{s\(row\.unit_id\)\}/, "accident unit"],
    [
      "safety",
      /kind="driver"[\s\S]{0,120}id=\{s\(row\.subject_driver_id\)\}/,
      "event driver",
    ],
    ["safety", /kind="unit"[\s\S]{0,120}id=\{s\(row\.subject_unit_id\)\}/, "event unit"],
    [
      "workOrders",
      /<EntityLinkOrTombstone\s+kind="unit"\s+id=\{row\.unit_id\}\s+name=\{row\.unit_number \?\? null\}\s+noun="Unit"\s*\/>/,
      "work-order unit",
    ],
    ["resolver", /case "unit":[\s\S]{0,100}\/fleet\/units\//, "unit resolver"],
    [
      "resolver",
      /case "load":[\s\S]{0,100}\/dispatch\/loads\//,
      "load resolver",
    ],
    ["resolver", /case "driver":[\s\S]{0,100}\/drivers\//, "driver resolver"],
  ];
  for (const [key, pattern, label] of expects) {
    if (!pattern.test(sources[key]))
      failures.push(`${FILES[key]}: missing canonical ${label} EntityLink`);
  }
  if (
    /from "react-router-dom"/.test(sources.driver) ||
    /from "react-router-dom"/.test(sources.trailer)
  ) {
    failures.push(
      "assignment sections must not bypass EntityLink with locally assembled Link routes",
    );
  }
  return failures;
}

const sources = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [key, read(file)]),
);

if (process.argv.includes("--self-test") || process.argv.includes("--selftest")) {
  const mutations = [
    ["driver", 'name={def.unit_number}', 'name={def.unit_id}'],
    ["driver", 'name={cur.unit_number}', 'name={cur.unit_id}'],
    ["driver", 'name={load.load_number}', 'name={load.load_id}'],
    ["trailer", 'kind="load"', 'kind="customer"'],
    ["safety", "id={s(row.driver_id)}", "id={undefined}"],
    ["safety", "id={s(row.unit_id)}", "id={undefined}"],
    ["safety", "id={s(row.subject_driver_id)}", "id={undefined}"],
    ["safety", "id={s(row.subject_unit_id)}", "id={undefined}"],
    ["workOrders", 'kind="unit"', 'kind="trailer"'],
    ["resolver", 'case "unit"', 'case "unit_removed"'],
  ];
  const missed = [];
  for (const [key, needle, replacement] of mutations) {
    if (!sources[key].includes(needle)) {
      missed.push(`${key}: mutation anchor missing (${needle})`);
      continue;
    }
    const mutated = {
      ...sources,
      [key]: sources[key].split(needle).join(replacement),
    };
    if (check(mutated).length === 0)
      missed.push(`${key}: planted defect escaped (${needle})`);
  }
  if (missed.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${missed.join("\n")}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — ${mutations.length} planted defects rejected`,
  );
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error(`${LABEL} FAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — embedded assignment and reverse panels use canonical related-entity drills`,
);
