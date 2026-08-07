// Invoice revenue may only credit an income-typed account. A prod item maps default_income_account_id
// to a LIABILITY; unconstrained, an invoice on it would post balanced-but-wrong. Step 2553 · CC-1 lane.
export default {
  name: "revenue-resolves-to-income-account",
  run(ctx) {
    ctx.run("node", ["scripts/verify-revenue-resolves-to-income-account.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-revenue-resolves-to-income-account.mjs"]);
  },
};
