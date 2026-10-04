export default {
  name: "verify:expense-class-id-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-class-id-parity.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-class-id-parity.mjs"]);
  },
};
