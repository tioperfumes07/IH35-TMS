export default {
  name: "verify-document-links-enforced-at-db",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-document-links-enforced-at-db.mjs", "--selftest"]);
    // Live arm (0 USMCA violating rows + triggers enabled) runs in required-live-load-guard / LIVE_DOMAIN_GUARDS.
  },
};
