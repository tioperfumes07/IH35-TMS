export default {
  name: "verify:ifta-step-tax-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-step-tax-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ifta-step-tax-uses-paritytable.mjs"]);
  },
};
