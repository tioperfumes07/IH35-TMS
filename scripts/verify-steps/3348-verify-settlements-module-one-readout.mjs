export default {
  name: "verify:settlements-module-one-readout",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-module-one-readout.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlements-module-one-readout.mjs"]);
    // BANK-F91507 — SettlementsPage leftover #64748b DataPanel accent refuse (this EVEN host already owns the live guard).
    // BANK-F91540 — SettlementsPage leftover text-slate-* / border-slate-* / bg-slate-* → house tokens
    // BANK-F91148 piggy — BankTieoutHeader/VendorWorkOrders/VendorFuelCards reverse slate leftover refuse
    ctx.run("node", ["scripts/verify-91148-tieout-vend-reverse-slate-leftover-chrome.mjs"]);
  },
};
