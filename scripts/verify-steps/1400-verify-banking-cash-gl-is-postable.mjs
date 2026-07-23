/** Cursor lane verify-step 1400 — cash-GL is_postable enforcement. */
export default {
  name: "verify-banking-cash-gl-is-postable",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-banking-cash-gl-is-postable.mjs"]);
  },
};
