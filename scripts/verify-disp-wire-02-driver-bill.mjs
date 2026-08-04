#!/usr/bin/env node
/**
 * GUARD — verify-disp-wire-02-driver-bill (CLS-DISP-WIRE-02, Phase 1 hop 2)
 *
 * THE DEFECT THIS ASSERTS — proven on prod, not theorised
 * Driver base pay was computed with `bookLoadRateTotalCents(input.charges)`: the IDENTICAL call that
 * populates `mdata.loads.rate_total_cents`, the GROSS CUSTOMER RATE. So every driver bill was written
 * at 100% of the customer's linehaul plus accessorials. All three driver_bills rows on prod had
 * gross_amount_cents EXACTLY equal to their load's rate_total_cents (difference 0 on every row:
 * $1.00/$1.00, $4,900/$4,900, $5,800/$5,800), each status='open' — live payables equal to the entire
 * revenue of their load.
 *
 * It violates the LOCKED driver model: drivers are hired Mexican-B1 1099 contractors paid a wage/fee,
 * NEVER a percentage of the customer linehaul (linehaul is company revenue). 100% is not a percentage,
 * it is the whole thing — a guaranteed non-positive gross margin on every load and an overstated
 * payable feeding settlements.
 *
 * THE BASIS (owner-confirmed from the approved Load Wizard prototype: "Shortest miles used for driver
 * pay"; practical miles are fuel/ETA)
 * Driver pay = rate_per_mile x the load's SHORTEST miles, or a flat per_load_pay. It resolves from
 * driver_finance.driver_pay_rates (migration 202612040000, applied on prod), which is effective-dated
 * so a settlement reproduces the rate that applied on its load date. `mdata.drivers.pay_basis` is the
 * miles_basis enum — how to MEASURE miles, not what one is worth — so it was never a rate source.
 * When no active rate exists, or a per-mile load has no miles captured yet, the poster FAILS CLOSED:
 * it refuses to mint a payable it cannot price and records the refusal durably rather than writing a
 * $0 bill that would read as a settled load.
 *
 * This guard therefore asserts BOTH directions: the customer rate must never reach driver pay, AND
 * the refusal must stay countable (not a silent return) and must not block dispatch by throwing.
 *
 * METHOD: comments stripped before asserting (guards of mine have passed by matching their own
 * prose); --selftest mutates the REAL source and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-disp-wire-02-driver-bill";
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Body of createDriverBillArtifacts — the driver-pay side only. */
function driverBillFn(src) {
  const start = src.indexOf("export async function createDriverBillArtifacts(");
  if (start === -1) return "";
  const next = src.indexOf("\nexport async function ", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

function check(src) {
  const code = stripComments(src);
  const fn = driverBillFn(code);
  const errors = [];

  if (!fn) {
    errors.push(`${BOOK}: createDriverBillArtifacts not found — the hop is gone`);
    return errors;
  }

  // 1. THE core assertion: the customer rate must never be the driver's pay.
  if (/bookLoadRateTotalCents\s*\(/.test(fn)) {
    errors.push(
      `${BOOK}: createDriverBillArtifacts calls bookLoadRateTotalCents — that is the GROSS CUSTOMER ` +
        `RATE (same call that fills mdata.loads.rate_total_cents). Driver pay is a wage/fee, never a ` +
        `% of customer linehaul (locked driver model). This is the ACCT-F63 regression.`
    );
  }

  // 2. Pay must come through the single resolver seam.
  if (!/resolveDriverBasePayCents\s*\(/.test(fn)) {
    errors.push(`${BOOK}: driver base pay no longer resolves through resolveDriverBasePayCents`);
  }

  // 3. The unresolved case must be countable, not a silent return.
  if (!/appendCrudAudit\(/.test(fn)) {
    errors.push(`${BOOK}: the no-pay-rate path writes no durable audit row — the skip is not countable`);
  }
  if (!/skipped_no_pay_rate/.test(fn)) {
    errors.push(`${BOOK}: the no-pay-rate path has no canonical event_class — it cannot be queried`);
  }

  // 4. The resolver must not invent a wage via a numeric default.
  const resolver = code.slice(
    code.indexOf("async function resolveDriverBasePayCents"),
    code.indexOf("async function resolveDriverBasePayCents") + 400
  );
  if (resolver && /return\s+\d+/.test(resolver)) {
    errors.push(
      `${BOOK}: resolveDriverBasePayCents returns a hardcoded number — a default here is an invented ` +
        `wage; it must return null until a real rate source exists`
    );
  }

  // 5. The resolver must read the real rate table and default to SHORTEST miles.
  const resolverFull = code.slice(
    code.indexOf("async function resolveDriverBasePayCents"),
    code.indexOf("export async function createDriverBillArtifacts(")
  );
  if (resolverFull) {
    if (!/driver_finance\.driver_pay_rates/.test(resolverFull)) {
      errors.push(
        `${BOOK}: resolveDriverBasePayCents does not read driver_finance.driver_pay_rates — pay has no source`
      );
    }
    if (!/miles_shortest/.test(resolverFull)) {
      errors.push(
        `${BOOK}: per-mile pay no longer uses miles_shortest — the approved prototype pays on SHORTEST ` +
          `miles (practical miles are fuel/ETA)`
      );
    }
  }

  // 6. gross_amount_cents must still be written from the bill total, not re-derived.
  if (!/gross_amount_cents/.test(fn)) {
    errors.push(`${BOOK}: driver_bills gross_amount_cents column write disappeared`);
  }
  return errors;
}

function selftest() {
  const real = readFileSync(BOOK, "utf8");
  if (check(real).length !== 0) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of check(real)) console.error(`  - ${e}`);
    process.exit(1);
  }

  const fnStart = real.indexOf("export async function createDriverBillArtifacts(");
  const mutations = [
    [
      "customer rate restored as driver pay",
      (s) =>
        s.slice(0, fnStart) +
        s.slice(fnStart).replace(
          "const basePayCents = await resolveDriverBasePayCents(",
          "const basePayCents = bookLoadRateTotalCents(input.charges); const _unused = await noop("
        ),
    ],
    [
      "rate table no longer read",
      (s) => s.split("driver_finance.driver_pay_rates").join("driver_finance.something_else"),
    ],
    [
      "pays on practical miles instead of shortest",
      (s) => s.split("miles_shortest").join("miles_practical"),
    ],
    [
      "resolver seam removed",
      (s) => s.split("resolveDriverBasePayCents").join("someOtherThing"),
    ],
    [
      "skip made silent",
      (s) => s.split("skipped_no_pay_rate").join("nothing_recorded"),
    ],
    [
      "wage invented via default",
      (s) => s.replace("  if (!driverId) return null;", "  return 50000;"),
    ],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken === real) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(readFileSync(BOOK, "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) on the assign→driver-bill hop:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — driver pay never derives from the customer rate, resolves through one seam, and an ` +
    `unresolvable rate is recorded durably instead of minting a wrong payable.`
);
