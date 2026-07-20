// 0441-mod10-settlement-line-ui-nonexistent-colu — Loads column must bind real load_count.
export default {
  name: "settlements-table-no-phantom-loads",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-table-no-phantom-loads.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlements-table-no-phantom-loads.mjs"]);
  },
};
