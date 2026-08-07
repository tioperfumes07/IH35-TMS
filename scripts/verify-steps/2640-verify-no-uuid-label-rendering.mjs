// verify-no-uuid-label-rendering — CLS-UUID-LABEL. A human-facing link must never be LABELLED with a
// raw or truncated uuid: an operator cannot act on `a3f9c21b`, so the link is decoration and the
// record is unreachable. Baseline ratchet (164 known offenders across 97 files) — NEW ones fail, the
// list may only shrink. Selftest first so a stale matcher fails loudly instead of passing vacuously.
export default {
  name: "verify:no-uuid-label-rendering",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-uuid-label-rendering.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-uuid-label-rendering.mjs"]);
  },
};
