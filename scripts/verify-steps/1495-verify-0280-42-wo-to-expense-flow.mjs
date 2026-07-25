export default {
  name: "verify:0280-42-wo-to-expense-flow",
  run(ctx) {
    ctx.run("node", ["scripts/verify-0280-42-wo-to-expense-flow.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-0280-42-wo-to-expense-flow.mjs"]);
  },
};
