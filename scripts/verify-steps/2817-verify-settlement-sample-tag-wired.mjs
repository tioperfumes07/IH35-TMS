// verify-settlement-sample-tag-wired — SETTLEMENT-SAMPLE-TAG-NO-PATH.
// driver_finance.driver_settlements is the ONE money create type with no writable free-text column
// (prod: 54 cols, zero is_sample_data, zero memo/notes/description/internal_notes), so a Gate-B sample
// settlement was an UNTAGGED live financial record that no purge query could find by tag. Migration
// 202612350000 adds is_sample_data — but the column alone is decoration: FOUR production writers insert
// into this table, not the one the sample-tag evidence doc named (at a path that does not exist). Patch
// one and three keep writing untagged rows while the column's existence convinces everyone the gap is
// closed, which is worse than no column. This asserts every production INSERT names the column, so a
// fifth writer cannot silently reintroduce it. Selftest plants the real defect and demands RED.
export default {
  name: "verify:settlement-sample-tag-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-sample-tag-wired.mjs"]);
  },
};
