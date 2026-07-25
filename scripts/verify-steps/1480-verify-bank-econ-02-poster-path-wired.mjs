// BANK-ECON-02 / BANK-SURF-02 — bulk categorize→GL poster path wired (#3424 on main);
// banking.json stays FAIL with ops-backlog honesty (no invented density PASS).
export default {
  name: "verify:bank-econ-02-poster-path-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-econ-02-poster-path-wired.mjs"]);
  },
};
