// 2026-10-04 (CC-3): settlement EXPENSES rows reach the load the signed document proves and carry its printed receipt;
// an unproven row is refused, never dropped on the last load the FUEL section printed.
export default {
  name: "verify:feed-expense-load-by-proof",
  run(ctx) {
    ctx.run("node", ["scripts/verify-feed-expense-load-by-proof.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-feed-expense-load-by-proof.mjs"]);
  },
};
