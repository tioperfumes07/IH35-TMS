export default {
  name: "verify:no-flaky-endpoints-on-page-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-flaky-endpoints-on-page-load.mjs"]);
  },
};
