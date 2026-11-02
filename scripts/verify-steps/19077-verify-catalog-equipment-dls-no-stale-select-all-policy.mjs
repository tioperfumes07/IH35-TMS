export default {
  name: "verify:catalog-equipment-dls-no-stale-select-all-policy",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-equipment-dls-no-stale-select-all-policy.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-catalog-equipment-dls-no-stale-select-all-policy.mjs"]);
  },
};
