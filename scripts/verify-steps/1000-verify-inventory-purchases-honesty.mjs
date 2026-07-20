export default {
  name: "verify:inventory-purchases-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-inventory-purchases-honesty.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-inventory-purchases-honesty.mjs"]);
  },
};
