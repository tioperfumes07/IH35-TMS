export default {
  name: "verify:relay-fill-one-company",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-fill-one-company.mjs"]);
  },
};
