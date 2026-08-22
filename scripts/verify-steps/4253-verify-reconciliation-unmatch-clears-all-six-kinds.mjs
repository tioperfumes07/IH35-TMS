export default {
  name: "verify:reconciliation-unmatch-clears-all-six-kinds",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reconciliation-unmatch-clears-all-six-kinds.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reconciliation-unmatch-clears-all-six-kinds.mjs"]);
  },
};
