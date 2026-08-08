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
const FILE = "apps/backend/src/dispatch/loads.routes.ts";

/** The two columns LoadDetailDrawer.tsx reads with `?? "Unassigned"` / `?? "—"`. */
const REQUIRED_COLUMNS = ["assigned_primary_driver_name", "assigned_unit_number"];

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

export function auditSource(src) {
  const problems = [];

  for (const col of REQUIRED_COLUMNS) {
    if (!new RegExp(String.raw`AS\s+${col}\b`, "i").test(src)) {
      problems.push(
        `${FILE}: the dispatch load-detail SELECT does not produce \`${col}\`. ` +
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
      u.unit_number AS assigned_unit_number
    FROM views.dispatch_load_with_driver_status l
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
      u.unit_number AS assigned_unit_number
    FROM views.dispatch_load_with_driver_status l
    LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                           AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
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

  const cases = [
    ["fully fixed query", good, 0],
    ["missing BOTH columns (the shipped defect)", good.replace(/AS assigned_primary_driver_name/, "AS x").replace(/AS assigned_unit_number/, "AS y"), 2],
    ["missing only the unit number", good.replace(/AS assigned_unit_number/, "AS y"), 1],
    ["unit join scoped by owner_company_id alone (drops leased units)", good.replace(/COALESCE\([^)]*\)/, "u.owner_company_id"), 1],
    ["primary-driver join unscoped (cross-entity leak)", good.replace(/\s+AND pd\.operating_company_id = l\.operating_company_id/, ""), 1],
    ["two units joins, both correct", twoUnitJoins, 0],
    ["REGRESSION BAR — only the SECOND units join unscoped (old guard passed this)", secondUnitJoinUnscoped, 1],
    ["REGRESSION BAR — only the FIRST units join unscoped (old guard passed this)", firstUnitJoinUnscoped, 1],
  ];
  let bad = 0;
  for (const [name, src, want] of cases) {
    const got = auditSource(src).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want} problem(s), got ${got}`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} mutations detected correctly`);
  process.exit(0);
}

const abs = path.join(ROOT, FILE);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL — missing ${FILE}; scope is wrong, refusing to pass vacuously.`);
  process.exit(1);
}

const problems = auditSource(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — the load-detail drawer will render a covered load as uncovered:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nFix: mirror the already-correct sibling query at apps/backend/src/mdata/loads.routes.ts:636.\n`,
  );
  process.exit(1);
}

console.log(`${LABEL} OK — load detail resolves ${REQUIRED_COLUMNS.join(" + ")}, both joins entity-scoped.`);
process.exit(0);
