export default {
  name: "verify:banking-drift-board-one-row-per-account",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-drift-board-one-row-per-account.mjs"]);
    ctx.run("node", ["scripts/verify-banking-drift-board-one-row-per-account.mjs", "--selftest"]);
  },
};
