export default {
  name: "verify:auto-deduction-applies-to-next-settlement",
  run(ctx) {
    ctx.run("node", ["scripts/verify-auto-deduction-applies-to-next-settlement.mjs"]);
  },
};
