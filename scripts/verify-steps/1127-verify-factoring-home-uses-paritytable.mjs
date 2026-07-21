export default {
  name: "verify:factoring-home-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-home-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-home-uses-paritytable.mjs"]);
  },
};
