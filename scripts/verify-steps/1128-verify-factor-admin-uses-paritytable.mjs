export default {
  name: "verify:factor-admin-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factor-admin-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factor-admin-uses-paritytable.mjs"]);
  },
};
