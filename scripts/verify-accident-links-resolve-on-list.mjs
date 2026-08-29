#!/usr/bin/env node
/**
 * SAF-B25 — every entity the accident creator captures must resolve on the accident list.
 *
 * The defect: `safety.accident_reports` has FKed `mdata.loads` (load_id) and `mdata.vendors`
 * (vendor_id) since the table was created, the office creator has always captured all four links
 * (driver / unit / vendor / load — AccidentReportDrawer), and the INSERT has always persisted them.
 * The LIST joined only driver and unit. So an accident could be filed against a specific trip and a
 * specific tow/repair vendor, and neither could be read back from the list: no column, no join, no
 * drill-through. For a record whose readers are insurers, claims adjusters and attorneys, the trip
 * an accident happened on is not an optional nicety.
 *
 * This guard asserts the capture set and the read set AGREE. Capture is discovered from the creator
 * payload rather than hardcoded, so a fifth link added to the drawer tomorrow is in scope
 * immediately — and the count is printed, so "0 missing" always reads as "0 of N".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const DRAWER = join(ROOT, "apps/frontend/src/components/safety/AccidentReportDrawer.tsx");
const LIST_PAGE = join(ROOT, "apps/frontend/src/pages/safety/AccidentsPage.tsx");
const ROUTES = join(ROOT, "apps/backend/src/safety/safety.routes.ts");

/** How each captured link must resolve: the SQL join alias/column, and the list EntityLink kind. */
const LINK_CONTRACT = {
  driver_id: { join: /LEFT JOIN mdata\.drivers d\b/, kind: "driver" },
  unit_id: { join: /LEFT JOIN mdata\.units u\b/, kind: "unit" },
  load_id: { join: /LEFT JOIN mdata\.loads l\b/, kind: "load" },
  vendor_id: { join: /LEFT JOIN mdata\.vendors v\b/, kind: "vendor" },
};

// RE-ANCHOR (found stale 2026-08-29): the accident DETAIL route (GET .../:id, registered later in
// this same file) also LEFT JOINs mdata.loads/mdata.vendors — correctly, it's not the defect this
// guard exists for. But `contract.join` above only ever tested the WHOLE file, so a regression
// that dropped the LIST route's join stayed masked by the DETAIL route's identical join pattern
// surviving elsewhere. Bound the join checks to the LIST route's own body (GET
// "/api/v1/safety/accidents", the multi-line-call-signature form, through the next route
// registration) so a LIST-specific regression can't hide behind the DETAIL route's copy.
const LIST_ROUTE_MARKER = '"/api/v1/safety/accidents",';
const NEXT_ROUTE_MARKER = '"/api/v1/safety/accidents/:id"';

function extractListRouteBody(routesSrc) {
  const start = routesSrc.indexOf(LIST_ROUTE_MARKER);
  if (start === -1) return null;
  const end = routesSrc.indexOf(NEXT_ROUTE_MARKER, start + LIST_ROUTE_MARKER.length);
  return routesSrc.slice(start, end === -1 ? routesSrc.length : end);
}

export function run() {
  const drawer = readFileSync(DRAWER, "utf8");
  const page = readFileSync(LIST_PAGE, "utf8");
  const routes = readFileSync(ROUTES, "utf8");
  const listRouteBody = extractListRouteBody(routes);
  if (!listRouteBody) {
    return {
      ok: false,
      captured: [],
      problems: [],
      message: "FAIL: could not find the GET /api/v1/safety/accidents (list) route registration.",
    };
  }

  // Discover what the creator actually sends, from the payload object it builds.
  const captured = Object.keys(LINK_CONTRACT).filter((key) =>
    new RegExp(`${key}:\\s*\\w+\\s*\\|\\|\\s*null`).test(drawer)
  );

  if (captured.length === 0) {
    return {
      ok: false,
      captured: [],
      problems: [],
      message:
        "FAIL: discovered ZERO captured entity links in the accident creator — the guard lost its " +
        "subject and would pass vacuously. Fix the discovery pattern, do not ignore this.",
    };
  }

  const problems = [];
  for (const key of captured) {
    const contract = LINK_CONTRACT[key];
    if (!contract.join.test(listRouteBody)) {
      problems.push(
        `${key} is captured by the creator but the accident list SQL does not join it — the value is stored and unreadable.`
      );
    }
    // The list must drill through, not just print a raw uuid.
    const linkRe = new RegExp(`kind="${contract.kind}"[\\s\\S]{0,200}?row\\.${key}`);
    if (!linkRe.test(page)) {
      problems.push(
        `${key} is captured by the creator but the accident list renders no EntityLink kind="${contract.kind}" bound to row.${key}.`
      );
    }
  }

  // Entity scoping is not optional on a joined tenant table.
  for (const [table, alias] of [
    ["mdata.loads", "l"],
    ["mdata.vendors", "v"],
  ]) {
    const scoped = new RegExp(
      `LEFT JOIN ${table.replace(".", "\\.")} ${alias}\\b[\\s\\S]{0,200}?${alias}\\.operating_company_id = ar\\.operating_company_id`
    );
    if (!scoped.test(listRouteBody)) {
      problems.push(`the ${table} join is not scoped by operating_company_id — a cross-entity leak.`);
    }
  }

  const ok = problems.length === 0;
  return {
    ok,
    captured,
    problems,
    message: ok
      ? `PASS: all ${captured.length} entity links captured by the accident creator resolve on the list ` +
        `(joined, entity-scoped, and drilled through).`
      : `FAIL (${problems.length}):\n  - ${problems.join("\n  - ")}`,
  };
}

/**
 * Plants each real defect back into the real sources one at a time — removing a join, removing a
 * column, and removing the entity scoping — and requires each to be caught separately.
 */
function selftest() {
  const { writeFileSync } = fsSync;
  const cases = [
    {
      name: "list SQL stops joining mdata.loads",
      file: ROUTES,
      find: "          LEFT JOIN mdata.loads l\n            ON l.id = ar.load_id\n           AND l.operating_company_id = ar.operating_company_id",
      replace: "",
      expect: /load_id is captured .* does not join it/s,
    },
    {
      name: "loads join loses its entity scoping",
      file: ROUTES,
      find: "            ON l.id = ar.load_id\n           AND l.operating_company_id = ar.operating_company_id",
      replace: "            ON l.id = ar.load_id",
      expect: /mdata\.loads join is not scoped/,
    },
    {
      name: "list page drops the Load drill-through",
      file: LIST_PAGE,
      find: '<EntityLink kind="load" id={row.load_id as string | undefined}',
      replace: '<EntityLink kind="driver" id={row.driver_id as string | undefined}',
      expect: /no EntityLink kind="load"/,
    },
    {
      name: "list page drops the Vendor drill-through",
      file: LIST_PAGE,
      find: '<EntityLink kind="vendor" id={row.vendor_id as string | undefined}',
      replace: '<EntityLink kind="driver" id={row.driver_id as string | undefined}',
      expect: /no EntityLink kind="vendor"/,
    },
  ];

  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository already red before any mutation.\n${baseline.message}`);
    process.exit(1);
  }

  for (const c of cases) {
    const original = readFileSync(c.file, "utf8");
    if (!original.includes(c.find)) {
      console.error(`SELFTEST FAIL: anchor for "${c.name}" not found — the mutation would be a no-op.`);
      process.exit(1);
    }
    let caught;
    try {
      writeFileSync(c.file, original.replace(c.find, c.replace), "utf8");
      caught = run();
    } finally {
      writeFileSync(c.file, original, "utf8");
    }
    if (caught.ok || !c.expect.test(caught.message)) {
      console.error(`SELFTEST FAIL: "${c.name}" was NOT caught.\nGuard said: ${caught.message}`);
      process.exit(1);
    }
    console.log(`  caught: ${c.name}`);
  }

  const after = run();
  if (!after.ok) {
    console.error(`SELFTEST FAIL: restore did not return the repository to green.\n${after.message}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: all ${cases.length} planted defects were caught and the repository restored green.`);
}

import * as fsSync from "node:fs";

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (result.captured?.length) console.log(`  captured links: ${result.captured.join(", ")}`);
  if (!result.ok) process.exit(1);
}
