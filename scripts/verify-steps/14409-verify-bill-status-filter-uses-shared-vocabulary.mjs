export default {
  name: "verify:bill-status-filter-uses-shared-vocabulary",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-status-filter-uses-shared-vocabulary.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bill-status-filter-uses-shared-vocabulary.mjs"]);
  },
};
