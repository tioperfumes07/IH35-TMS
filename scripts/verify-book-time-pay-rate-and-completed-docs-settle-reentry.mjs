#!/usr/bin/env node
/**
 * ACCT-F10159 (DEFECT A) + ACCT-F10160 (DEFECT B) — static-shape guard.
 *
 * DEFECT A: bookLoad's own driver-bill mint call (book-load.service.ts) prices from the
 * in-memory `load` object bound at INSERT time, BEFORE writeC9HoldFieldsIfPresent's later UPDATE
 * persists driver_pay_rate_per_mile to the DB row. Without patching the in-memory object, every
 * load priced solely by a per-load override (no driver-level rate card) mints a false
 * `skipped_no_pay_rate` at book time even though the DB row is correctly priced one statement
 * later — live-caught + root-caused 2026-08-31 on L-20260831-0002 (skip audit event
 * 91e71366-57fa-42b9-9b77-8eefc877fc77, fired at book time, same txn as load_created).
 *
 * DEFECT B: pingSettlementOnLoadEvent (settlements-load-bookended.service.ts) opens a settlement
 * on `in_transit` and closes it on `delivered_pending_docs` — but the driver-bill mint gate
 * (loadStatusRequiresDeliveryDepartureStamp) fires on BOTH `delivered_pending_docs` AND
 * `completed_docs_received`. A bill minted at the later, wider gate's trigger had nowhere to
 * attach: the settlement-close window is one-shot and the manual repair route is hard-blocked
 * once trip_closed_at is stamped. Live-caught on L-20260831-0002/0004 (GO-IDLE-WAKE DEFECT B).
 *
 * This guard asserts: (A) the C9-hold UPDATE call in bookLoad is immediately followed by an
 * in-memory patch of load.driver_pay_rate_per_mile from input; (B) pingSettlementOnLoadEvent has
 * a completed_docs_received branch that re-attempts appendSettlementLineFromDriverBillIfMissing
 * against a settlement THIS load already closed (last_load_id match, so it can never attach to
 * an unrelated trip).
 */
import { readFileSync } from "node:fs";

const FILES = {
  bookLoad: "apps/backend/src/dispatch/book-load.service.ts",
  settle: "apps/backend/src/driver-finance/settlements-load-bookended.service.ts",
};

function analyze(src) {
  const failures = [];

  // ---- DEFECT A ----
  const c9Idx = src.bookLoad.indexOf("await writeC9HoldFieldsIfPresent(client, String(load.id)");
  if (c9Idx < 0) {
    failures.push(`${FILES.bookLoad}: writeC9HoldFieldsIfPresent call site not found in its expected shape`);
  } else {
    const afterC9 = src.bookLoad.slice(c9Idx, c9Idx + 2200);
    if (!/load\.driver_pay_rate_per_mile\s*=\s*input\.driver_pay_rate_per_mile\s*\?\?\s*null/.test(afterC9)) {
      failures.push(
        `${FILES.bookLoad}: writeC9HoldFieldsIfPresent's UPDATE is not followed by an in-memory ` +
          "load.driver_pay_rate_per_mile patch — the book-time driver-bill mint will price from a " +
          "stale pre-UPDATE load object again (DEFECT A regression)"
      );
    }
  }

  const mintStart = src.bookLoad.indexOf("async function resolveDriverBasePayCents");
  if (mintStart < 0) {
    failures.push(`${FILES.bookLoad}: resolveDriverBasePayCents not found`);
  } else if (c9Idx >= 0 && mintStart < c9Idx) {
    // sanity: the pricer function itself must still read load.driver_pay_rate_per_mile
  }
  if (!/load\.driver_pay_rate_per_mile\s*\?\?\s*Number\.NaN/.test(src.bookLoad)) {
    failures.push(`${FILES.bookLoad}: resolveDriverBasePayCents no longer reads load.driver_pay_rate_per_mile first`);
  }

  // ---- DEFECT B ----
  const pingStart = src.settle.indexOf("export async function pingSettlementOnLoadEvent");
  if (pingStart < 0) {
    failures.push(`${FILES.settle}: pingSettlementOnLoadEvent not found`);
    return failures;
  }
  const pingBody = src.settle.slice(pingStart);

  if (!/normalizedStatus === "completed_docs_received"/.test(pingBody)) {
    failures.push(
      `${FILES.settle}: pingSettlementOnLoadEvent has no completed_docs_received branch — a bill ` +
        "minted at that transition (the wider of the two mint-gate triggers) has nowhere to attach " +
        "once the delivered_pending_docs close window has passed (DEFECT B regression)"
    );
  }
  if (!/last_load_id\s*=\s*\$3::uuid/.test(pingBody)) {
    failures.push(
      `${FILES.settle}: the completed_docs_received re-entry does not scope its settlement lookup ` +
        "to last_load_id = this load — without that scope it risks attaching a line to an unrelated " +
        "trip's settlement"
    );
  }
  if (!/status IN \('open', 'closed'\)/.test(pingBody)) {
    failures.push(
      `${FILES.settle}: the completed_docs_received re-entry must accept status IN ('open','closed') — ` +
        "requiring closed-only made the #18830 branch a no-op at transition time (L-0017)"
    );
  }
  const reentryAppendCount = (pingBody.match(/await appendSettlementLineFromDriverBillIfMissing\(client, \{/g) || []).length;
  if (reentryAppendCount < 1) {
    failures.push(
      `${FILES.settle}: expected the completed_docs_received branch to call ` +
        `appendSettlementLineFromDriverBillIfMissing at least once, found ${reentryAppendCount} within pingSettlementOnLoadEvent`
    );
  }

  // DEFECT B′ — Close-trip stamp must append earnings (Devin-A / CC-2 Live Click L-0017)
  const stampStart = src.settle.indexOf("export async function stampTripClosedForBookendedSettlement");
  if (stampStart < 0) {
    failures.push(`${FILES.settle}: stampTripClosedForBookendedSettlement not found`);
  } else {
    const stampBody = src.settle.slice(stampStart, pingStart > stampStart ? pingStart : stampStart + 9000);
    if (!/appendSettlementLineFromDriverBillIfMissing/.test(stampBody)) {
      failures.push(
        `${FILES.settle}: stampTripClosedForBookendedSettlement does not call ` +
          "appendSettlementLineFromDriverBillIfMissing — Close trip closes $0 with open driver bills (DEFECT B′)"
      );
    }
    if (!/aggregateSettlementTotals/.test(stampBody)) {
      failures.push(
        `${FILES.settle}: stampTripClosedForBookendedSettlement must roll up via aggregateSettlementTotals after append`
      );
    }
    if (!/already_closed/.test(stampBody) || !/appendEarningsForAnchor|appendSettlementLineFromDriverBillIfMissing/.test(stampBody)) {
      failures.push(
        `${FILES.settle}: already_closed Close-trip path must still attempt append (heal empty closed settlements)`
      );
    }
  }

  return failures;
}

function readAll() {
  return {
    bookLoad: readFileSync(FILES.bookLoad, "utf8"),
    settle: readFileSync(FILES.settle, "utf8"),
  };
}

function selftest() {
  const src = readAll();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-book-time-pay-rate-and-completed-docs-settle-reentry --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "DEFECT A: in-memory load patch removed after writeC9HoldFieldsIfPresent",
      apply: (s) => ({
        ...s,
        bookLoad: s.bookLoad.replace(
          "load.driver_pay_rate_per_mile = input.driver_pay_rate_per_mile ?? null;\n",
          ""
        ),
      }),
    },
    {
      name: "DEFECT A: resolveDriverBasePayCents stops reading load.driver_pay_rate_per_mile",
      apply: (s) => ({
        ...s,
        bookLoad: s.bookLoad.replace(
          "load.driver_pay_rate_per_mile ?? Number.NaN",
          "Number.NaN"
        ),
      }),
    },
    {
      name: "DEFECT B: completed_docs_received branch condition disabled",
      apply: (s) => ({
        ...s,
        settle: s.settle.replace(
          'if (normalizedStatus === "completed_docs_received") {',
          "if (false) {"
        ),
      }),
    },
    {
      name: "DEFECT B: last_load_id scope removed (would risk cross-trip attach)",
      apply: (s) => ({
        ...s,
        settle: s.settle.replace("AND last_load_id = $3::uuid\n", ""),
      }),
    },
    {
      name: "DEFECT B′: Close-trip stamp drops appendSettlementLineFromDriverBillIfMissing",
      apply: (s) => ({
        ...s,
        settle: s.settle.replace(
          /const appendEarningsForAnchor = async \(\) => \{[\s\S]*?\};\n\n/,
          "const appendEarningsForAnchor = async () => {};\n\n"
        ),
      }),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(src);
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-book-time-pay-rate-and-completed-docs-settle-reentry --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = readAll();
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-book-time-pay-rate-and-completed-docs-settle-reentry: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-book-time-pay-rate-and-completed-docs-settle-reentry: OK -- bookLoad refreshes driver_pay_rate_per_mile " +
      "before minting (DEFECT A), and pingSettlementOnLoadEvent re-attempts a scoped settlement-line append on " +
      "completed_docs_received (DEFECT B)"
  );
}
