export default {
  name: "verify:bank-tx-capture-fields-persisted",
  run(ctx) {
    // Real guard is scripts/verify-bank-tx-capture-fields-persisted.mjs (0441-mod8-tx-fields-captured-
    // not-sent). Selftest first (planted regressions must fail), then the live repo scan.
    ctx.run("node", ["scripts/verify-bank-tx-capture-fields-persisted.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-tx-capture-fields-persisted.mjs"]);
  },
};
