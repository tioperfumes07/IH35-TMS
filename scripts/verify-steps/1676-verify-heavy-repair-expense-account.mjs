// Rule 17 — ND-FA-01 A4-D2 Heavy Repair Expense CoA (Cursor even band).
export default {
  name: "heavy-repair-expense-account",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-heavy-repair-expense-account.mjs", "--selftest"]) !== 0) return 1;
    if (ctx.run("node", ["scripts/verify-heavy-repair-expense-account.mjs"]) !== 0) return 1;
    return 0;
  },
};
