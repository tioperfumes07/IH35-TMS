/** CC-2-INSTRUCTIONS-09-02-2026.txt tasks 1-5, 19-20 — Book Load wizard money-path guard: a
 * negative accessorial (discount, rate reduction, chargeback, TONU offset) must reach the invoice
 * charge lines uncapped; linehaul/fuel surcharge still clamp to 0 but must raise a blocking field
 * error, not silently accept the typo; the "Invoice total" label must bind to customerInvoiceTotal
 * (sectionTotal + extraRatesCents), not sectionTotal alone; MoneyInput/NumberInput stay h-7 with
 * tabular-nums. The guard file itself predates this wiring (Cursor, #19985) but was claimed wired
 * via locked-guards.yml and never actually was -- confirmed absent there before adding this real
 * registration. Extended, not replaced: same file, same --selftest harness, now 9/9. */
export default {
  name: "verify-book-load-money-and-controls",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-money-and-controls.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-book-load-money-and-controls.mjs"]);
  },
};
