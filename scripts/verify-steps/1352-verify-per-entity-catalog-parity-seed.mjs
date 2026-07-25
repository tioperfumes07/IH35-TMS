export default {
  name: "verify:per-entity-catalog-parity-seed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-per-entity-catalog-parity-seed.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-per-entity-catalog-parity-seed.mjs"]);
  },
};
