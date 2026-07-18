export default {
  name: "verify-push-gate-classification",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-push-gate-classification.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-push-gate-classification.mjs", "--selftest"]);
  },
};
