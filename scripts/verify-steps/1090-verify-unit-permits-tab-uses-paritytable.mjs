export default {
  name: "verify:unit-permits-tab-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-permits-tab-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-unit-permits-tab-uses-paritytable.mjs"]);
  },
};
