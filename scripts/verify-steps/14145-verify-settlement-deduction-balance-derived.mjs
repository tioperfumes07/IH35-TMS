export default {
  name: "verify:settlement-deduction-balance-derived",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-deduction-balance-derived.mjs"]);
  },
};
