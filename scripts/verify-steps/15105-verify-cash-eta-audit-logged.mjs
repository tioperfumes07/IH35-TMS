export default {
  name: "verify:cash-eta-audit-logged",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-eta-audit-logged.mjs"]);
  },
};
