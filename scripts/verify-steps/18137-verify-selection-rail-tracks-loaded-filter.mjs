export default {
  name: "verify:selection-rail-tracks-loaded-filter",
  run(ctx) {
    // LST-F400 (owner 2026-10-04): Reclassify promoted out of "More" into the Accounting tab row, and
    // "WHEN SELECTING AN ACCOUNT IN THE LEFT SIDE ... THAT ACCOUNT MUST STAY HIGHLIGHTED" — a
    // selection rail must highlight from the APPLIED filter the query runs on, never the draft.
    ctx.run("node", ["scripts/verify-selection-rail-tracks-loaded-filter.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-selection-rail-tracks-loaded-filter.mjs"]);
  },
};
