export default {
  name: "verify:settlement-disputes-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-disputes-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-disputes-uses-paritytable.mjs"]);
  },
};
