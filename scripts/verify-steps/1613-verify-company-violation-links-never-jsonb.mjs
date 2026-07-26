// 1613-verify-company-violation-links-never-jsonb — SAF-B28.
//
// safety.company_violations.related_drivers / related_units / related_fine_ids are RETIRED jsonb id
// arrays. Their replacements are the FK join tables safety.company_violation_{drivers,units,fines}.
//
// THE BUG THIS PINS: the CREATE path was repointed to the join tables (SAF-F29) but the PATCH path
// was not. It kept writing `related_drivers = $n::jsonb` and never touched the join tables. Nothing
// errored. The consequences were all silent:
//
//   • the auto-fine trigger resolves its driver from the join table, so a violation whose drivers
//     were only ever set by an edit issued NO internal fine on create->close — HTTP 200, no money
//     record, autoCreatedInternalFineUuid: null;
//   • migration 202609130000 §3 installs a stop-write trigger on those columns, so the surviving
//     PATCH write would have raised 0A000 on EVERY violation edit the moment it was applied;
//   • GET /:id was a bare SELECT *, returning the frozen jsonb and none of the join arrays that
//     LIST already returned — so a link edit appeared to vanish on reload.
//
// A jsonb array of ids has no FK, no cascade, and no reverse query: it can name a deleted or simply
// wrong row and nothing notices. That is why the column is retired rather than merely discouraged.
import fs from "node:fs";
import path from "node:path";

const ROUTES = "apps/backend/src/safety/company-violations.routes.ts";
const RETIRED = ["related_drivers", "related_units", "related_fine_ids"];
const JOIN_TABLES = ["company_violation_drivers", "company_violation_units", "company_violation_fines"];

export function auditViolationLinkWrites(source) {
  const problems = [];

  // 1. No write of a retired column, in any casting form: `related_drivers = $3::jsonb`, a bare
  //    `SET related_units =`, or a column list naming one of them.
  for (const col of RETIRED) {
    const writeRe = new RegExp(`${col}\\s*=\\s*\\$\\d+(::jsonb)?|SET\\s+${col}\\s*=`, "i");
    if (writeRe.test(source)) {
      problems.push(
        `${ROUTES} writes the RETIRED jsonb column '${col}'. Write the FK join table instead ` +
          `(safety.${JOIN_TABLES[RETIRED.indexOf(col)]}). The jsonb has no FK, no reverse read, and ` +
          `migration 202609130000 §3 raises 0A000 on any UPDATE that changes it.`,
      );
    }
  }

  // 2. The PATCH handler must actually sync the join tables — absence of a jsonb write is not proof
  //    that the links are persisted anywhere at all.
  const patchIdx = source.indexOf('app.patch("/api/v1/safety/company-violations/:id"');
  if (patchIdx === -1) {
    problems.push(`${ROUTES}: could not locate the PATCH handler — this guard would pass vacuously.`);
  } else {
    const patchBody = source.slice(patchIdx, patchIdx + 9000);
    // The sync builds its SQL as `safety.${table}` from a name map, so the fully-qualified literal
    // never appears. Require BOTH: every join table named in the handler, AND an actual interpolated
    // write against one — so a leftover name map with no query behind it cannot satisfy this.
    for (const table of JOIN_TABLES) {
      if (!patchBody.includes(table)) {
        problems.push(
          `${ROUTES} PATCH handler never references ${table}. An edit to the linked ` +
            `${table.replace("company_violation_", "")} would be accepted and then persisted nowhere.`,
        );
      }
    }
    if (!/INSERT INTO safety\.(\$\{table\}|company_violation_)/.test(patchBody)) {
      problems.push(
        `${ROUTES} PATCH handler names the join tables but never INSERTs into one — the link edit is ` +
          `accepted and dropped. A name map is not a write.`,
      );
    }
    // Retirement must be is_active=false: DELETE is REVOKEd on these tables (202607840000).
    if (!/is_active\s*=\s*FALSE/i.test(patchBody)) {
      problems.push(
        `${ROUTES} PATCH handler never retires a dropped link (is_active = FALSE). Removing an id ` +
          `from the payload must retire its join row; DELETE is REVOKEd on these tables.`,
      );
    }
    if (/DELETE\s+FROM\s+safety\.company_violation_/i.test(patchBody)) {
      problems.push(
        `${ROUTES} PATCH handler DELETEs a join row. void-not-delete: retire with is_active = FALSE. ` +
          `DELETE is REVOKEd on these tables and would 500 at runtime.`,
      );
    }
  }

  // 3. The detail read must return the join arrays, or an edit looks like it vanished on reload.
  const getIdx = source.indexOf('app.get("/api/v1/safety/company-violations/:id"');
  if (getIdx === -1) {
    problems.push(`${ROUTES}: could not locate the GET /:id handler — this guard would pass vacuously.`);
  } else {
    const getBody = source.slice(getIdx, getIdx + 3000);
    if (!getBody.includes("company_violation_drivers")) {
      problems.push(
        `${ROUTES} GET /:id does not return the join-table arrays (LIST already does). A bare ` +
          `SELECT * serves the frozen jsonb, so a link edit appears to vanish on reload.`,
      );
    }
  }

  return problems;
}

export default {
  name: "verify:company-violation-links-never-jsonb",
  run() {
    // selftest — synthetic sources, so no arm can pass vacuously.
    const good = fs.readFileSync(ROUTES, "utf8");
    if (auditViolationLinkWrites(good).length) {
      throw new Error("SELFTEST FAILED: the real, fixed source is flagged");
    }

    // arm A — reintroduce the jsonb write that SAF-B28 removed.
    const withJsonbWrite = good.replace(
      'const columnEntries = entries.filter(([key]) => !isLinkKey(key));',
      'const columnEntries = entries; sets.push(`related_drivers = $1::jsonb`);',
    );
    if (withJsonbWrite === good) throw new Error("SELFTEST FAILED: arm A did not mutate the source");
    if (!auditViolationLinkWrites(withJsonbWrite).some((p) => p.includes("related_drivers"))) {
      throw new Error("SELFTEST FAILED: a reintroduced jsonb write was not caught");
    }

    // arm B — PATCH stops syncing the join tables.
    const patchAt = good.indexOf('app.patch("/api/v1/safety/company-violations/:id"');
    const withoutSync =
      good.slice(0, patchAt) +
      good.slice(patchAt).replace(/company_violation_(drivers|units|fines)/g, "nowhere");
    if (!auditViolationLinkWrites(withoutSync).length) {
      throw new Error("SELFTEST FAILED: a PATCH that syncs nothing was not caught");
    }

    // arm C — a hard DELETE instead of is_active retirement.
    const withDelete = good.replace(
      /UPDATE safety\.\$\{table\}\n\s*SET is_active = FALSE/,
      "DELETE FROM safety.company_violation_drivers\n                SET is_active = FALSE",
    );
    if (withDelete !== good && !auditViolationLinkWrites(withDelete).some((p) => p.includes("void-not-delete"))) {
      throw new Error("SELFTEST FAILED: a hard DELETE of a join row was not caught");
    }

    // arm D — GET /:id reverts to a bare SELECT *.
    const getAt = good.indexOf('app.get("/api/v1/safety/company-violations/:id"');
    const bareGet =
      good.slice(0, getAt) +
      good.slice(getAt, getAt + 3000).replace(/company_violation_drivers/g, "x") +
      good.slice(getAt + 3000);
    if (!auditViolationLinkWrites(bareGet).some((p) => p.includes("GET /:id"))) {
      throw new Error("SELFTEST FAILED: a bare SELECT * detail read was not caught");
    }

    const problems = auditViolationLinkWrites(fs.readFileSync(path.resolve(ROUTES), "utf8"));
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      throw new Error(`verify:company-violation-links-never-jsonb FAIL — ${problems.length} problem(s)`);
    }
    console.log(
      "verify:company-violation-links-never-jsonb OK — create, edit and detail-read all speak the FK " +
        "join tables; the retired jsonb columns are written by nothing.",
    );
    return 0;
  },
};
