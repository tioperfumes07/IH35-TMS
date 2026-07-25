// BANK-ECON-03 / BANK-SURF-03 — markBankFeedLineAsTransfer() mint path wired (#3445 on main);
// banking.json stays FAIL with transfers=0 honesty until operator use.
export default {
  name: "verify:bank-econ-03-transfer-path-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-econ-03-transfer-path-wired.mjs"]);
  },
};
