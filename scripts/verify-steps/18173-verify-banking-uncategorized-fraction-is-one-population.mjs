export default {
  name: "verify:banking-uncategorized-fraction-is-one-population",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-uncategorized-fraction-is-one-population.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-uncategorized-fraction-is-one-population.mjs"]);
  },
};
