export default {
  name: "verify:allocations-page",
  run(ctx) {
    ctx.run("node", ["scripts/verify-allocations-page.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-allocations-page.mjs"]);
  },
};
