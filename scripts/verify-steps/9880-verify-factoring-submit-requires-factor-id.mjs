// verify-steps wrapper for scripts/verify-factoring-submit-requires-factor-id.mjs —
// BANK-F9513-FACTORING-SUBMIT-NULL-FACTOR: submitBatch() must reject the draft->submitted
// transition when factor_id is NULL. Static, no DB.
export default {
  name: "verify-factoring-submit-requires-factor-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-submit-requires-factor-id.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-submit-requires-factor-id.mjs"]);
  },
};
