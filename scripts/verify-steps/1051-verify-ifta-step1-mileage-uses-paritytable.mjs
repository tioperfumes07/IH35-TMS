export default {
  name: "verify:ifta-step1-mileage-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-step1-mileage-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ifta-step1-mileage-uses-paritytable.mjs"]);
  },
};
