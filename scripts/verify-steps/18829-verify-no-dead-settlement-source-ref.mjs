// ENG-46 (443.328): USMCA driver_settlements source_document_ref must resolve to a real USMCA load.
// Shrink-only ratchet; ceiling 93 measured 2026-10-25.
// CC-1 band (mod4=1), claimed 2026-10-25 as 18829.
export default {
  name: "verify-no-dead-settlement-source-ref",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-dead-settlement-source-ref.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-dead-settlement-source-ref.mjs"]);
  },
};
