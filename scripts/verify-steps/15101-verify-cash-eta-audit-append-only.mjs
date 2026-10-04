export default {
  name: "verify:cash-eta-audit-append-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-eta-audit-append-only.mjs"]);
  },
};
