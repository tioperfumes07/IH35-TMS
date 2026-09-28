export default {
  name: "verify:faro-advance-po-matches-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-advance-po-matches-load.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-faro-advance-po-matches-load.mjs"]);
  },
};
