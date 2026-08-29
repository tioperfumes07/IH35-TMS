#!/usr/bin/env node
/**
 * ACCT-F81 — the OFFICE delivery path must capture delivery evidence, and must never invent it.
 *
 * OWNER RULING 2026-08-01: invoicing must NOT depend on the driver. Dispatch/accounting confirming a
 * delivery is an equally valid path, so evidence has to exist whichever path confirmed it.
 *
 * CLS-DISP-WIRE-07 (2026-08-04): the stamp SQL lives in
 * `stamp-final-delivery-departure.ts` and is called from transition + bulk + mdata. This guard
 * follows the call into the helper — it must not require the SQL to be inlined in loads.routes.ts
 * (that caused a false red the moment the stamp was correctly shared).
 *
 * FOUR INVARIANTS — each is a distinct way to get this wrong:
 *   1. The office transition STAMPS actual_departure_at on the delivered path (via helper call).
 *   2. It NEVER OVERWRITES an existing one (`actual_departure_at IS NULL`) — a driver's first-hand
 *      capture outranks a later office confirmation.
 *   3. It targets the FINAL ACTIVE delivery stop (last sequence_number, not cancelled, not
 *      soft-deleted) — on a multi-drop load an earlier drop must not complete the load.
 *   4. It NEVER sets actual_arrival_at. Nobody observed an arrival time; writing one to make the row
 *      look complete would fabricate an observation. This guard FAILS if that write ever appears.
 *
 * VERIFY-THE-VERIFIER: mutation-tested BOTH directions on REAL source; every mutation asserts it
 * actually applied.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DISPATCH = "apps/backend/src/dispatch/loads.routes.ts";
const HELPER = "apps/backend/src/dispatch/stamp-final-delivery-departure.ts";
const LABEL = "verify-office-delivery-stamps-stop-evidence";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Balanced-brace body of the block whose `{` is at or after `from`. */
function braceBlock(code, from) {
  const open = code.indexOf("{", from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return null;
}

export function deliveredBranches(src) {
  const code = stripComments(src);
  const out = [];
  // Legacy inline status pair.
  const reLegacy =
    /if\s*\(\s*targetStatus\s*===\s*"delivered_pending_docs"\s*\|\|\s*targetStatus\s*===\s*"completed_docs_received"\s*\)/g;
  // WIRE-07 shared predicate helper.
  const reHelper = /if\s*\(\s*loadStatusRequiresDeliveryDepartureStamp\s*\(\s*targetStatus\s*\)\s*\)/g;
  for (const re of [reLegacy, reHelper]) {
    let m;
    while ((m = re.exec(code)) !== null) {
      const body = braceBlock(code, m.index);
      if (body !== null) out.push(body);
    }
  }
  return out;
}

function auditStampSql(sqlSrc, label) {
  const problems = [];
  const code = stripComments(sqlSrc);

  if (!/UPDATE\s+mdata\.load_stops/i.test(code)) {
    problems.push(
      `${label}: stamp does not UPDATE mdata.load_stops — office delivery captures NO stop evidence.`,
    );
    return problems;
  }
  if (!/actual_departure_at\s*=/i.test(code)) {
    problems.push(
      `${label}: stamp touches mdata.load_stops but does not set actual_departure_at.`,
    );
    return problems;
  }
  if (!/actual_departure_at\s+IS\s+NULL/i.test(code)) {
    problems.push(
      `${label}: does not restrict the write to rows where actual_departure_at IS NULL. ` +
        `An office confirmation would overwrite a driver's first-hand capture.`,
    );
  }
  if (!/JOIN\s+mdata\.loads\s+l2\s+ON\s+l2\.id\s*=\s*s2\.load_id/i.test(code)) {
    problems.push(`${label}: stop write must scope through its canonical parent load.`);
  }
  if (!/l2\.operating_company_id\s*=\s*\$2::uuid/i.test(code)) {
    problems.push(`${label}: parent load selector is missing explicit operating-company scope.`);
  }
  for (const [re, why] of [
    [/ORDER BY\s+s2?\.?sequence_number\s+DESC/i, "must target the LAST delivery stop (ORDER BY sequence_number DESC)"],
    [/<>\s*'cancelled'/i, "must exclude cancelled stops"],
    [/soft_deleted_at\s+IS\s+NULL/i, "must exclude soft-deleted stops"],
    [/stop_type::text\s*=\s*'delivery'/i, "must select a DELIVERY stop"],
  ]) {
    if (!re.test(code)) {
      problems.push(`${label}: stop selection ${why} — otherwise it is not the FINAL ACTIVE delivery stop.`);
    }
  }
  if (/actual_arrival_at\s*=/i.test(code)) {
    problems.push(
      `${label}: WRITES actual_arrival_at. Nobody observed an arrival time on the office path — ` +
        `stamping one fabricates an observation.`,
    );
  }
  return problems;
}

/**
 * @param {string} routeSrc loads.routes.ts
 * @param {string} helperSrc stamp-final-delivery-departure.ts
 */
export function auditOfficeDelivery(routeSrc, helperSrc) {
  const problems = [];
  const branches = deliveredBranches(routeSrc);

  const inlineBranch = branches.find((b) => /UPDATE\s+mdata\.load_stops/i.test(b)) ?? null;
  const callBranch =
    branches.find((b) => /stampFinalActiveDeliveryDeparture\s*\(/.test(b)) ?? null;

  if (inlineBranch === null && callBranch === null) {
    problems.push(
      `${DISPATCH}: no delivered_pending_docs/completed_docs_received branch writes mdata.load_stops — the ` +
        `office transition captures NO delivery evidence. Office-confirmed loads then reach the billing ` +
        `status with every stop pending and actual_departure_at NULL, which is the ACCT-F81 defect.`,
    );
    return problems;
  }

  if (callBranch) {
    if (!/stamp-final-delivery-departure/.test(routeSrc)) {
      problems.push(
        `${DISPATCH}: calls stampFinalActiveDeliveryDeparture but does not import ${HELPER}.`,
      );
    }
    problems.push(...auditStampSql(helperSrc, HELPER));
    return problems;
  }

  // Legacy inline SQL path (pre-WIRE-07) — keep auditing the branch itself.
  problems.push(...auditStampSql(inlineBranch, DISPATCH));
  return problems;
}

function realRoute() {
  return readFileSync(join(ROOT, DISPATCH), "utf8");
}
function realHelper() {
  return readFileSync(join(ROOT, HELPER), "utf8");
}

function mutate(src, from, to, label) {
  const out = src.replace(from, to);
  if (out === src) {
    throw new Error(
      `mutation "${label}" did not apply — the selftest fixture no longer matches. ` +
        `The negative case is UNTESTED; fix the fixture rather than trusting this guard.`,
    );
  }
  return out;
}

function selftest() {
  const failures = [];
  const route = realRoute();
  const helper = realHelper();

  const clean = auditOfficeDelivery(route, helper);
  if (clean.length !== 0) failures.push(`case0 FAIL — real source flagged: ${clean.join(" | ")}`);

  const cases = [
    {
      label: "coupling removed entirely (the pre-fix shape)",
      run: () => {
        const mutated = mutate(
          route,
          /if \(loadStatusRequiresDeliveryDepartureStamp\(targetStatus\)\) \{[\s\S]*?\n      \}\n/,
          "",
          "remove coupling",
        );
        return auditOfficeDelivery(mutated, helper);
      },
      expect: "captures NO delivery evidence",
    },
    {
      label: "helper call removed but status branch kept",
      run: () => {
        const mutated = mutate(
          route,
          /await stampFinalActiveDeliveryDeparture\([^;]+;/,
          "/* stamp removed */",
          "remove stamp call",
        );
        return auditOfficeDelivery(mutated, helper);
      },
      expect: "captures NO delivery evidence",
    },
    {
      label: "overwrite protection removed",
      run: () => {
        const mutated = mutate(
          helper,
          /\n\s*AND s\.actual_departure_at IS NULL/,
          "",
          "remove IS NULL guard",
        );
        return auditOfficeDelivery(route, mutated);
      },
      expect: "does not restrict the write to rows where actual_departure_at IS",
    },
    {
      label: "final-active ordering removed (multi-drop earns early)",
      run: () => {
        const mutated = mutate(
          helper,
          "ORDER BY s2.sequence_number DESC",
          "ORDER BY s2.sequence_number ASC",
          "flip ordering",
        );
        return auditOfficeDelivery(route, mutated);
      },
      expect: "ORDER BY sequence_number DESC",
    },
    {
      label: "cancelled stops no longer excluded",
      run: () => {
        const mutated = mutate(
          helper,
          /\n\s*AND s2\.status::text <> 'cancelled'/,
          "",
          "drop cancelled filter",
        );
        return auditOfficeDelivery(route, mutated);
      },
      expect: "must exclude cancelled stops",
    },
    {
      label: "fabricates an arrival time",
      run: () => {
        const mutated = mutate(
          helper,
          "SET actual_departure_at = COALESCE($3::timestamptz, now()),",
          "SET actual_departure_at = COALESCE($3::timestamptz, now()),\n             actual_arrival_at = now(),",
          "fabricate arrival",
        );
        return auditOfficeDelivery(route, mutated);
      },
      expect: "WRITES actual_arrival_at",
    },
    {
      label: "company scope removed",
      run: () => auditOfficeDelivery(route, mutate(helper, /\n\s*AND l2\.operating_company_id = \$2::uuid/, "", "remove company scope")),
      expect: "missing explicit operating-company scope",
    },
  ];

  for (const c of cases) {
    let problems;
    try {
      problems = c.run();
    } catch (err) {
      failures.push(`FAIL — ${c.label}: ${err.message}`);
      continue;
    }
    if (!problems.some((p) => p.includes(c.expect))) {
      failures.push(
        `FAIL — ${c.label} was NOT caught (expected a problem containing "${c.expect}"; got: ${problems.join(" | ") || "no problems"})`,
      );
    }
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — real source clean; coupling-removed, call-removed, overwrite-protection-removed, ` +
      `ordering-flipped, cancelled-filter-dropped and fabricated-arrival all rejected. ` +
      `Every mutation verified to have applied.`,
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditOfficeDelivery(realRoute(), realHelper());
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — the office delivered path stamps the FINAL ACTIVE delivery stop's actual_departure_at ` +
      `(via ${HELPER}), never overwrites a driver capture, and never fabricates an arrival time.`,
  );
}

main();
