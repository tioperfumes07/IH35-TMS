// verify-flag-honesty-banner-reads-flag — ACCT-F176 / CLS-BANNER-ASSERTS-UNREAD-FLAG.
// Two Banking banners told the operator what a GL-posting flag was doing, from LITERALS. Both flags
// (BANK_FEED_GL_POSTING_ENABLED, TRANSFER_GL_POSTING_ENABLED) have default_enabled=false and a
// per-entity override of TRUE for all three companies, so "stays OFF by default" was wrong for every
// real operator — and categorizing one row provably created a balanced JE. Asserts that a banner
// naming a flag also READS it via useFeatureFlag. Selftest first, incl. a mutation of the real file.
export default {
  name: "verify:flag-honesty-banner-reads-flag",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-flag-honesty-banner-reads-flag.mjs"]);
  },
};
