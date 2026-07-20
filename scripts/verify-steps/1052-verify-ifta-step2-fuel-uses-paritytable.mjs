export default {
  name: "verify:ifta-step2-fuel-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-step2-fuel-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ifta-step2-fuel-uses-paritytable.mjs"]);
  },
};
