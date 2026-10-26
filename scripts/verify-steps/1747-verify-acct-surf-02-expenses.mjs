// Step 1747 — ACCT-SURF-02: Expenses deep structural DoD (route + ParityDrawer create chrome +
// payload + canonical accounting.expenses INSERT + EntityLink vendor/journal_entry/expense).
// Rule 17: guards wire ONLY through scripts/verify-steps/NNNN-*.mjs.
export default {
  name: "verify-acct-surf-02-expenses",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf-02-expenses.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-surf-02-expenses.mjs"]);
    // 443.293-C — money-list BoardSection ratchet (Expenses sibling; no new CLAIMED number on feature PR).
    await ctx.run("node", ["scripts/verify-acct-220-money-list-boards.mjs"]);
    // 443.293-C — Accounting tools tabs (Reclassify/Batch/Escrow) BoardSection + Factoring FORM_INPUT
    await ctx.run("node", ["scripts/verify-acct-220-tools-boards.mjs"]);
    // Horizontal fill — Settlements detail sections + remaining Accounting registers BoardSection
    await ctx.run("node", ["scripts/verify-fill-remaining-boards-batch.mjs"]);
    // Batch 2 — Collections / Vendor balances / Company waterfall / Import fuel
    await ctx.run("node", ["scripts/verify-fill-batch2-boards.mjs"]);
  },
};
