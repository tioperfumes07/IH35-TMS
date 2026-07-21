export default {
  name: "verify:cash-advance-requests-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-advance-requests-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-advance-requests-uses-paritytable.mjs"]);
  },
};
