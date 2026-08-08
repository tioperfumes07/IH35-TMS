// verify-bill-display-id-stamped — ACCT-F186 (board card LV-BILL-NO-DISPLAY-ID).
//
// Bills were the ONLY money document with no human-readable identifier: TMS-native 0 of 13 on prod,
// against invoices 6 of 6 and payments 2 of 2. (The 16,245 QBO clones are excluded — their NULL is
// expected state under parallel books.) A bill is what you argue about with a vendor, attach to an
// approval, cite in a dispute and hand an auditor.
//
// Selftest first. Two of its five mutations exist for failure modes that would leave the feature
// LOOKING correct: dropping the TMS-native restriction (which would invent identifiers for QBO
// documents this system never issued) and dropping the advisory lock (which lets two concurrent
// creates race to the same number and put a DUPLICATE human id in front of an auditor).
export default {
  name: "verify:bill-display-id-stamped",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-display-id-stamped.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bill-display-id-stamped.mjs"]);
  },
};
