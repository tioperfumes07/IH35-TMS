export default {
  name: "verify:feature-flags-manager-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-feature-flags-manager-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-feature-flags-manager-uses-paritytable.mjs"]);
  },
};
