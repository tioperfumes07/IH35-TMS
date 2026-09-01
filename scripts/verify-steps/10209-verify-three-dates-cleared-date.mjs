// THREE-DATES-COVERAGE-GAP (owner ruling 2026-09-01). Step 10209 · CC-1 lane.
export default {
  name: "three-dates-cleared-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-three-dates-cleared-date.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-three-dates-cleared-date.mjs"]);
  },
};
