// verify-i18n-hardcoded-english-safety — §9.0 item 17 pattern sweep
export default {
  name: "verify:i18n-hardcoded-english-safety",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-i18n-hardcoded-english-safety.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-i18n-hardcoded-english-safety.mjs"]);
  },
};
