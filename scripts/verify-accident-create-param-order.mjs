#!/usr/bin/env node
/**
 * GUARD: accident CREATE INSERT must bind driver/unit/trailer/vendor/load to distinct params.
 *
 * DEFECT (live code on main 2026-08-12): VALUES used `$1,$2,$3, $3, $4, $5, COALESCE($7…)` while
 * the param array was [company, type, driver, unit, vendor, load, accident_at, …]. That wrote
 * driver_id into unit_id, unit into vendor_id, vendor into load_id — scrambling trip linkage for
 * every new accident (Safety → Insurance → Load P&L chain).
 *
 * Trailer linkage adds a seventh leading bind, so accident_at is $8. Also ratchets
 * RecordExpenseForm to call suggestExpenseLoad (same going-forward path as WO) so
 * expense creates stamp the active trip when driver/unit + date are set.
 *
 * Rule 17: wired via verify-steps/3128-… only — never package.json / ci.yml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/safety/safety.routes.ts";
const EXPENSE_FORM = "apps/frontend/src/components/expenses/RecordExpenseForm.tsx";
const LABEL = "verify-accident-create-param-order";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Slice the accident_reports INSERT…VALUES block from the route source. */
export function extractAccidentInsertValues(routeSrc) {
  const start = routeSrc.indexOf("INSERT INTO safety.accident_reports");
  if (start < 0) return null;
  const valuesIdx = routeSrc.indexOf("VALUES (", start);
  if (valuesIdx < 0) return null;
  const end = routeSrc.indexOf("RETURNING", valuesIdx);
  if (end < 0) return null;
  return routeSrc.slice(valuesIdx, end);
}

export function assertAccidentCreateParamOrder(sources) {
  const route = sources?.[ROUTE] ?? read(ROUTE);
  const expense = sources?.[EXPENSE_FORM] ?? read(EXPENSE_FORM);
  const problems = [];

  const valuesBlock = extractAccidentInsertValues(route);
  if (!valuesBlock) {
    problems.push(`${ROUTE}: cannot find INSERT INTO safety.accident_reports … VALUES (…)`);
  } else {
    // Forbidden: unit_id bound to $3 (driver) — the measured defect.
    if (/VALUES\s*\(\s*\$1\s*,\s*\$2\s*,\s*\$3\s*,\s*\$3\b/s.test(valuesBlock)) {
      problems.push(
        `${ROUTE}: accident INSERT VALUES reuses $3 for unit_id (driver_id) — unit/vendor/load FKs scramble.`,
      );
    }
    // Required: seven distinct leading binds then accident_at at $8.
    if (!/VALUES\s*\(\s*\$1\s*,\s*\$2\s*,\s*\$3\s*,\s*\$4\s*,\s*\$5\s*,\s*\$6\s*,\s*\$7\s*,/s.test(valuesBlock)) {
      problems.push(
        `${ROUTE}: expected VALUES ($1…$7, …) for company/type/driver/unit/trailer/vendor/load.`,
      );
    }
    if (!/COALESCE\s*\(\s*\$8\s*::\s*timestamptz/i.test(valuesBlock)) {
      problems.push(`${ROUTE}: accident_at must remain COALESCE($8::timestamptz, …) after $1…$7.`);
    }
  }

  if (!expense.includes("suggestExpenseLoad")) {
    problems.push(
      `${EXPENSE_FORM}: missing suggestExpenseLoad — expense create must auto-detect active trip like CreateWorkOrderModal.`,
    );
  }

  for (const token of [
    "missingAccidentCompanyLinks(client, companyId, body.data)",
    "FROM mdata.drivers d",
    "FROM mdata.units u",
    "FROM mdata.equipment e",
    "FROM mdata.vendors v",
    "FROM mdata.loads l",
    'error: "accident_link_not_found"',
  ]) {
    if (!route.includes(token)) problems.push(`${ROUTE}: missing company-scoped accident linkage guard token: ${token}`);
  }
  if (/const beforeRes = await client[\s\S]{0,400}?FROM safety\.accident_reports[\s\S]{0,400}?\.catch\s*\(/.test(route)) {
    problems.push(`${ROUTE}: accident PATCH before-read must propagate SQL failures instead of returning false not-found`);
  }
  if (!/queryKey:\s*\[[^\]]*suggest-load/s.test(expense) && !expense.includes('"suggest-load"')) {
    problems.push(`${EXPENSE_FORM}: suggest-load queryKey missing — auto-detect not wired.`);
  }

  return problems;
}

function mutateBroken(routeSrc) {
  return routeSrc.replace(
    /VALUES\s*\(\s*\$1\s*,\s*\$2\s*,\s*\$3\s*,\s*\$4\s*,\s*\$5\s*,\s*\$6\s*,\s*\$7\s*,/s,
    "VALUES (\n            $1,$2,$3,\n            $3,\n            $4,\n            $5,\n            ",
  );
}

function main() {
  if (SELFTEST) {
    const route = read(ROUTE);
    const expense = read(EXPENSE_FORM);
    const ok = assertAccidentCreateParamOrder({ [ROUTE]: route, [EXPENSE_FORM]: expense });
    if (ok.length) {
      console.error(`${LABEL} SELFTEST FAIL — current tree already broken:\n- ${ok.join("\n- ")}`);
      process.exit(1);
    }
    const broken = assertAccidentCreateParamOrder({
      [ROUTE]: mutateBroken(route)
        .replaceAll("missingAccidentCompanyLinks(client, companyId, body.data)", "Promise.resolve([])")
        .replace('error: "accident_link_not_found"', 'error: "not_found"')
        .replace(
          "]);\n      const before = beforeRes.rows[0];",
          "]).catch(() => ({ rows: [] }));\n      const before = beforeRes.rows[0];",
        ),
      [EXPENSE_FORM]: expense.replace(/suggestExpenseLoad/g, "NOT_SUGGEST"),
    });
    if (broken.length < 5) {
      console.error(
        `${LABEL} SELFTEST FAIL — planted defect did not fail enough (got ${broken.length}):\n- ${broken.join("\n- ")}`,
      );
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (${broken.length} planted failures detected)`);
    process.exit(0);
  }

  const problems = assertAccidentCreateParamOrder();
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
