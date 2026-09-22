/**
 * ROUND 31.2/32.2 Part C — wires scripts/verify-no-voided-doc-has-live-postings.mjs (the shrink-
 * only ratchet on documents whose status is void/voided but still carry a live GL posting) into
 * CI. Verify-step 11565, CC-1 band.
 */
export default {
  name: "verify-no-voided-doc-has-live-postings",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-voided-doc-has-live-postings.mjs"]);
  },
};
