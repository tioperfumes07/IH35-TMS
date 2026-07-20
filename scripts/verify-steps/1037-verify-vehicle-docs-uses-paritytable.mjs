export default {
  name: "verify:vehicle-docs-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-docs-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vehicle-docs-uses-paritytable.mjs"]);
  },
};
