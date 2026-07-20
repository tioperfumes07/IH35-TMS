export default {
  name: "verify:vehicle-plates-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-plates-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vehicle-plates-uses-paritytable.mjs"]);
  },
};
