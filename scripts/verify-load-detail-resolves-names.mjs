#!/usr/bin/env node
/**
 * GUARD — LV-TXN-002. The dispatch load-detail query must RESOLVE the primary driver name and the unit
 * number, not just carry their ids.
 *
 * THE DEFECT, exactly as it shipped and was reproduced live on prod (deploy e6343f4, USMCA load
 * L-20260802-0258): the drawer rendered **DRIVER: "Unassigned"** and **TRUCK UNIT: "—"** for a load that
 * had both. The data was correct and correctly entity-scoped — driver 88c04cf5 belonged to the load's own
 * company, and the unit was the ordinary TRK-owned / USMCA-leased case. The payload simply never carried
 * the names: `'assigned_primary_driver_name' in payload` was **false** and `'assigned_unit_number' in
 * payload` was **false**, while `'assigned_secondary_driver_name' in payload` was **true**.
 *
 * That last detail is the whole tell. The SECONDARY (team) driver was resolved three lines above the
 * primary in the same SELECT — so this was an oversight, not a design choice, and the screen a dispatcher
 * opens to work a load told them it had no driver and no truck. That invites double-assignment or an
 * "uncovered load" escalation on a load that is fully covered.
 *
 * WHY THE ASSERTION IS ON THE SELECT AND NOT ON THE ENTITY PREDICATE: a guard written over the scoping
 * predicate passes today and always would have — the predicates were never wrong. What was missing was
 * the projection. This asserts the columns are produced AND that each resolving join carries its entity
 * predicate, because adding the join unscoped would trade a blank label for a cross-entity leak.
 *
 * NOT CLAIMED: static text analysis of one query. It does not prove the rendered name is correct, only
 * that the query produces the columns the drawer reads and scopes the joins it uses to produce them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-detail-resolves-names";

/**
 * The columns LoadDetailDrawer.tsx reads with `?? "Unassigned"` / `?? "—"`.
 *
 * `trip_type` added 2026-08-08: the original card named THREE absent columns and only two were resolved,
 * so TRIP TYPE kept rendering "—". PROD-VERIFIED (information_schema, RLS-immune, visible == n_live_tup):
 * `views.dispatch_load_with_driver_status` has 18 columns and NO `trip_type`, while `mdata.loads` HAS it
 * and 6 of 10 loads carry a value (L-20260806-0008 = 'NB'). Fixing two of three fields and calling the
 * card closed is exactly the half-fix this guard exists to prevent.
 */
const REQUIRED_COLUMNS = ["assigned_primary_driver_name", "assigned_unit_number", "trip_type"];

/**
 * ★ SCOPE WIDENED 2026-08-10 — the guard covered ONE file, which is why the class was only half fixed.
 *
 * This guard was written for the dispatch by-id read and hard-coded to that single path. The drawer has
 * TWO by-id sources: `LoadDetailDrawer.tsx:146-148` prefers `useDispatchLoad` but falls back to `useLoad`
 * (`GET /api/v1/mdata/loads/:id`) whenever it has no `operatingCompanyId`, and `FactoringTab.tsx:164` /
 * `FinesDeductionsCard.tsx:55` call `useLoad` unconditionally. That mdata endpoint returned the three
 * assignment UUIDs and no resolved names at all — the SAME defect this guard exists to catch — and the
 * guard printed OK the entire time, because the broken path was simply outside its scope. A single-file
 * guard on a class that has more than one site is a false green by construction, so the file list is now
 * the unit of scope: adding a third by-id load read means adding it here.
 *
 * Per-target required columns, because the two SELECTs legitimately differ: the dispatch read projects
 * `trip_type` out of a VIEW that lacks the column (hence `ml.trip_type AS trip_type`), while the mdata
 * read selects it straight off `mdata.loads` as `l.trip_type` — same payload key, no alias needed.
 */
const TARGETS = [
  { file: "apps/backend/src/dispatch/loads.routes.ts", route: "/api/v1/dispatch/loads/:id", columns: REQUIRED_COLUMNS },
  {
    file: "apps/backend/src/mdata/loads.routes.ts",
    route: "/api/v1/mdata/loads/:id",
    columns: ["assigned_primary_driver_name", "assigned_unit_number"],
  },
];

export function auditMdataActiveStopLifecycle(src) {
  const problems = [];
  if (!/FROM mdata\.load_stops\s+WHERE load_id = \$1::uuid\s+AND soft_deleted_at IS NULL\s+ORDER BY sequence_number ASC, created_at ASC/.test(src)) {
    problems.push("mdata load detail must expose only active itinerary stops");
  }
  if (!/FROM mdata\.load_stops\s+WHERE load_id = \$1\s+AND id = \$2\s+AND soft_deleted_at IS NULL\s+LIMIT 1/.test(src)) {
    problems.push("mdata stop PATCH must snapshot only an active stop");
  }
  if (!/UPDATE mdata\.load_stops[\s\S]*?WHERE load_id = \$\$\{loadIdx\}[\s\S]*?AND id = \$\$\{stopIdx\}[\s\S]*?AND soft_deleted_at IS NULL[\s\S]*?RETURNING/.test(src)) {
    problems.push("mdata stop PATCH must not update a retired stop");
  }
  const reverseSelectors = src.match(/FROM mdata\.load_stops\s+WHERE load_id = l\.id\s+AND stop_type = '(?:pickup|delivery)'\s+AND soft_deleted_at IS NULL/g) ?? [];
  if (reverseSelectors.length !== 6) {
    problems.push(`all six mdata list/reverse pickup-delivery selectors must use active stops; found ${reverseSelectors.length}`);
  }
  return problems;
}

/**
 * The body of one route handler: from its `app.<verb>("<route>"` declaration to the next route
 * declaration at the same indent.
 *
 * ★ WHY THE COLUMN CHECK IS SLICED AND NOT FILE-WIDE (mutation-proven 2026-08-10, and it FAILED first):
 * the column assertion used to run over the whole file. Both loads.routes.ts files contain a LIST query
 * that already produces `AS assigned_primary_driver_name` and `AS assigned_unit_number` — so when the
 * by-id detail query lost BOTH names, the guard still printed OK, satisfied by the list query several
 * hundred lines away. I reproduced that live: stripping the aliases off the real file left the guard
 * green (rc=0). That is the identical file-wide-`.test()` false green the units-join check was already
 * fixed for; the columns had simply never been given the same treatment. Slicing to the route means the
 * detail query has to carry its own names and cannot borrow a sibling's.
 */
function routeSlice(src, route) {
  const decl = new RegExp(String.raw`app\.(?:get|post|put|patch|delete)\s*\(\s*['"\`]${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"\`]`);
  const start = src.search(decl);
  if (start === -1) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/\n\s{0,4}app\.(?:get|post|put|patch|delete)\s*\(/);
  return rest.slice(0, next === -1 ? rest.length : next);
}

/**
 * Every ON-clause for `LEFT JOIN <table> <alias>` in `src`, one entry per OCCURRENCE.
 *
 * WHY PER-OCCURRENCE (2026-08-08, mutation-proven): the first version of this guard asserted the entity
 * predicates with a file-wide `regex.test(src)`. `loads.routes.ts` contains TWO `LEFT JOIN mdata.units u`
 * — the list query (~L597) and the detail query (~L710) — so a correct predicate on EITHER satisfied the
 * whole assertion. Unscoping one join individually PASSED; the check could only fire when both broke at
 * the same time, which is the opposite of what a guard is for. That is a false green, and it is precisely
 * the `CI-...-FAKE-GREEN` shape the card forbids. Slicing per occurrence makes each join stand on its own.
 *
 * The slice runs from the alias to the next clause keyword, so one join's ON-clause can never borrow the
 * predicate of the join below it.
 */
function joinOnClauses(src, table, alias) {
  const opener = new RegExp(String.raw`LEFT JOIN\s+${table}\s+${alias}\b`, "gi");
  const closer = /\n\s*(?:LEFT\s+JOIN|INNER\s+JOIN|JOIN|WHERE|GROUP\s+BY|ORDER\s+BY|LIMIT|\)\s)/i;
  const clauses = [];
  let m;
  while ((m = opener.exec(src)) !== null) {
    const rest = src.slice(m.index + m[0].length);
    const end = rest.search(closer);
    clauses.push(rest.slice(0, end === -1 ? rest.length : end));
  }
  return clauses;
}

export function auditSource(src, FILE = TARGETS[0].file, columns = REQUIRED_COLUMNS, route = null) {
  const problems = [];

  // Columns are asserted against the by-id handler ONLY (see routeSlice). `route: null` means the caller
  // already handed us an isolated query — the selftest's synthetic cases — so the slice is the input.
  let scope = src;
  if (route) {
    scope = routeSlice(src, route);
    if (scope === null) {
      return [
        `${FILE}: no handler found for \`${route}\` — the guard cannot locate the by-id load read it ` +
          `exists to check, so it would otherwise pass vacuously. If the route moved, move this target.`,
      ];
    }
  }

  for (const col of columns) {
    if (!new RegExp(String.raw`AS\s+${col}\b`, "i").test(scope)) {
      problems.push(
        `${FILE}: the load-detail SELECT does not produce \`${col}\`. ` +
          `LoadDetailDrawer reads it and falls back to "Unassigned"/"—", so a load WITH a driver or unit ` +
          `renders as having neither (LV-TXN-002).`,
      );
    }
  }

  // The resolving joins must stay entity-scoped — EACH ONE, not "at least one of them". Adding a join
  // unscoped would trade a blank label for a cross-entity leak, which is strictly worse than the bug.
  joinOnClauses(src, String.raw`mdata\.drivers`, "pd").forEach((on, i) => {
    if (!/\bpd\.operating_company_id\s*=\s*l\.operating_company_id/i.test(on)) {
      problems.push(
        `${FILE}: primary-driver join #${i + 1} (LEFT JOIN mdata.drivers pd) is not scoped to the load's ` +
          `operating_company_id — a driver from another entity can resolve into this load's payload.`,
      );
    }
  });

  // `trip_type` is read from mdata.loads, so that join must carry the load's own entity predicate too —
  // it is the same id, but an unscoped join here would still be a cross-entity read waiting to happen.
  joinOnClauses(src, String.raw`mdata\.loads`, "ml").forEach((on, i) => {
    if (!/\bml\.operating_company_id\s*=\s*l\.operating_company_id/i.test(on)) {
      problems.push(
        `${FILE}: mdata.loads join #${i + 1} (alias ml, used for trip_type) is not scoped to the load's ` +
          `operating_company_id.`,
      );
    }
  });

  // mdata.units has NO operating_company_id (§4) — it is scoped by the owner/leased PAIR. The live case
  // that exposed this bug was a TRK-owned unit leased to USMCA, which `owner_company_id` alone drops.
  joinOnClauses(src, String.raw`mdata\.units`, "u").forEach((on, i) => {
    const scoped =
      /COALESCE\s*\(\s*u\.currently_leased_to_company_id\s*,\s*u\.owner_company_id\s*\)\s*=\s*l\.operating_company_id/i;
    if (!scoped.test(on)) {
      problems.push(
        `${FILE}: unit join #${i + 1} (LEFT JOIN mdata.units u) must use ` +
          `COALESCE(currently_leased_to_company_id, owner_company_id) = l.operating_company_id. ` +
          `mdata.units has no operating_company_id column (§4), and owner_company_id alone silently drops ` +
          `every TRK-owned / leased-to-operator unit — the exact shape of the load that exposed LV-TXN-002.`,
      );
    }
  });

  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `
    SELECT l.*,
      NULLIF(TRIM(CONCAT(pd.first_name,' ',pd.last_name)),'') AS assigned_primary_driver_name,
      u.unit_number AS assigned_unit_number,
      ml.trip_type AS trip_type
    FROM views.dispatch_load_with_driver_status l
    LEFT JOIN mdata.loads ml ON ml.id = l.id
                            AND ml.operating_company_id = l.operating_company_id
    LEFT JOIN mdata.drivers pd ON pd.id = l.assigned_primary_driver_id
                              AND pd.operating_company_id = l.operating_company_id
    LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                           AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
  `;
  // TWO units joins, mirroring the real file (list query ~L597 + detail query ~L710). The old file-wide
  // `.test()` passed whenever EITHER stayed correct, so these two-join cases are the regression bar.
  const twoUnitJoins = `
    SELECT l.*,
      NULLIF(TRIM(CONCAT(pd.first_name,' ',pd.last_name)),'') AS assigned_primary_driver_name,
      u.unit_number AS assigned_unit_number,
      ml.trip_type AS trip_type
    FROM views.dispatch_load_with_driver_status l
    LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                           AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
    LEFT JOIN mdata.loads ml ON ml.id = l.id
                            AND ml.operating_company_id = l.operating_company_id
    WHERE l.operating_company_id = $1;

    SELECT l.* FROM views.dispatch_load_with_driver_status l
    LEFT JOIN mdata.drivers pd ON pd.id = l.assigned_primary_driver_id
                              AND pd.operating_company_id = l.operating_company_id
    LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                           AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
    WHERE l.id = $1
  `;
  // Unscope ONLY the SECOND units join — the exact live mutation that the old guard let through.
  const secondUnitJoinUnscoped = twoUnitJoins.replace(
    /COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\)([\s\S]*?)COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\)/,
    "COALESCE(u.currently_leased_to_company_id, u.owner_company_id)$1u.owner_company_id",
  );
  // ...and ONLY the first.
  const firstUnitJoinUnscoped = twoUnitJoins.replace(
    /COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\)/,
    "u.owner_company_id",
  );

  // The mdata by-id read: what shipped, and what it must look like. Kept as literal source rather than
  // a mutation of `good`, because the defect here is the ABSENCE of the joins entirely — not a tweak to
  // a query that already had them.
  const mdataShipped = `
    SELECT
      id, operating_company_id, load_number, customer_id, status,
      assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
      trip_type
    FROM mdata.loads
    WHERE id = $1
    LIMIT 1
  `;
  const mdataFixed = `
    SELECT
      l.id, l.operating_company_id, l.load_number, l.status,
      l.assigned_unit_id, l.assigned_primary_driver_id, l.assigned_secondary_driver_id,
      NULLIF(TRIM(CONCAT(pd.first_name,' ',pd.last_name)),'') AS assigned_primary_driver_name,
      NULLIF(TRIM(CONCAT(sd.first_name,' ',sd.last_name)),'') AS assigned_secondary_driver_name,
      u.unit_number AS assigned_unit_number,
      l.trip_type
    FROM mdata.loads l
    LEFT JOIN mdata.drivers pd ON pd.id = l.assigned_primary_driver_id
                              AND pd.operating_company_id = l.operating_company_id
    LEFT JOIN mdata.drivers sd ON sd.id = l.assigned_secondary_driver_id
                              AND sd.operating_company_id = l.operating_company_id
    LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                           AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
    WHERE l.id = $1
    LIMIT 1
  `;

  // Two handlers in one file: the LIST resolves both names, the BY-ID resolves neither. This is the real
  // shape of apps/backend/src/mdata/loads.routes.ts as it stood on b9f897488.
  const listResolvesButDetailDoesNot = `
  app.get("/api/v1/mdata/loads", async (req, reply) => {
    const res = await client.query(\`
      SELECT l.*,
        NULLIF(TRIM(CONCAT(pd.first_name,' ',pd.last_name)),'') AS assigned_primary_driver_name,
        u.unit_number AS assigned_unit_number
      FROM mdata.loads l
      LEFT JOIN mdata.drivers pd ON pd.id = l.assigned_primary_driver_id
                                AND pd.operating_company_id = l.operating_company_id
      LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                             AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
    \`);
  });

  app.get("/api/v1/mdata/loads/:id", async (req, reply) => {
    const res = await client.query(\`
      SELECT id, operating_company_id, load_number,
             assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id
      FROM mdata.loads WHERE id = $1 LIMIT 1
    \`);
  });
  `;

  const cases = [
    ["fully fixed query", good, 0],
    ["missing BOTH columns (the shipped defect)", good.replace(/AS assigned_primary_driver_name/, "AS x").replace(/AS assigned_unit_number/, "AS y"), 2],
    ["missing only the unit number", good.replace(/AS assigned_unit_number/, "AS y"), 1],
    ["missing trip_type — the field the first fix forgot", good.replace(/AS trip_type/, "AS z"), 1],
    ["mdata.loads join unscoped (cross-entity read)", good.replace(/\s+AND ml\.operating_company_id = l\.operating_company_id/, ""), 1],
    ["unit join scoped by owner_company_id alone (drops leased units)", good.replace(/COALESCE\([^)]*\)/, "u.owner_company_id"), 1],
    ["primary-driver join unscoped (cross-entity leak)", good.replace(/\s+AND pd\.operating_company_id = l\.operating_company_id/, ""), 1],
    ["two units joins, both correct", twoUnitJoins, 0],
    ["REGRESSION BAR — only the SECOND units join unscoped (old guard passed this)", secondUnitJoinUnscoped, 1],
    ["REGRESSION BAR — only the FIRST units join unscoped (old guard passed this)", firstUnitJoinUnscoped, 1],
    // ── The mdata by-id read (TARGETS[1]) — the site the single-file guard could not see. ──────────
    // `mdataShipped` is the SELECT verbatim as it stood on origin/main b9f897488: the three assignment
    // UUIDs and not one resolved name. The old guard printed OK against this file because it never read
    // it; the widened guard must score it as TWO problems, or the scope widening bought nothing.
    ["REGRESSION BAR — mdata by-id read as SHIPPED (uuids only, zero joins)", mdataShipped, 2, TARGETS[1].columns],
    ["mdata by-id read, fixed", mdataFixed, 0, TARGETS[1].columns],
    ["mdata fixed but unit join scoped by owner_company_id alone (drops leased units)", mdataFixed.replace(/COALESCE\([^)]*\)/, "u.owner_company_id"), 1, TARGETS[1].columns],
    ["mdata fixed but primary-driver join unscoped (cross-entity leak)", mdataFixed.replace(/\s+AND pd\.operating_company_id = l\.operating_company_id/, ""), 1, TARGETS[1].columns],
    // ── The false green this guard actually shipped with. ─────────────────────────────────────────
    // A file where the LIST query resolves both names and the by-id query resolves neither. The
    // file-wide column check scored this 0 problems — verified against the real file, not predicted.
    // Route-sliced, it must score 2. This is the regression bar for the scope of the column check.
    [
      "REGRESSION BAR — list query resolves names, by-id query does not (file-wide check passed this)",
      listResolvesButDetailDoesNot,
      2,
      TARGETS[1].columns,
      "/api/v1/mdata/loads/:id",
    ],
    [
      "route absent — guard must refuse to pass vacuously",
      listResolvesButDetailDoesNot.replace('"/api/v1/mdata/loads/:id"', '"/api/v1/mdata/loads/:other"'),
      1,
      TARGETS[1].columns,
      "/api/v1/mdata/loads/:id",
    ],
  ];
  let bad = 0;
  for (const [name, src, want, columns, route] of cases) {
    const got = auditSource(src, TARGETS[0].file, columns ?? REQUIRED_COLUMNS, route ?? null).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want} problem(s), got ${got}`);
      bad++;
    }
  }
  const realMdata = fs.readFileSync(path.join(ROOT, TARGETS[1].file), "utf8");
  if (auditMdataActiveStopLifecycle(realMdata).length) {
    console.error("SELFTEST FAIL: real mdata active-stop lifecycle rejected", auditMdataActiveStopLifecycle(realMdata));
    bad++;
  }
  const activeStopMutations = [
    realMdata.replace(/\s+AND soft_deleted_at IS NULL/g, ""),
    realMdata.replace(/(WHERE load_id = \$1\s+AND id = \$2)\s+AND soft_deleted_at IS NULL/, "$1"),
  ];
  for (const [index, mutated] of activeStopMutations.entries()) {
    if (auditMdataActiveStopLifecycle(mutated).length === 0) {
      console.error(`SELFTEST FAIL: mdata active-stop mutation ${index + 1} escaped`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} mutations detected correctly`);
  process.exit(0);
}

const problems = [];
for (const target of TARGETS) {
  const abs = path.join(ROOT, target.file);
  if (!fs.existsSync(abs)) {
    console.error(`${LABEL} FAIL — missing ${target.file}; scope is wrong, refusing to pass vacuously.`);
    process.exit(1);
  }
  problems.push(...auditSource(fs.readFileSync(abs, "utf8"), target.file, target.columns, target.route));
}
problems.push(...auditMdataActiveStopLifecycle(fs.readFileSync(path.join(ROOT, TARGETS[1].file), "utf8")));

if (problems.length) {
  console.error(`${LABEL} FAIL — the load-detail drawer will render a covered load as uncovered:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nFix: mirror the resolving joins already present in the sibling by-id read — every by-id load\n` +
      `read the drawer can land on must produce the same names, or the payload the user sees depends on\n` +
      `which of the two endpoints answered.\n`,
  );
  process.exit(1);
}

console.log(
  `${LABEL} OK — ${TARGETS.length} by-id load reads resolve driver + unit names, every join entity-scoped.`,
);
process.exit(0);
