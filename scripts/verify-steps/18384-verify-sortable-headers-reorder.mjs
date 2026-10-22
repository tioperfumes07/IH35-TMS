/**
 * ROUND 443.231 — claimed EVEN step 18384 (PR #27144 claim-reserve on main).
 * Wires scripts/verify-sortable-headers-reorder.mjs into CI (Rule 37 — claim before author).
 */
export default {
  name: "verify-sortable-headers-reorder",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-sortable-headers-reorder.mjs"]);
  },
};
