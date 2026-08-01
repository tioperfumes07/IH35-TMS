#!/usr/bin/env node
/**
 * ACCT-F81 — the OFFICE delivery path must capture delivery evidence, and must never invent it.
 *
 * OWNER RULING 2026-08-01: invoicing must NOT depend on the driver. Dispatch/accounting confirming a
 * delivery is an equally valid path, so evidence has to exist whichever path confirmed it.
 *
 * WHY (verified on prod br-fancy-credit-akjnd07a, 2026-08-01):
 * `PATCH /api/v1/dispatch/loads/:id/transition` validated ONLY the status graph and never touched
 * mdata.load_stops. An office user could reach delivered_pending_docs — which fires the proforma →
 * draft invoice conversion, unblocking send / A/R / factoring — with every stop still `pending` and
 * actual_departure_at NULL. Live evidence: 20 stop rows, 0 with actual_arrival_at, 0 with
 * actual_departure_at, and one LIVE load at completed_docs_received (terminal billing status) with
 * both stops pending. The recognition gate reads exactly that timestamp, so office-confirmed loads
 * could bill while remaining structurally unrecognizable.
 *
 * FOUR INVARIANTS — each is a distinct way to get this wrong:
 *   1. The office transition STAMPS actual_departure_at on the delivered path.
 *   2. It NEVER OVERWRITES an existing one (`actual_departure_at IS NULL`) — a driver's first-hand
 *      capture outranks a later office confirmation.
 *   3. It targets the FINAL ACTIVE delivery stop (last sequence_number, not cancelled, not
 *      soft-deleted) — on a multi-drop load an earlier drop must not complete the load.
 *   4. It NEVER sets actual_arrival_at. Nobody observed an arrival time; writing one to make the row
 *      look complete would fabricate an observation. This guard FAILS if that write ever appears.
 *
 * VERIFY-THE-VERIFIER: assertions are made against the transition handler's own statement, not the
 * whole file (which legitimately reads load_stops elsewhere — a file-level grep would pass on a
 * completely unchanged handler). Mutation-tested BOTH directions on REAL source; every mutation
 * asserts it actually applied.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DISPATCH = "apps/backend/src/dispatch/loads.routes.ts";
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

/**
 * EVERY delivered-status branch in the transition handler, extracted by balanced braces.
 *
 * There is deliberately more than one: an unrelated pre-existing block tests the SAME pair of statuses
 * further down. An earlier revision of this guard took the FIRST match and a "read until the next
 * ND-INV-01 comment" boundary — its own selftest caught that, because deleting the coupling made the
 * extractor silently land on the OTHER block. Scanning all branches and selecting the one that writes
 * the stop makes the guard independent of block order and of any nearby comment text.
 */
export function deliveredBranches(src) {
  const code = stripComments(src);
  const re = /if\s*\(\s*targetStatus\s*===\s*"delivered_pending_docs"\s*\|\|\s*targetStatus\s*===\s*"completed_docs_received"\s*\)/g;
  const out = [];
  let m;
  while ((m = re.exec(code)) !== null) {
    const body = braceBlock(code, m.index);
    if (body !== null) out.push(body);
  }
  return out;
}

export function auditOfficeDelivery(src) {
  const problems = [];
  const branches = deliveredBranches(src);
  // The capturing branch is the one that writes the stop. If NO branch does, the coupling is absent —
  // which is the pre-fix defect, regardless of how many status branches happen to exist.
  const branch = branches.find((b) => /UPDATE\s+mdata\.load_stops/i.test(b)) ?? null;
  if (branch === null) {
    problems.push(
      `${DISPATCH}: no delivered_pending_docs/completed_docs_received branch writes mdata.load_stops — the ` +
        `office transition captures NO delivery evidence. Office-confirmed loads then reach the billing ` +
        `status with every stop pending and actual_departure_at NULL, which is the ACCT-F81 defect.`
    );
    return problems;
  }

  if (!/actual_departure_at\s*=/i.test(branch)) {
    problems.push(
      `${DISPATCH}: the delivered branch touches mdata.load_stops but does not set actual_departure_at. The ` +
        `office path must capture the same evidence the driver path does — invoicing must not depend on the driver.`
    );
    return problems;
  }

  if (!/actual_departure_at\s+IS\s+NULL/i.test(branch)) {
    problems.push(
      `${DISPATCH}: the delivered branch does not restrict the write to rows where actual_departure_at IS ` +
        `NULL. An office confirmation would overwrite a driver's first-hand capture with a later, weaker ` +
        `timestamp. Never overwrite captured evidence.`
    );
  }

  for (const [re, why] of [
    [/ORDER BY\s+s2?\.?sequence_number\s+DESC/i, "must target the LAST delivery stop (ORDER BY sequence_number DESC)"],
    [/<>\s*'cancelled'/i, "must exclude cancelled stops"],
    [/soft_deleted_at\s+IS\s+NULL/i, "must exclude soft-deleted stops"],
    [/stop_type::text\s*=\s*'delivery'/i, "must select a DELIVERY stop"],
  ]) {
    if (!re.test(branch)) {
      problems.push(`${DISPATCH}: the delivered branch's stop selection ${why} — otherwise it is not the FINAL ACTIVE delivery stop.`);
    }
  }

  // Invariant 4 — the no-fabrication rule. An arrival time was never observed by anyone on this path.
  if (/actual_arrival_at\s*=/i.test(branch)) {
    problems.push(
      `${DISPATCH}: the delivered branch WRITES actual_arrival_at. Nobody observed an arrival time on the ` +
        `office path — stamping one to make the stop row look complete fabricates an observation, on exactly ` +
        `the record an auditor tests first. Capture departure (what the office attests to) and leave arrival NULL.`
    );
  }

  return problems;
}

function realSource() {
  return readFileSync(join(ROOT, DISPATCH), "utf8");
}

function mutate(src, from, to, label) {
  const out = src.replace(from, to);
  if (out === src) {
    throw new Error(
      `mutation "${label}" did not apply — the selftest fixture no longer matches ${DISPATCH}. ` +
        `The negative case is UNTESTED; fix the fixture rather than trusting this guard.`
    );
  }
  return out;
}

function selftest() {
  const failures = [];
  const real = realSource();

  const clean = auditOfficeDelivery(real);
  if (clean.length !== 0) failures.push(`case0 FAIL — real source flagged: ${clean.join(" | ")}`);

  const cases = [
    {
      label: "coupling removed entirely (the pre-fix shape)",
      mutated: () =>
        mutate(
          real,
          /if \(targetStatus === "delivered_pending_docs" \|\| targetStatus === "completed_docs_received"\) \{[\s\S]*?\n      \}\n/,
          "",
          "remove coupling"
        ),
      expect: "captures NO delivery evidence",
    },
    {
      label: "overwrite protection removed",
      mutated: () => mutate(real, /\n\s*AND s\.actual_departure_at IS NULL/, "", "remove IS NULL guard"),
      expect: "does not restrict the write to rows where actual_departure_at IS",
    },
    {
      label: "final-active ordering removed (multi-drop earns early)",
      mutated: () => mutate(real, "ORDER BY s2.sequence_number DESC", "ORDER BY s2.sequence_number ASC", "flip ordering"),
      expect: "ORDER BY sequence_number DESC",
    },
    {
      label: "cancelled stops no longer excluded",
      mutated: () => mutate(real, /\n\s*AND s2\.status::text <> 'cancelled'/, "", "drop cancelled filter"),
      expect: "must exclude cancelled stops",
    },
    {
      label: "fabricates an arrival time",
      mutated: () =>
        mutate(
          real,
          "SET actual_departure_at = COALESCE($2::timestamptz, now()),",
          "SET actual_departure_at = COALESCE($2::timestamptz, now()),\n                   actual_arrival_at = now(),",
          "fabricate arrival"
        ),
      expect: "WRITES actual_arrival_at",
    },
  ];

  for (const c of cases) {
    let problems;
    try {
      problems = auditOfficeDelivery(c.mutated());
    } catch (err) {
      failures.push(`FAIL — ${c.label}: ${err.message}`);
      continue;
    }
    if (!problems.some((p) => p.includes(c.expect))) {
      failures.push(
        `FAIL — ${c.label} was NOT caught (expected a problem containing "${c.expect}"; got: ${problems.join(" | ") || "no problems"})`
      );
    }
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — real source clean; coupling-removed, overwrite-protection-removed, ` +
      `ordering-flipped, cancelled-filter-dropped and fabricated-arrival all rejected. ` +
      `Every mutation verified to have applied.`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditOfficeDelivery(realSource());
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — the office delivered path stamps the FINAL ACTIVE delivery stop's actual_departure_at, ` +
      `never overwrites a driver capture, and never fabricates an arrival time.`
  );
}

main();
