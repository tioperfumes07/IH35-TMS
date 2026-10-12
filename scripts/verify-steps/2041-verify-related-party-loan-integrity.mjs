export default {
  name: "verify-related-party-loan-integrity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-related-party-loan-integrity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-related-party-loan-integrity.mjs"]);
    // RULING 443.65 #2d — the party ledger = its GL account, per party; no party posting without its party entity.
    await ctx.run("node", ["scripts/verify-party-ledger-sums-to-gl-account.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-party-ledger-sums-to-gl-account.mjs"]);
    // LEAD 443.134 #1 — one writer of a related party's running "Due to / from" account.
    await ctx.run("node", ["scripts/verify-related-party-account-one-writer.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-related-party-account-one-writer.mjs"]);
    // RULING 443.59 — non-opco Relay deposits must be refused (not posted) when they hit a party account.
    await ctx.run("node", ["scripts/verify-relay-deposit-no-party-refused.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-relay-deposit-no-party-refused.mjs"]);
    // 443.35–443.55 load-lifecycle guards (CC-2 book-load + stop-resolve + miles + geofence): wired here
    // so the orphan census (verify-wiring-law-guard-registry-batch) reads ≤3, per 443.72 item 2.
    await ctx.run("node", ["scripts/verify-booked-loads-save-miles.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-booked-stop-street-or-google-no-result.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-delivered-load-stops-terminal.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-miles-source-recorded.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-haversine-leg-miles.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-relay-fill-expense-settlement-ref.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-stops-resolve-samsara-no-zip-fence.mjs", "--selftest"]);
  },
};
