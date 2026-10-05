export default {
  name: "verify:account-filters-are-multi-select",
  run(ctx) {
    ctx.run("node", ["scripts/verify-account-filters-are-multi-select.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-account-filters-are-multi-select.mjs"]);
  },
};
