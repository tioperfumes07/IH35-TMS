#!/usr/bin/env node
/**
 * DWELL-01-D3-DETENTION-DRIVER-PAY-SETTLEMENT-LINE — static-shape guard for the driver-side
 * detention-pay poster. Asserts the properties D-3's own packet requires as load-bearing, not just
 * "a settlement_lines row gets inserted":
 *   1. Evidence required ("No event, no line. No exceptions.") — refuses when no
 *      dispatch.detention_evidence row exists for the event.
 *   2. Idempotent — a second post for the same event is refused (already_posted), never a duplicate
 *      settlement_lines row.
 *   3. Customer/driver amounts kept separate — the amount is computed from
 *      mdata.loads.detention_driver_pay_per_hour_cents (the driver's own rate), never from
 *      dispatch.detention_events.accrued_amount_cents (the customer-billing amount).
 *   4. No invented settlement — uses the shared getActiveSettlementForDriver() and fails loud
 *      (no_active_settlement) rather than opening/guessing one.
 *   5. Route authorization gate present (Owner/Administrator/Accountant).
 *   6. Full audit trail — "detention_pay.posted" event tag present.
 */
import { readFileSync } from "node:fs";

const servicePath = "apps/backend/src/driver-finance/detention-pay-posting.service.ts";
const routesPath = "apps/backend/src/driver-finance/detention-pay-posting.routes.ts";
const serviceSrc = readFileSync(servicePath, "utf8");
const routesSrc = readFileSync(routesPath, "utf8");

function analyze(service, routes) {
  const failures = [];

  if (!/dispatch\.detention_evidence[\s\S]{0,300}return \{ kind: "no_evidence" \}/.test(service)) {
    failures.push(`${servicePath}: evidence check missing — a detention_event with no evidence must refuse posting (no_evidence), reachably, not just declared in the result type`);
  }

  if (
    !/source_table = 'dispatch\.detention_events'[\s\S]{0,300}is_active = true[\s\S]{0,300}return \{ kind: "already_posted"/.test(service)
  ) {
    failures.push(`${servicePath}: idempotency check missing — a second post for the same event must reachably return already_posted, not a duplicate line`);
  }

  if (!/detention_driver_pay_per_hour_cents/.test(service)) {
    failures.push(`${servicePath}: does not read mdata.loads.detention_driver_pay_per_hour_cents — driver pay must use the driver's own rate`);
  }
  if (/SELECT accrued_amount_cents/.test(service)) {
    failures.push(`${servicePath}: reads detention_events.accrued_amount_cents (the CUSTOMER-billing amount) — D-3 forbids deriving driver pay from the customer amount`);
  }

  if (!/getActiveSettlementForDriver[\s\S]{0,200}return \{ kind: "no_active_settlement" \}/.test(service)) {
    failures.push(`${servicePath}: does not use getActiveSettlementForDriver / does not reachably fail loud with no_active_settlement when the driver has no open settlement`);
  }

  if (!/AUTHORITY_ROLES\.has\(String\(user\.role/.test(routes)) {
    failures.push(`${routesPath}: authorization gate missing — route must check AUTHORITY_ROLES before posting money`);
  }

  if (!/"detention_pay\.posted"/.test(service)) {
    failures.push(`${servicePath}: audit event tag "detention_pay.posted" missing`);
  }

  return failures;
}

function selftest() {
  const good = analyze(serviceSrc, routesSrc);
  if (good.length > 0) {
    console.error("verify-detention-pay-posting-scoped --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "evidence gate removed",
      target: "service",
      apply: () => serviceSrc.replace(`if ((evidenceRes.rows[0] ?? null) === null) return { kind: "no_evidence" };`, `// evidence check removed`),
    },
    {
      name: "idempotency check removed",
      target: "service",
      apply: () =>
        serviceSrc.replace(`if (existing) return { kind: "already_posted", settlementLineId: existing.id };`, `// idempotency check removed`),
    },
    {
      name: "driver rate swapped for customer accrued_amount_cents",
      target: "service",
      apply: () => serviceSrc.replace(/detention_driver_pay_per_hour_cents/g, "accrued_amount_cents"),
    },
    {
      name: "no_active_settlement fail-loud removed (invents a settlement instead)",
      target: "service",
      apply: () => serviceSrc.replace(`if (!settlement) return { kind: "no_active_settlement" };`, `if (!settlement) { /* invented */ }`),
    },
    {
      name: "route authorization gate removed",
      target: "routes",
      apply: () =>
        routesSrc.replace(`if (!AUTHORITY_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });`, ``),
    },
    {
      name: "audit tag removed",
      target: "service",
      apply: () => serviceSrc.replace(`"detention_pay.posted"`, `"detention_pay_posted_untagged"`),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply();
    const original = m.target === "service" ? serviceSrc : routesSrc;
    if (mutated === original) {
      console.error(`verify-detention-pay-posting-scoped --selftest: mutation setup failed (anchor not found) — ${m.name}`);
      process.exit(1);
    }
    const failures = m.target === "service" ? analyze(mutated, routesSrc) : analyze(serviceSrc, mutated);
    if (failures.length === 0) {
      console.error(`verify-detention-pay-posting-scoped --selftest: NOT CAUGHT — ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught and repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze(serviceSrc, routesSrc);
  if (failures.length > 0) {
    console.error("verify-detention-pay-posting-scoped: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-detention-pay-posting-scoped: OK — evidence gate, idempotency, driver-own-rate amount, fail-loud settlement lookup, authorization, and audit trail all present");
}
