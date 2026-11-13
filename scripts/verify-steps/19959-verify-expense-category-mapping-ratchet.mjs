export default {
  name: "verify:verify-expense-category-mapping-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-category-mapping-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-category-mapping-ratchet.mjs"]);
  },
};
