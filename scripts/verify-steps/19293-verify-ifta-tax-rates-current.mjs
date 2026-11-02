export default {
  name: "verify:ifta-tax-rates-current",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-tax-rates-current.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ifta-tax-rates-current.mjs"]);
  },
};
