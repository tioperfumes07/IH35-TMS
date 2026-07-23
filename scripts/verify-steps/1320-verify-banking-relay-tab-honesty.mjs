export default {
  name: "verify-banking-relay-tab-honesty",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-banking-relay-tab-honesty.mjs"]) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-banking-relay-tab-honesty.mjs", "--selftest"]);
  },
};
