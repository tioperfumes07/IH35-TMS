export default {
  name: "verify:cash-gl-setup-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-gl-setup-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-gl-setup-page-uses-paritytable.mjs"]);
  },
};
