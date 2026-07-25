export default {
  name: "verify:expense-categories-consumer-fk",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-categories-consumer-fk.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expense-categories-consumer-fk.mjs"]);
  },
};
