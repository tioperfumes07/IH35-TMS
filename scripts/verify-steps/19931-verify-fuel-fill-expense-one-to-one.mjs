// CC-2 ENG-48 — fuel fill → expense one-to-one ratchet engine:
// ratchet ceilings for fills missing JE, missing expense, or multiple expenses.
export default {
  name: "verify:verify-fuel-fill-expense-one-to-one",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-fill-expense-one-to-one.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-fill-expense-one-to-one.mjs"]);
  },
};
