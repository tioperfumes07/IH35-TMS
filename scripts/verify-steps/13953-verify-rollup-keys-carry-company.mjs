export default {
  name: "verify:rollup-keys-carry-company",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rollup-keys-carry-company.mjs"]);
  },
};
