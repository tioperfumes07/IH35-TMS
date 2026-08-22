export default {
  name: "verify:per-entity-catalog-no-stray-legacy-policy",
  run(ctx) {
    ctx.run("node", ["scripts/verify-per-entity-catalog-no-stray-legacy-policy.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-per-entity-catalog-no-stray-legacy-policy.mjs"]);
  },
};
