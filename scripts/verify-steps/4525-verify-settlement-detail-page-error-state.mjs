export default {
  name: "verify:settlement-detail-page-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-detail-page-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-detail-page-error-state.mjs"]);
  },
};
