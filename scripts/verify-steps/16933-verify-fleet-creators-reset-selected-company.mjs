export default {
  name: "verify:fleet-creators-reset-selected-company",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-creators-reset-selected-company.mjs"]);
  },
};
