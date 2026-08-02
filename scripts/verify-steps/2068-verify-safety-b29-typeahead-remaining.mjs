// SAF-B29 wave 3 — remaining Safety limit:200 driver rosters (Cursor EVEN band).
export default {
  name: "safety-b29-typeahead-remaining",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-b29-typeahead-remaining.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-b29-typeahead-remaining.mjs"]);
  },
};
