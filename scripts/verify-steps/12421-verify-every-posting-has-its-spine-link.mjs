// ROUND 373.3 (CC-1): every posting names its document. Selftest of the shrink-only ceiling / since-cutoff / armed-trigger
// rules, then the live run against whatever database the runner provides (a fresh verify DB has no USMCA postings:
// 0 unlinked, which the ratchet reports — the live proof is the production run in the money gate).
export default {
  name: "verify-every-posting-has-its-spine-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-every-posting-has-its-spine-link.mjs", "--selftest"]);
  },
};
