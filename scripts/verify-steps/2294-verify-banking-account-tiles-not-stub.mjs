export default {
  name: "verify-banking-account-tiles-not-stub",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-banking-account-tiles-not-stub.mjs"]);
  },
};
