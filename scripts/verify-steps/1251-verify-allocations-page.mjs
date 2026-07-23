export default {
  name: "verify-allocations-page",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-allocations-page.mjs"]) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-allocations-page.mjs", "--selftest"]);
  },
};
