/**
 * ROUND 300 B-34 (Lead order): tied out the Factoring Reserve / Driver Escrow virtual ledgers
 * against their real-world sub-ledger counterparts. This ratchets the measured gap so it can't
 * silently widen. Verify-step 11975, CC-2 band (mod-4 ≡3).
 */
export default {
  name: "verify-factoring-reserve-escrow-subledger-gap",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-reserve-escrow-subledger-gap.mjs"]);
  },
};
