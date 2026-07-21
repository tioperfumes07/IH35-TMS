export default {
  name: "verify:customers-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-uses-paritytable.mjs"]);
  },
};
