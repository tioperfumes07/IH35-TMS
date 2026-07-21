export default {
  name: "verify-company-membership-assert",
  run(ctx) {
    const result = ctx.runAllowFailure("node", ["scripts/verify-company-membership-assert.mjs"]);
    if (result !== 0) return result;
    return ctx.runAllowFailure("node", ["scripts/verify-company-membership-assert.mjs", "--selftest"]);
  },
};
