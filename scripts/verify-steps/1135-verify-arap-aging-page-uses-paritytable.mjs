export default {
  name: "verify:arap-aging-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-arap-aging-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-arap-aging-page-uses-paritytable.mjs"]);
  },
};
