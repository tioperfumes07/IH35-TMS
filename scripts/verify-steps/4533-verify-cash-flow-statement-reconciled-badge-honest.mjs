export default {
  name: "verify:cash-flow-statement-reconciled-badge-honest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-statement-reconciled-badge-honest.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-statement-reconciled-badge-honest.mjs"]);
  },
};
