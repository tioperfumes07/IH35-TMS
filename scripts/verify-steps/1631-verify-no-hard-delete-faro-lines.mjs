/** F9-03 — never hard-DELETE factor.faro_invoice_lines on daily re-import. */
export default {
  name: "verify-no-hard-delete-faro-lines",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-hard-delete-faro-lines.mjs"]);
    await ctx.run("node", ["scripts/verify-no-hard-delete-faro-lines.mjs", "--selftest"]);
    // ACCT-F154 — a QBO document importer must project its LINES, not just the header.
    // ACCT-F144 measured the asymmetry on prod: AP imported completely (16,245 bills, zero
    // lineless) while AR imported HEADERS ONLY — 11,976 of 11,976 cloned invoices had no lines,
    // silently, because a line-level report returning zero looks like a business with no data.
    // ACCT-F146 back-filled them; a back-fill does not fix an importer, so the next re-clone
    // would have undone it. This keeps the importer and the back-fill from being separated.
    // Hosted here (line-integrity family) because Rule 37 requires a new step number be claimed
    // on main first and CLAIMED-NUMBERS.json is held by another open PR (Rule 26).
    await ctx.run("node", ["scripts/verify-qbo-pullers-project-lines.mjs"]);
    await ctx.run("node", ["scripts/verify-qbo-pullers-project-lines.mjs", "--selftest"]);

  },
};
