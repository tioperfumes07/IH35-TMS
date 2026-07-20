export default {
  name: "verify:ifta-step-gallons-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-step-gallons-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ifta-step-gallons-uses-paritytable.mjs"]);
  },
};
