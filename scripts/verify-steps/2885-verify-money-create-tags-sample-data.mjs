// verify-money-create-tags-sample-data — ACCT-F208 (ratchet).
//
// Migration 202612370000 added is_sample_data to seven money tables so that "is this row real money?"
// is a STRUCTURED question rather than a LIKE '%SAMPLE%' guess. Its own header said what it left
// undone: deriving the value on write "is application work and ships with its guard". That work was
// never finished — the column exists on prod and ZERO rows are tagged, while twelve rows carry the
// Gate-B marker in their own free text and say is_sample_data = false. The memo says SAMPLE and the
// boolean says REAL, and at go-live "exclude sample rows" is a query on the boolean.
//
// This is a RATCHET, not a mass fix. Wiring every create path needs each CALLER to supply the value;
// done carelessly it would tag nothing (no better) or tag by string-matching a memo (exactly what the
// column replaced). So the known paths are frozen and boarded, and no NEW money-create path may forget
// the column. The baseline should only ever FALL — it has already gone 44 -> 42 as F212 and F213 wired
// the canonical poster and the settlement poster.
//
// QBO and seed importers are EXEMPT BY DESIGN: 27,070 of 27,075 expenses on prod are QBO clones, and
// tagging real financial history as test data is a worse defect than the one being fixed.
export default {
  name: "verify:money-create-tags-sample-data",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-money-create-tags-sample-data.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-money-create-tags-sample-data.mjs"]);
  },
};
