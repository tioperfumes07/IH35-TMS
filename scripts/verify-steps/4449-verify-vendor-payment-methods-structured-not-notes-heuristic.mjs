export default {
  name: "verify:vendor-payment-methods-structured-not-notes-heuristic",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-payment-methods-structured-not-notes-heuristic.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-payment-methods-structured-not-notes-heuristic.mjs"]);
  },
};
