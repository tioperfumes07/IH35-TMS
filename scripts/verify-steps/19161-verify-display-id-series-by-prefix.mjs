export default {
  name: "verify:display-id-series-by-prefix",
  run(ctx) {
    ctx.run("node", ["scripts/verify-display-id-series-by-prefix.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-display-id-series-by-prefix.mjs"]);
  },
};
