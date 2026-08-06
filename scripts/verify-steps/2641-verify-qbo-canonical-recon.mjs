// verify-qbo-canonical-recon — CLS-DUAL-PATH. accounting.qbo_* ENTITY mirrors are RETIRE and run
// ~1,000 rows behind; canonical is the INBOUND mdata clone set. Bills/invoices resolve to
// qbo_ap_bills / qbo_ar_invoices, NOT mdata.qbo_bills/qbo_invoices — those are outbound write-back
// staging and are empty BY DESIGN. Selftest first.
export default {
  name: "verify:qbo-canonical-recon",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-canonical-recon.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-canonical-recon.mjs"]);
  },
};
