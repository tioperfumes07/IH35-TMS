// verify-invoice-gl-respects-revrec-latch — ACCT-F205 (P0).
//
// Two posters wrote A/R and revenue for the same load and nothing stopped them running both. The
// two-event delivery latch posts earn (DR Unbilled / CR Income) then bill (DR A/R / CR Unbilled), so
// once `bill` has fired the freight is fully on the books — and postInvoiceGlIfEnabled then posted
// DR ar_control / CR revenue for that same freight. Measured on prod, load L-20260806-0008: A/R and
// revenue each carried $1,875.50 TWICE.
//
// THE CONTROL EXISTED ONLY AS PROSE. The latch poster's header says to keep INVOICE_AR_GL_POSTING_ENABLED
// off while the latch is on. Nothing checked it, both flags were ON for USMCA and TRANSP, and revenue
// double-recognized silently. A flag convention that nothing enforces is not a control — this step is
// the enforcement, and leaving it unwired would repeat that exact mistake one level up.
//
// The selftest runs first and asserts BOTH halves: that the interlock exists, and that it excludes
// REVERSED/voided latch JEs. The second half is not optional — a naive `event='bill' EXISTS` check
// would refuse that load's invoice forever once the latch was reversed, trading one silent money bug
// for another. That trap is named by number in the latch poster's own header (ACCT-F59).
export default {
  name: "verify:invoice-gl-respects-revrec-latch",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-gl-respects-revrec-latch.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-invoice-gl-respects-revrec-latch.mjs"]);
  },
};
