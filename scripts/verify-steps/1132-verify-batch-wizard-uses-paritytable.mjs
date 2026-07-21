export default {
  name: "verify:batch-wizard-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-batch-wizard-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-batch-wizard-uses-paritytable.mjs"]);
  },
};
