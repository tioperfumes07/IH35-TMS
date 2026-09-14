export default {
  name: "verify:book-load-single-submit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-single-submit.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-load-single-submit.mjs"]);
    ctx.run("node", ["scripts/verify-live-load-id-reservation-lifecycle.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-live-load-id-reservation-lifecycle.mjs"]);
    // P0 2026-09-14 (LOAD-NUMBER-COUNTER-BURN-ON-OPEN, item 4) — static regression proof always
    // runs here; the live comparison against lib.trace_counters degrades safely to a skip when no
    // DATABASE_URL is set (matching verify-balanced-ledger.mjs), so it never blocks CI without DB
    // access but is the real gate whenever CI/cron does have one.
    ctx.run("node", ["scripts/verify-load-counter-not-ahead-of-reality.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-counter-not-ahead-of-reality.mjs"]);
    ctx.run("node", ["scripts/verify-dispatch-subnav-badge-failure-honesty.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-subnav-badge-failure-honesty.mjs"]);
  },
};
