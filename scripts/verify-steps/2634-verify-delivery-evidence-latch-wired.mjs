// verify-delivery-evidence-latch-wired — CLS-DISP-WIRE-07. The office transition latched revenue on
// delivered_pending_docs; the driver capture paths and the mdata status PATCH set the SAME status
// with a bare UPDATE and never latched, so the only party who actually delivers could not trigger
// recognition and hops 4→9 could not flow from field activity. Scans for the SHAPE so a fourth
// delivery path is caught on arrival. Selftest first — a stale matcher must fail loudly.
export default {
  name: "verify:delivery-evidence-latch-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-delivery-evidence-latch-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-delivery-evidence-latch-wired.mjs"]);
  },
};
